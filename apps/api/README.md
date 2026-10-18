# ToteKeeper customer portal · Octagon backend

Django 5.2/PostgreSQL application extending the existing scaffold. **ToteKeeper** is the customer brand; **Octagon** is the restricted staff console. No deployment or infrastructure provisioning has occurred.

## Run locally

Install Docker Engine/Desktop and Compose v2. Copy `.env.example` to `.env`, set a unique `POSTGRES_PASSWORD`, and leave `DEBUG=true` for local development. No payment/provider keys are needed to browse empty states or use the explicitly fictional fixtures.

```sh
docker compose build
docker compose run --rm app python manage.py migrate
docker compose run --rm app python manage.py createsuperuser
docker compose up -d --wait
```

Open http://localhost:8000. Register at `/accounts/signup/` and verify email using the link printed by the local console email backend. Customer accounts never receive staff access through registration. Staff created with `createsuperuser` must also verify their email and enroll/complete a real MFA challenge before accessing `/octagon/` or `/admin/`.

For native PowerShell development (Python 3.13):

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.lock
$env:DEBUG='true'
$env:USE_SQLITE='true'
./.venv/Scripts/python.exe manage.py migrate
./.venv/Scripts/python.exe manage.py runserver
```

Native Django reads process environment, not `.env`; Compose loads `.env`. SQLite is a local fallback and cannot validate PostgreSQL locking. In a second terminal with the same environment, run `python manage.py run_jobs` for expiry, notifications and reconciliation. Compose includes that worker automatically. Rebuild Compose after code changes; static assets are collected into the image.

## Explicit development fixtures

```sh
docker compose run --rm app python manage.py seed_portal_demo
docker compose run --rm app python manage.py changepassword portal_demo
```

This creates a clearly named fictional account, a draft **DEVELOPMENT FIXTURE** offering, test-only credits and fictional service windows in postal code `00000`. It does not create a default password, verify an email, bypass MFA, create a real Stripe object or enable a real offering. Verify the fixture email through the normal allauth flow, using console email locally. The fixture paid status is for offline UI/workflow testing only; it is labeled as development. Never seed production. Live Stripe keys are blocked with `DEBUG=true`.

The older `seed_demo` and original draft annual plans are preserved for legacy records, but are not the new offering catalog or real ToteKeeper prices. Migrations backfill an Account for each existing Customer without activating subscriptions. Old manual subscriptions and requests remain read-only in admin; review them before a commercial migration. Do not replace an existing database to try this version.

## Working flows

- Verified registration, sign-in/out, recovery, email changes, active-session management, optional TOTP MFA/recovery codes and WebAuthn/passkeys through django-allauth. Staff require verified email and an MFA-authenticated session; there is no development staff bypass.
- Profile, primary/additional addresses, notification preferences and separate marketing consent; service-area checks before enrollment.
- Versioned offerings, accepted policy snapshots, enrollment progress and server-owned Stripe references. Hosted Checkout and Customer Portal support subscriptions, one-time delivery purchases, payment methods and invoice links. Signed events and authoritative provider reads control entitlements; redirects never activate them.
- Available-window requests for pickup, return and exchange, with lead time, capacity, blackout flags and cancellation cutoffs. Credits and capacity are reserved transactionally; fulfillment has explicit status transitions. Requested windows need staff confirmation.
- Customer-owned inventory, descriptive edits, oversized-item approval, registered-versus-received statuses and private photos. Photos are content-validated, size/count limited, re-encoded as JPEG without unnecessary metadata, stored privately in PostgreSQL and served only through authorized views. No public media directory exists.
- Help/callback tickets, direct configurable contact details, assigned-steward fulfillment and inventory operations, administrator management and CSV exports.
- Append-only audit/ledger records through normal application paths, redacted changes, account/actor/correlation IDs, provider event IDs, atomic audits and a persistent notification outbox.

## Staff provisioning and adjustments

Create a separate user in Django admin, then provision it explicitly from the trusted server shell:

```sh
python manage.py provision_staff USERNAME --role steward --reason 'Approved staff provisioning reference'
python manage.py provision_staff USERNAME --role administrator --reason 'Approved administrator provisioning reference'
```

`--role revoke` removes staff privileges. Staff must verify email and complete MFA. Stewards see only assigned deliveries and relevant inventory/contact details; they cannot access Django admin, billing, exports, credits or offering management. Administrators manage configuration in Django admin. Superusers are administrators by definition. Do not share staff accounts.

Credit adjustments are explicit, audited and separate from provider refunds:

```sh
python manage.py adjust_credits ACCOUNT_ID QUANTITY --actor ADMIN_USERNAME --valid-days DAYS --reason 'Approved support case reference'
```

Negative adjustments cannot spend reserved credits or make a balance negative. No card data or payment credentials are stored. Cash refunds are performed in Stripe under the approved policy; refund events reconcile unused purchased credits and open a staff review ticket for consumed/partial cases.

Suspended customers retain access to Billing, cancellation and Help. Suspension does not authorize continued unwanted renewal or disposal of stored property. This MVP supports one current provider contract per account; re-enrollment after a completed cancellation and independent additional packages require a reviewed staff migration, rather than creating a second subscription silently.

## Provider and production setup

See [provider setup and commercial decisions](docs/providers-and-policies.md), [deployment/backups](docs/deployment.md), [security/retention](docs/security.md), and [verification](docs/verification.md).

Required before launch: PostgreSQL, stable HTTPS `PUBLIC_BASE_URL`, `SECRET_KEY`, separate persistent `MFA_ENCRYPTION_KEY`, allowed hosts/trusted origins, SMTP, Stripe keys/webhook/portal configuration, real contact details, approved service areas/windows, offerings/provider prices, tax review, and real versioned terms/cancellation policy. `.env.example` lists configuration names. Production fails closed when required core secrets/provider settings are missing. Run `python manage.py check_launch` for additional commercial/configuration checks.

## Tests

```sh
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
python manage.py collectstatic --noinput
```

GitHub Actions runs fresh migrations/tests against PostgreSQL, including simultaneous reservation checks, then builds/starts Compose. It never deploys. `requirements.lock` pins resolved dependencies. Actual provider calls, real browser passkeys, PostgreSQL concurrency, SMTP and Docker startup require acceptance testing in a configured environment before production.
