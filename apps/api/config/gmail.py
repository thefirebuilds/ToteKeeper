"""Django email transport using Gmail's send-only API over HTTPS."""
import base64
import threading
import time
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.message import sanitize_address

TOKEN_URL = 'https://oauth2.googleapis.com/token'
SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'


class GmailDeliveryError(Exception):
    """A redacted transport failure safe for the existing notification retry flow."""


class GmailAPIBackend(BaseEmailBackend):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._lock = threading.RLock()
        self._token = None
        self._expires_at = 0

    def _post(self, url, **kwargs):
        try:
            return requests.post(url, timeout=settings.EMAIL_TIMEOUT, allow_redirects=False, **kwargs)
        except requests.RequestException:
            # Never propagate provider response bodies, request headers or credentials.
            raise GmailDeliveryError('Gmail HTTPS connection failed; delivery is unconfirmed.') from None

    def _access_token(self):
        if self._token and time.monotonic() < self._expires_at:
            return self._token
        if not all([settings.GMAIL_CLIENT_ID, settings.GMAIL_CLIENT_SECRET, settings.GMAIL_REFRESH_TOKEN]):
            raise GmailDeliveryError('Gmail OAuth credentials are incomplete.')
        response = self._post(TOKEN_URL, data={
            'client_id': settings.GMAIL_CLIENT_ID,
            'client_secret': settings.GMAIL_CLIENT_SECRET,
            'refresh_token': settings.GMAIL_REFRESH_TOKEN,
            'grant_type': 'refresh_token',
        })
        if response.status_code != 200:
            raise GmailDeliveryError(f'Gmail OAuth refresh failed (HTTP {response.status_code}); check authorization.')
        try:
            payload = response.json()
            token = payload['access_token']
            lifetime = int(payload['expires_in'])
            if not isinstance(token, str) or not token or lifetime <= 0:
                raise ValueError
        except (ValueError, TypeError, KeyError):
            raise GmailDeliveryError('Gmail OAuth returned an invalid token response.') from None
        self._token = token
        self._expires_at = time.monotonic() + max(0, lifetime - 60)
        return token

    def _send(self, message):
        sender = parseaddr(message.from_email)[1].casefold()
        if not sender or sender != parseaddr(settings.DEFAULT_FROM_EMAIL)[1].casefold():
            raise GmailDeliveryError('Gmail sender must match DEFAULT_FROM_EMAIL and the authorized mailbox.')
        mime = message.message()
        if parseaddr(str(mime['From']))[1].casefold() != sender:
            raise GmailDeliveryError('Gmail MIME sender must match the configured sender.')
        # Django omits Bcc from SMTP MIME because SMTP has a separate envelope.
        # Gmail derives delivery recipients from To/Cc/Bcc, so include it here.
        if message.bcc:
            if 'Bcc' in mime:
                del mime['Bcc']
            mime['Bcc'] = ', '.join(sanitize_address(address, message.encoding or settings.DEFAULT_CHARSET) for address in message.bcc)
        raw = base64.urlsafe_b64encode(mime.as_bytes(linesep='\r\n')).decode('ascii')
        for attempt in range(2):
            response = self._post(SEND_URL, headers={'Authorization': f'Bearer {self._access_token()}'}, json={'raw': raw})
            if response.status_code == 401 and attempt == 0:
                self._token = None
                continue
            if response.status_code != 200:
                raise GmailDeliveryError(f'Gmail send failed (HTTP {response.status_code}); delivery is unconfirmed.')
            return

    def send_messages(self, email_messages):
        sent = 0
        with self._lock:
            for message in email_messages or []:
                if not message.recipients():
                    continue
                try:
                    self._send(message)
                except GmailDeliveryError:
                    if not self.fail_silently:
                        raise
                else:
                    sent += 1
        return sent
