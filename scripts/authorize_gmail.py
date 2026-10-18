"""Authorize one Gmail sender locally; no Google login is added to the website."""
import argparse
import base64
import hashlib
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCOPE = 'https://www.googleapis.com/auth/gmail.send'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-file', required=True, type=Path, help='Google Desktop app OAuth client JSON')
    parser.add_argument('--output', required=True, type=Path, help='New private .env.gmail.local file; never overwritten')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output file already exists. Choose a new private file.')
    try:
        client = json.loads(args.client_file.read_text())['installed']
        client_id, client_secret = client['client_id'], client['client_secret']
        if not client_id or not client_secret:
            raise ValueError
    except (OSError, ValueError, KeyError, TypeError):
        parser.error('Expected a readable Desktop app OAuth client JSON downloaded from Google.')
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    result = {}

    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass  # OAuth callback URLs contain credentials; never log them.

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            valid = parsed.path == '/' and secrets.compare_digest(query.get('state', [''])[0], state)
            if valid and ('code' in query or 'error' in query):
                result['code'] = query.get('code', [None])[0]
            self.send_response(200 if valid else 400)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'You can close this tab and return to the terminal.' if valid else b'Invalid OAuth callback.')

    with HTTPServer(('127.0.0.1', 0), Callback) as server:
        server.timeout = 1
        redirect = f'http://127.0.0.1:{server.server_port}/'
        url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode({
            'client_id': client_id, 'redirect_uri': redirect, 'response_type': 'code',
            'scope': SCOPE, 'access_type': 'offline', 'prompt': 'consent', 'state': state,
            'code_challenge': challenge, 'code_challenge_method': 'S256',
        })
        print('Authorize the Gmail account that will SEND ToteKeeper emails in the browser.')
        webbrowser.open(url)
        print('If the browser did not open, use this URL on this same computer:\n' + url)
        deadline = time.monotonic() + 180
        while 'code' not in result and time.monotonic() < deadline:
            server.handle_request()
    if not result.get('code'):
        parser.exit(1, 'Authorization denied or timed out; no credentials saved.\n')
    request = urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode({
        'client_id': client_id, 'client_secret': client_secret, 'code': result['code'],
        'code_verifier': verifier, 'redirect_uri': redirect, 'grant_type': 'authorization_code',
    }).encode(), method='POST')
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            token = json.load(response)['refresh_token']
        if not isinstance(token, str) or not token:
            raise ValueError
    except (urllib.error.URLError, ValueError, KeyError, TypeError):
        parser.exit(1, 'Could not obtain a refresh token; check Google OAuth configuration. No credentials saved.\n')
    values = {'GMAIL_CLIENT_ID': client_id, 'GMAIL_CLIENT_SECRET': client_secret, 'GMAIL_REFRESH_TOKEN': token}
    if any(not isinstance(value, str) or any(char in value for char in '\r\n\x00') for value in values.values()):
        parser.exit(1, 'Invalid credential data; no credentials saved.\n')
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write(''.join(f'{key}={value}\n' for key, value in values.items()))
    print('Credentials saved to the requested private file. Copy them securely to the server .env; never commit or share them.')


if __name__ == '__main__':
    main()
