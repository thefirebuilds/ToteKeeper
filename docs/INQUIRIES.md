# Working storage inquiries

## Public flow

Header, hero, plan cards and final form use **Get my storage plan**. Plan cards preselect Small/Medium/Big. Help me decide, summer storage, bulky items, service-area questions and tote-mix inquiries enter the same form with bounded context labels. Legacy storefront `/enroll?plan=...` links redirect to the inquiry form, preserving only recognized plan/context values and dropping other query data. The separate Django portal's authenticated enrollment routes are unchanged.

The form requests name, email, ZIP, plan interest and a short description; phone is optional. Phone/text are offered only after a phone number is entered and represent a manual reply preference, not automated SMS or marketing consent. No street address is collected. Service eligibility, capacity, pricing and scheduling require operator review. The inquiry creates no customer account, subscription, payment or appointment.

The existing cream/blue styling and headline remain. Public demo links and the non-sending Check form were removed. Demo routes remain labeled for development. Pricing, included service, packing restrictions, renewal/cancellation and proposed liability disclosures remain; unresolved monthly setup and implementation details are not advertised as purchase options.

## Backend and delivery

`GET /api/inquiries/csrf/` supplies a same-origin CSRF token; `POST /api/inquiries/` validates a JSON request (8 KiB maximum), including bounded fields, a US ZIP format, allowed plan/source/context values and a honeypot. Email is validated and used as Reply-To only. Provider credentials, the fixed verified From address, operator inbox and delivery code remain server-side. The notification includes a unique TK reference, UTC timestamp, source CTA, context and every submitted field.

The endpoint uses the existing PostgreSQL database with one additive `portal.0005_inquiry_receipts` migration. A private Inquiry receipt is necessary for reliable idempotency across requests/processes and provider failures; no new database service was introduced. The request UUID is unique. The receipt is committed before sending; a repeated identical request returns its existing success reference without sending another email. A changed payload with the same key returns 409. Frontend edits create a new key; ordinary retries after a lost response reuse the original key.

Success is returned **only when the configured Django email backend reports provider acceptance**, not inbox delivery. The existing Gmail HTTPS backend is supported; working SMTP remains supported. The UI announces the reference and next steps and explicitly says no subscription, payment or appointment was created. No automatic customer email is promised or sent.

If delivery fails, returns zero acceptances, or becomes uncertain, the receipt is retained for manual review and the API returns 503 with a reference. The form preserves input and provides published email/phone links. Failed/in-progress receipts are not automatically resent: a provider timeout can mean the message was accepted even though the response was lost. The operator should inspect private receipt/provider state before manually following up, avoiding blind retries. There is no separate queue/worker change and no claim that a failed message has been delivered.

Private receipts are visible only through administrator-restricted, read-only Django admin, including failed or interrupted attempts. Existing audit records contain record IDs/status only, not lead contents. No inquiry is placed in analytics, URLs or routine logs. Customer names, email, ZIP, phone and description are stored privately in PostgreSQL and sent to the configured operator inbox; include these records in your existing privacy, backup and retention procedures. No public receipt lookup exposes submitted fields.

The intake has its own small transactions rather than the account middleware's outer mutation transaction, so a failed delivery receipt is not rolled back on a 503 response. Existing account, authorization, billing, webhook and notification transaction behavior remains unchanged. CSRF protection remains enabled on intake. No CAPTCHA, public debug endpoint, authentication bypass or new SMS provider was introduced.

## Configuration before accepting real inquiries

1. Review the code locally. **Do not push to main until deployment is approved:** this repository automatically deploys main pushes. These changes were not deployed and no live operator test was sent.
2. In the server's existing `/opt/totekeeper/shared/.env`, configure a real monitored operator inbox:

```dotenv
INQUIRY_TO_EMAIL=blake@totekeeper.com
INQUIRY_TRUST_PROXY_HEADER=true
```

`blake@totekeeper.com` is the intended published operator address. Confirm that you control and can receive mail at it; if it is not operational, use another monitored inbox in INQUIRY_TO_EMAIL before launch. This does not automatically change the existing published contact address. The destination defaults to empty so an unconfigured form fails honestly.

3. Retain the working Gmail sender settings, for example:

```dotenv
EMAIL_BACKEND=config.gmail.GmailAPIBackend
DEFAULT_FROM_EMAIL=thefirebuilds@gmail.com
GMAIL_CLIENT_ID=YOUR_EXISTING_VALUE
GMAIL_CLIENT_SECRET=YOUR_EXISTING_VALUE
GMAIL_REFRESH_TOKEN=YOUR_EXISTING_VALUE
```

Do not replace actual values with placeholders. DEFAULT_FROM_EMAIL must be the authorized Gmail mailbox. A customer's email is never used as the From sender. Google OAuth Testing refresh tokens expire after seven days; see [Gmail setup](GMAIL_API.md) before relying on unattended delivery. Missing credentials, capture-only/console backends in production or a missing inbox produce no simulated success. Configured-but-invalid credentials fail on the actual provider call and return a useful 503.

4. For the supplied dedicated-server deployment, the updated Caddy config overwrites `X-ToteKeeper-Client-IP` with its actual remote peer on backend requests, and the API has no public port. Only in that topology enable INQUIRY_TRUST_PROXY_HEADER=true. The server hashes this value using the application secret for rate keys; it does not persist raw IPs in Inquiry or audit records. Untrusted request forwarding headers are ignored by default. Do not enable this setting on an exposed backend or a proxy that passes this header through unchanged. Other proxy/CDN setups need an explicit trusted-client-IP configuration; otherwise callers sharing a proxy also share the IP limit.
5. The existing shared database cache limits new valid submissions to five per client-IP 15-minute bucket and three per email hourly bucket. Duplicate receipt lookups do not resend or consume additional slots. Keep the migrated database cache shared between app workers. No new Redis service is required.
6. Apply `python manage.py migrate --noinput` against the existing backed-up database through the normal approved deployment process. This is an additive receipt table. Recreate app and Caddy to load the new settings/header configuration. `/api/inquiries/` and its CSRF endpoint must reach Django before frontend fallback (already covered by the monorepo /api routing). Keep both storefront and portal origins in existing ALLOWED_HOSTS/CSRF_TRUSTED_ORIGINS as appropriate. No frontend env secret is needed.
7. Verify that an explicitly authorized real inquiry reaches the intended operator inbox, shows the correct fixed sender and Reply-To, and can be replied to. Confirm no duplicate after a repeated identical request. No real delivery to blake@totekeeper.com was tested while implementing this change.

Direct contact still uses the existing published blake@totekeeper.com and 262-880-4570 links. No response-time guarantee, marketing enrollment or automatic service eligibility is implied.

## Verification commands

From apps/api with the existing development/test environment: `python manage.py test`, `python manage.py check`, `python manage.py makemigrations --check --dry-run`. Tests use isolated databases and mocked/captured mail, never the live operator inbox.

From root: `npm run check:web`, `npm run test:web`, `npm run build:web`. Browser tests: `npm --prefix apps/web run test:browser` after installing the browser with `npx playwright install chromium` from apps/web. CI installs Chromium/dependencies on Ubuntu and runs the same tests. Browser tests cover desktop/mobile, keyboard focus/order, responsive layout, validation announcements, plan/context preselection, legacy links, pending-submit protection, backend failures and confirmation receipts. All browser API responses are mocked. Artifacts in apps/web/test-results use fictional test data only and are gitignored.

Local verification completed: 53 frontend unit tests and eight desktop/mobile Chromium acceptance tests passed; type checking, lint and production frontend build passed. Django ran 74 tests successfully with one PostgreSQL-only concurrency test skipped under SQLite, plus framework checks, migration drift checks and static collection passed. The focused inquiry suite passed all 11 cases after final input hardening. Docker/PostgreSQL runtime checks remain for the existing CI environment because Docker is unavailable locally. No real operator email delivery was verified.
