import json
import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from portal.models import Account, Contract, Delivery, Inquiry
from storage.models import Activity


@override_settings(DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   DEFAULT_FROM_EMAIL='sender@gmail.com', INQUIRY_TO_EMAIL='operator@example.com',
                   INQUIRY_TRUST_PROXY_HEADER=False,
                   CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class InquiryTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get('/api/inquiries/csrf/').json()['csrfToken']
        self.data = {'request_key': str(uuid.uuid4()), 'name': 'A Customer', 'email': 'customer@example.com',
                     'zip_code': '78610', 'plan': 'small', 'description': 'Holiday lights and winter coats',
                     'phone': '', 'reply_method': 'email', 'source': 'pricing-small', 'context': 'general', 'website': ''}

    def post(self, data=None, **headers):
        return self.client.post('/api/inquiries/', json.dumps(self.data if data is None else data),
                                content_type='application/json', HTTP_X_CSRFTOKEN=self.token, **headers)

    def test_valid_inquiry_is_delivered_once_with_private_receipt_and_reply_to(self):
        response = self.post()
        self.assertEqual(response.status_code, 201)
        inquiry = Inquiry.objects.get()
        self.assertEqual(inquiry.delivery_status, 'sent')
        self.assertEqual(response.json()['reference'], f'TK-{inquiry.reference}')
        self.assertEqual(len(mail.outbox), 1)
        notification = mail.outbox[0]
        self.assertEqual(notification.from_email, 'sender@gmail.com')
        self.assertEqual(notification.to, ['operator@example.com'])
        self.assertEqual(notification.reply_to, ['customer@example.com'])
        for value in ['Holiday lights', '78610', 'pricing-small', 'small', inquiry.created_at.isoformat(), str(inquiry.reference)]:
            self.assertIn(value, notification.body)
        self.assertEqual(get_user_model().objects.count(), 0)
        self.assertEqual(Account.objects.count() + Contract.objects.count() + Delivery.objects.count(), 0)
        audit = str(list(Activity.objects.values('before', 'after', 'reason')))
        self.assertNotIn(self.data['email'], audit)
        self.assertNotIn(self.data['description'], audit)
        self.assertIn('no-store', response['Cache-Control'])

    def test_same_request_key_reuses_receipt_without_resending(self):
        first = self.post()
        second = self.post()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(Inquiry.objects.count(), 1)
        self.data['description'] = 'Changed storage contents'
        self.assertEqual(self.post().status_code, 409)
        self.assertEqual(len(mail.outbox), 1)

    def test_invalid_fields_and_oversized_body_are_rejected(self):
        for changes in [{'email': 'bad'}, {'name': ''}, {'zip_code': 'not-a-zip'}, {'plan': 'invented'},
                        {'description': 'x'*1001}, {'description': 'Hidden\x00text'}, {'name': ['Not', 'text']}, {'source': 'https://example.com/private'},
                        {'phone': '', 'reply_method': 'text'}, {'phone': '\r\nBad: header'}, {'name': 'Bad\r\nHeader'}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.post({**self.data, **changes}).status_code, 400)
        self.assertEqual(self.post({**self.data, 'description': 'x'*9000}).status_code, 413)
        self.assertEqual(Inquiry.objects.count(), 0)

    def test_csrf_and_honeypot_rejected_without_sending(self):
        rejected = self.client.post('/api/inquiries/', json.dumps(self.data), content_type='application/json')
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(self.post({**self.data, 'website': 'spam'}).status_code, 400)
        self.assertEqual(Inquiry.objects.count(), 0)

    def test_provider_failure_is_honest_durable_and_not_retried(self):
        with patch('portal.inquiries.EmailMessage.send', side_effect=RuntimeError('secret-provider-body')) as send:
            first = self.post()
            self.assertEqual(first.status_code, 503)
            self.assertNotIn('secret-provider-body', first.content.decode())
            self.assertEqual(Inquiry.objects.get().delivery_status, 'failed')
            second = self.post()
            self.assertEqual(second.status_code, 503)
            self.assertEqual(send.call_count, 1)

    def test_unconfigured_provider_or_inbox_cannot_report_success(self):
        for settings in [{'INQUIRY_TO_EMAIL': ''}, {'EMAIL_BACKEND': 'django.core.mail.backends.console.EmailBackend'},
                         {'EMAIL_BACKEND': 'config.gmail.GmailAPIBackend', 'GMAIL_REFRESH_TOKEN': ''}]:
            cache.clear()
            with self.subTest(settings=settings), override_settings(**settings):
                self.assertEqual(self.post().status_code, 503)
        self.assertEqual(Inquiry.objects.count(), 0)

    def test_provider_zero_acceptances_is_failure(self):
        with patch('portal.inquiries.EmailMessage.send', return_value=0):
            self.assertEqual(self.post().status_code, 503)
        self.assertEqual(Inquiry.objects.get().delivery_status, 'failed')

    def test_in_progress_receipt_cannot_trigger_a_second_email(self):
        self.post()
        Inquiry.objects.update(delivery_status='sending')
        with patch('portal.inquiries.EmailMessage.send') as send:
            self.assertEqual(self.post().status_code, 503)
            send.assert_not_called()

    def test_rate_limits_ignore_untrusted_forwarded_headers(self):
        for index in range(5):
            data = {**self.data, 'request_key': str(uuid.uuid4()), 'email': f'customer{index}@example.com'}
            self.assertEqual(self.post(data, HTTP_X_TOTEKEEPER_CLIENT_IP=f'198.51.100.{index}').status_code, 201)
        response = self.post({**self.data, 'request_key': str(uuid.uuid4()), 'email': 'last@example.com'})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response['Retry-After'], '900')

    def test_per_email_rate_limit_applies_across_client_addresses(self):
        for index in range(3):
            self.assertEqual(self.post({**self.data, 'request_key': str(uuid.uuid4())}, REMOTE_ADDR=f'198.51.100.{index}').status_code, 201)
        self.assertEqual(self.post({**self.data, 'request_key': str(uuid.uuid4())}, REMOTE_ADDR='198.51.100.99').status_code, 429)

    def test_phone_reply_is_inquiry_preference_only_and_zip_does_not_enroll(self):
        self.data.update(phone='+1 (555) 123-4567', reply_method='text', zip_code='99999', context='summer', source='summer')
        self.assertEqual(self.post().status_code, 201)
        self.assertIn('Preferred reply: text', mail.outbox[0].body)
        self.assertEqual(Contract.objects.count(), 0)
