# Octagon · seasonal storage portal

Django 5.2 LTS, PostgreSQL 17, server-rendered templates, Gunicorn, WhiteNoise and Caddy. **Your Storage Business** is placeholder branding. Nothing has been provisioned or deployed.

## Run locally with Docker

Install Docker with Compose v2. Copy `.env.example` to `.env` and set a unique `POSTGRES_PASSWORD`. Leave `DEBUG=true` for local work only.

```sh
docker compose build
docker compose run --rm app python manage.py migrate
docker compose run --rm app python manage.py createsuperuser
docker compose run --rm app python manage.py seed_demo
docker compose up -d --wait
```

Open http://localhost:8000. Customer overview: `/`; operator dashboard: `/operations/`; management: `/admin/`; database-backed health: `/health/`.

`seed_demo` creates two fictional customers and four totes with unusable passwords. Enable a demo login with `docker compose exec app python manage.py changepassword demo1`. Seeding is idempotent and refused in production. Migrations seed draft plans of 1 tote/$149, 4 totes/$299 and 10 totes/$599 annually.

Rebuild source changes with `docker compose up -d --build`. For autoreload, stop the app service and run `docker compose run --rm --service-ports app python manage.py runserver 0.0.0.0:8000`. Local reset emails appear in `docker compose logs app`; use fictional data because console emails contain reset tokens.

## Native Python fallback

Python 3.13 is recommended. PowerShell:

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.lock
$env:DEBUG='true'
$env:USE_SQLITE='true'
./.venv/Scripts/python.exe manage.py migrate
./.venv/Scripts/python.exe manage.py createsuperuser
./.venv/Scripts/python.exe manage.py seed_demo
./.venv/Scripts/python.exe manage.py runserver
```

Native commands read process environment, not `.env`; Compose loads `.env`. SQLite is a local-only fallback. To use native PostgreSQL, omit `USE_SQLITE=true` and configure `POSTGRES_*` environment variables.

## Operator workflow

1. Create a Django user under Authentication → Users with a unique username and strong password. Customers must be active, without staff/superuser flags. Share initial credentials using your chosen secure channel; invitations are deferred.
2. Create a Customer linked to the user, with email and service address. Customer admin/profile edits synchronize the email used for password resets. Do not edit email independently on the User screen.
3. Review draft plans and create a subscription with explicit agreed annual price and dates. Plan price changes never change the agreed price. Track payments manually; never enter card data.
4. Create and assign totes to active customers. Generated `T-…` IDs are unique label-ready text; custom uppercase IDs can be entered at creation. No QR image generator is included.
5. Confirm requests from the operator dashboard, entering the actual appointment in America/Chicago time. Preferred date/window stay separate. Bulk-mark confirmed totes in transit in tote admin, then complete the request to update all its totes. Resolve in-transit totes before canceling.
6. Use tote admin for locations, seals, assignment and retirement. Private timestamped history records movements, locations and assignments. Bulk moves are atomic; one invalid tote rejects the whole operation. Totes outside requests move through transit; retired totes are reactivated individually.

`is_staff` is the trusted operator role and grants dashboard, request workflow and exports. Use the first superuser for full Django admin management. Limited Django staff permissions do not restrict operations access. Customers are scoped by linked Customer ID on every view and mutation; suspended profiles cannot use the portal. Django `is_active=false` also disables login.

Customer pages expose no private notes, warehouse locations or operational history. Customers can edit their profile and tote nickname/description, submit requests and cancel unconfirmed requests. There is no public signup or JSON business API. Future APIs must use the same ownership checks and `storage/services.py`.

## Verification

```sh
docker compose run --rm app python manage.py check
docker compose run --rm app python manage.py makemigrations --check --dry-run
docker compose run --rm app python manage.py test
```

Tests cover isolation including crafted POSTs, staff access, CSRF, request eligibility/conflicts/transitions, bulk rollback, assignment, duplicate IDs, price preservation, address snapshots, history, reset emails, login lockout, CSV formula escaping and health. GitHub Actions runs fresh migrations and tests on PostgreSQL, then builds and starts Compose. It never deploys. `requirements.lock` pins tested dependencies; refresh deliberately and rerun tests.

## Production and limitations

Read [deployment, backups and rollback](docs/deployment.md). Configure hosting, domain/DNS, SMTP, secrets and branding before deployment. Production rejects missing secrets, wildcard hosts, non-HTTPS trusted origins, missing SMTP configuration and SQLite-only setup. No production credentials exist.

- No payments, SMS, routing, photos, contracts, invitations, public marketing, automated renewals or carrier integrations.
- Allowances are displayed for operator review; overages are not automatically blocked or billed. One current subscription per customer is supported.
- Requested service reserves totes without changing physical status; confirmation marks scheduling. PostgreSQL locks serialize conflicting writes. SQLite cannot verify production concurrency.
- Activities are private application records, not tamper-proof compliance logs. Direct SQL/ORM scripts bypass workflow safeguards; use services for operational writes. Locations and seals are maintained manually.
- Login locks a username for 30 minutes after 5 failures using database-backed Django Axes. Account-only limiting works across IP rotation and avoids grouping all customers under Caddy's internal IP. `axes.W006` is intentionally silenced for this reason. Unlock after review with `python manage.py axes_reset_username USERNAME`. Account lockout can itself be abused; edge abuse protection and password-reset email throttling remain future work.
- Timestamps are timezone-aware and stored in UTC; appointments display in America/Chicago. Ambiguous/nonexistent local DST times are rejected by Django forms.
- Docker and browser automation were unavailable on the implementation machine. CI checks are configured but must run after pushing. See the handoff for validation actually executed.
