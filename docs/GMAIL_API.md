# Gmail API email delivery over HTTPS

This optional Django email backend sends through Google's Gmail API on HTTPS port 443. It preserves existing django-allauth verification/password-reset mail and the notification outbox. It adds no customer Google login and no new public OAuth callback. SMTP remains available. Gmail authorization belongs only to the mailbox used to send ToteKeeper email, not to customer accounts.

## 1. Configure Google Cloud

1. Open https://console.cloud.google.com/ and create or select a project named ToteKeeper.
2. In **APIs & Services > Library**, enable **Gmail API**.
3. Open **Google Auth Platform** (or the OAuth consent-screen setup). Configure branding as ToteKeeper, your support email and developer contact email. For a personal Gmail sender choose **External** audience. Add the sending Gmail account as a test user while the app is in Testing.
4. In **Data Access**, add only `https://www.googleapis.com/auth/gmail.send`. This permits sending mail, not reading the inbox. It is a sensitive scope; follow Google's verification requirements for your eventual audience/use.
5. In **Clients > Create client**, choose **Desktop app** and name it `ToteKeeper sender authorization`. Download its JSON credentials to a private location on your Windows computer. Do not create a service account or put this JSON in frontend code. The desktop client is used by the one-time local authorization helper; the droplet then uses the issued refresh token. There is no server callback URL to register for this flow.

Google's interface labels may vary. References: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).

## 2. Authorize the sender locally

Use Python 3.13 on your Windows computer, from the repository root (not an SSH session):

```powershell
python scripts/authorize_gmail.py --client-file "$HOME\Downloads\YOUR_DOWNLOADED_CLIENT_FILE.json" --output .env.gmail.local
```

Replace the downloaded filename with the actual path. The helper uses only the Python standard library. It opens your browser, listens on a temporary loopback-only port, validates OAuth state and PKCE, and requests offline access with only `gmail.send`. Sign in as the Gmail mailbox that should send ToteKeeper emails. The helper exits after consent or a three-minute timeout. It never sends an email.

The resulting `.env.gmail.local` contains `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN`. It is ignored by Git. Existing output files are never overwritten. Keep the downloaded JSON and this file private; on Windows protect them with your user account's filesystem permissions. Do not paste their contents into chat, issues, Actions logs or Git. The helper never prints tokens.

**Testing expiration:** Google issues refresh tokens that expire after seven days for external apps in Testing when using this scope. Reauthorize for a short test, or configure the OAuth app's publishing status appropriately before unattended use. Production publishing is separate from verification; follow Google's policies for your audience and use, and do not assume publishing guarantees permanent tokens. Password changes, revocation and other account events can invalidate refresh tokens. See [Google's token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

## 3. Configure the server

Privately copy the three generated settings into `/opt/totekeeper/shared/.env`, preserving the existing database, Django, MFA, Stripe and domain settings. Set:

```dotenv
EMAIL_BACKEND=config.gmail.GmailAPIBackend
DEFAULT_FROM_EMAIL=YOUR_AUTHORIZED_GMAIL_ADDRESS
GMAIL_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID
GMAIL_CLIENT_SECRET=YOUR_ACTUAL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN=YOUR_ACTUAL_REFRESH_TOKEN
```

`DEFAULT_FROM_EMAIL` must be the exact Gmail mailbox authorized in the browser. For the MVP, do not use an unconfigured sender alias. SMTP host/user/password settings are unused by this backend and may remain empty. Keep `DEBUG=false`; Gmail does not bypass email verification, MFA, authorization or HTTPS requirements. Store these values only on the backend server, not in GitHub/frontend `VITE_*` settings. Keep the server env file owned by deploy and mode 600.

The updated code must be committed/pushed before starting a **new** `Deploy dedicated server` workflow run from main. Re-running an old workflow uses the old commit, which still enforces SMTP. No server configuration is uploaded automatically. New containers load the server env file; restart both app and worker after subsequent credential changes.

## 4. Verify delivery

After a successful deployment, SSH into the server as deploy. Run this in Bash with your own recipient address substituted:

```sh
cd /opt/totekeeper/current
export RELEASE_SHA=$(cat /opt/totekeeper/current-sha)
docker compose --project-name totekeeper --env-file /opt/totekeeper/shared/.env \
  -f infrastructure/server/compose.yaml exec app \
  python manage.py sendtestemail YOUR_RECIPIENT_ADDRESS
```

This deliberately sends one real email; inspect the inbox/spam folder. Then test registration verification and password reset. These flows continue using Django's standard email interface; notification outbox processing remains in the existing worker. Watch for quota, authorization and delivery errors without logging tokens or email bodies. Gmail sending limits still apply; successful API acceptance does not prove inbox delivery.

Transport errors are redacted. A rejected access token gets one refresh/retry; sends with uncertain network failures or provider 5xx are not blindly retried inside the backend. Existing outbox retry behavior is unchanged, so ambiguous delivery can still result in a duplicate on a later retry. Verify receipt when investigating failures. Revoked/expired refresh tokens require renewed authorization, not dummy SMTP credentials.

## Validation

Backend tests mock Google's token and send endpoints and cover MIME/HTML/attachments, Bcc/Cc and reply-to recipients, token caching, 401 refresh, invalid/revoked tokens, redacted failures, uncertain send failure handling, sender restrictions and Gmail production settings without SMTP. Existing authentication, password reset, authorization, webhook and notification tests remain in the suite. No live OAuth grant or real Gmail delivery is performed by automated tests.
