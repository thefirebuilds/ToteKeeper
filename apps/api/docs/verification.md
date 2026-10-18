# Verification · October 18, 2026

Executed with Python 3.13.14 and `requirements.lock` on Windows:

- Fresh SQLite test-database migrations, plus additive migrations applied to the existing local scaffold database: successful.
- Full suite: **51 tests discovered, 50 passed, one PostgreSQL-only simultaneous reservation test skipped**. Coverage includes account isolation, staff/assigned-steward boundaries, email verification, actual TOTP challenge login, shared username/email lockout, enrollment, hosted checkout retry protection, signed/idempotent/reordered provider events, refund ordering/review holds, payment failure/expiry, credits, physical statuses, storage allowance, private photos, audit rollback/redaction, cancellation preserving inventory, legacy prices, and fail-closed production settings.
- Django checks: no issues, with the documented account-based Axes warning intentionally silenced.
- `makemigrations --check --dry-run`: no model drift.
- `pip check`: no broken requirements.
- Static asset collection: successful.
- Fictional `seed_portal_demo`: successful; no default password, verified email, MFA bypass or actual payment created.
- Actual Django server started. HTTP health, allauth sign-in and registration pages, design tokens, portal stylesheet and ToteKeeper illustration returned 200. HTTP/database health management command passed.
- Git whitespace check: passed; Git reports the machine's existing CRLF conversion notices.

Not validated here: Docker/Compose build/startup, live PostgreSQL locking, Caddy/TLS, real SMTP, Stripe sandbox/live API transactions, browser rendering or hardware/browser passkeys. Docker and PostgreSQL are not installed and no provider credentials are available. Payment tests use explicit SDK fixtures with real webhook-signature verification; the TOTP test uses allauth's real challenge flow. Those results are not a production payment/MFA/passkey certification. GitHub Actions is configured for PostgreSQL tests and Compose startup but has not been executed by this local work.

Launch requires passing CI, real provider acceptance tests, browser/device QA, approved policies/prices/tax/credit mechanics, contact details, service areas/windows, staff assignments and the manual recovery/retention procedures. No deployment was performed.
