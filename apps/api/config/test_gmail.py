import base64
import os
import subprocess
import sys
from pathlib import Path
from email import message_from_bytes
from unittest.mock import Mock, patch

import requests
from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings
from .gmail import GmailAPIBackend, GmailDeliveryError, SEND_URL, TOKEN_URL


def response(status=200, payload=None):
    return Mock(status_code=status, json=Mock(return_value=payload))


@override_settings(
    GMAIL_CLIENT_ID='client-fixture', GMAIL_CLIENT_SECRET='secret-fixture',
    GMAIL_REFRESH_TOKEN='refresh-fixture', DEFAULT_FROM_EMAIL='sender@gmail.com', EMAIL_TIMEOUT=10,
)
class GmailTransportTests(SimpleTestCase):
    def message(self):
        return EmailMessage('Verification', 'Private verification link', 'sender@gmail.com', ['customer@example.com'])

    @patch('config.gmail.requests.post')
    def test_mime_recipient_privacy_and_cached_token(self, post):
        post.side_effect = [response(payload={'access_token': 'token-fixture', 'expires_in': 3600}), response(), response()]
        message = EmailMultiAlternatives('Verify', 'Text', 'sender@gmail.com', ['to@example.com'],
                                        cc=['cc@example.com'], bcc=['private@example.com'], reply_to=['reply@example.com'])
        message.attach_alternative('<p>Verify</p>', 'text/html')
        message.attach('terms.txt', 'Terms', 'text/plain')
        self.assertEqual(GmailAPIBackend().send_messages([message, self.message()]), 2)
        self.assertEqual(post.call_count, 3)
        refresh = post.call_args_list[0]
        self.assertEqual(refresh.args[0], TOKEN_URL)
        self.assertEqual(refresh.kwargs['data']['grant_type'], 'refresh_token')
        send = post.call_args_list[1]
        self.assertEqual(send.args[0], SEND_URL)
        self.assertEqual(send.kwargs['headers']['Authorization'], 'Bearer token-fixture')
        self.assertFalse(send.kwargs['allow_redirects'])
        self.assertEqual(send.kwargs['timeout'], 10)
        mime = message_from_bytes(base64.urlsafe_b64decode(send.kwargs['json']['raw']))
        self.assertEqual(mime['Bcc'], 'private@example.com')
        self.assertEqual(mime['Cc'], 'cc@example.com')
        self.assertEqual(mime['Reply-To'], 'reply@example.com')
        self.assertIn('text/html', [part.get_content_type() for part in mime.walk()])
        self.assertIn('terms.txt', [part.get_filename() for part in mime.walk()])

    @patch('config.gmail.requests.post')
    def test_rejected_access_token_refreshed_once(self, post):
        post.side_effect = [response(payload={'access_token': 'old', 'expires_in': 3600}), response(401),
                            response(payload={'access_token': 'new', 'expires_in': 3600}), response()]
        self.assertEqual(GmailAPIBackend().send_messages([self.message()]), 1)
        self.assertEqual(post.call_count, 4)
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer new')

    @patch('config.gmail.requests.post')
    def test_revoked_refresh_token_fails_without_disclosing_credentials(self, post):
        post.return_value = response(400, {'error_description': 'secret-fixture private verification link'})
        with self.assertRaises(GmailDeliveryError) as failure:
            GmailAPIBackend().send_messages([self.message()])
        self.assertNotIn('secret-fixture', str(failure.exception))
        self.assertNotIn('verification link', str(failure.exception))
        self.assertEqual(post.call_count, 1)

    @patch('config.gmail.requests.post')
    def test_send_failure_not_retried_blindly(self, post):
        post.side_effect = [response(payload={'access_token': 'token', 'expires_in': 3600}), response(503)]
        with self.assertRaises(GmailDeliveryError):
            GmailAPIBackend().send_messages([self.message()])
        self.assertEqual(post.call_count, 2)

    @patch('config.gmail.requests.post')
    def test_network_failure_is_redacted_and_can_be_silenced(self, post):
        post.side_effect = requests.Timeout('secret-fixture')
        with self.assertRaisesMessage(GmailDeliveryError, 'Gmail HTTPS connection failed'):
            GmailAPIBackend().send_messages([self.message()])
        self.assertEqual(GmailAPIBackend(fail_silently=True).send_messages([self.message()]), 0)

    @patch('config.gmail.requests.post')
    def test_sender_mismatch_and_empty_recipients_do_not_call_google(self, post):
        self.assertEqual(GmailAPIBackend().send_messages([EmailMessage(to=[])]), 0)
        message = self.message()
        message.from_email = 'other@gmail.com'
        with self.assertRaises(GmailDeliveryError):
            GmailAPIBackend().send_messages([message])
        post.assert_not_called()

    @patch('config.gmail.requests.post')
    def test_invalid_oauth_response_is_redacted(self, post):
        post.return_value = response(payload={'unexpected': 'secret-fixture'})
        with self.assertRaisesMessage(GmailDeliveryError, 'invalid token response'):
            GmailAPIBackend().send_messages([self.message()])


class GmailProductionSettingsTests(SimpleTestCase):
    def environment(self):
        env = os.environ.copy()
        env.update(DEBUG='false', SECRET_KEY='x'*64, POSTGRES_PASSWORD='fixture',
                   ALLOWED_HOSTS='portal.example.com', CSRF_TRUSTED_ORIGINS='https://portal.example.com',
                   MFA_ENCRYPTION_KEY='MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
                   PUBLIC_BASE_URL='https://portal.example.com', STRIPE_SECRET_KEY='sk_test_fixture',
                   STRIPE_WEBHOOK_SECRET='whsec_fixture', EMAIL_BACKEND='config.gmail.GmailAPIBackend',
                   DEFAULT_FROM_EMAIL='sender@gmail.com', EMAIL_HOST='', GMAIL_CLIENT_ID='client-fixture',
                   GMAIL_CLIENT_SECRET='secret-fixture', GMAIL_REFRESH_TOKEN='refresh-fixture')
        return env

    def check_settings(self, env):
        return subprocess.run([sys.executable, '-c', 'import config.settings'], env=env, cwd=Path(__file__).resolve().parents[1], capture_output=True, timeout=10)

    def test_gmail_production_does_not_require_smtp(self):
        result = self.check_settings(self.environment())
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_oauth_configuration_fails_closed(self):
        for key in ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']:
            env = self.environment()
            env[key] = ''
            self.assertNotEqual(self.check_settings(env).returncode, 0, key)

    def test_console_transport_still_rejected_in_production(self):
        env = self.environment()
        env['EMAIL_BACKEND'] = 'django.core.mail.backends.console.EmailBackend'
        self.assertNotEqual(self.check_settings(env).returncode, 0)

class GmailAuthorizationHelperTests(SimpleTestCase):
    def run_helper(self, directory, state='expected-state'):
        import importlib.util
        import io
        import json
        from contextlib import ExitStack
        from pathlib import Path
        from urllib.parse import parse_qs, urlsplit
        root = Path(__file__).resolve().parents[3]
        spec = importlib.util.spec_from_file_location('authorize_gmail', root / 'scripts/authorize_gmail.py')
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        client = Path(directory) / 'client.json'
        output = Path(directory) / '.env.gmail.local'
        client.write_text(json.dumps({'installed': {'client_id': 'client-fixture', 'client_secret': 'secret-fixture'}}))

        def server_factory(address, handler_type):
            self.assertEqual(address, ('127.0.0.1', 0))
            server = Mock(server_port=8765)
            server.__enter__ = Mock(return_value=server)
            server.__exit__ = Mock(return_value=False)

            def callback():
                handler = object.__new__(handler_type)
                handler.path = f'/?code=code-fixture&state={state}'
                handler.wfile = io.BytesIO()
                handler.send_response = Mock()
                handler.send_header = Mock()
                handler.end_headers = Mock()
                handler.do_GET()
            server.handle_request.side_effect = callback
            return server

        with ExitStack() as stack:
            stack.enter_context(patch.object(sys, 'argv', ['authorize_gmail.py', '--client-file', str(client), '--output', str(output)]))
            stack.enter_context(patch.object(helper.secrets, 'token_urlsafe', side_effect=['expected-state', 'verifier-fixture']))
            stack.enter_context(patch.object(helper, 'HTTPServer', side_effect=server_factory))
            stack.enter_context(patch.object(helper.time, 'monotonic', side_effect=[0, 0, 181]))
            browser = stack.enter_context(patch.object(helper.webbrowser, 'open'))
            exchange = stack.enter_context(patch.object(helper.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"refresh_token":"refresh-fixture"}')))
            printed = stack.enter_context(patch('builtins.print'))
            if state != 'expected-state':
                with self.assertRaises(SystemExit):
                    helper.main()
                exchange.assert_not_called()
                self.assertFalse(output.exists())
            else:
                helper.main()
                query = parse_qs(urlsplit(browser.call_args.args[0]).query)
                self.assertEqual(query['scope'], [helper.SCOPE])
                self.assertEqual(query['code_challenge_method'], ['S256'])
                self.assertEqual(query['access_type'], ['offline'])
                self.assertNotIn('client_secret', query)
                self.assertIn('GMAIL_REFRESH_TOKEN=refresh-fixture', output.read_text())
                self.assertNotIn('refresh-fixture', str(printed.call_args_list))
                self.assertNotIn('secret-fixture', str(printed.call_args_list))
                sent = parse_qs(exchange.call_args.args[0].data.decode())
                self.assertEqual(sent['code_verifier'], ['verifier-fixture'])

    def test_offline_pkce_authorization_saves_secrets_without_printing_them(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as directory:
            self.run_helper(directory)

    def test_wrong_oauth_state_cannot_exchange_code_or_save_credentials(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as directory:
            self.run_helper(directory, state='wrong-state')
