# ToteKeeper monorepo

ToteKeeper is the React/TypeScript/Vite storefront in apps/web. Octagon is the existing Django 5.2 customer portal and restricted staff backend in apps/api. Their npm and Python dependency boundaries remain independent; no workspace dependency hoisting or shared package is needed.

```text
apps/web/          Storefront, npm lockfile, optional local Stripe sandbox
apps/api/          Django portal, staff console, migrations, Docker/Compose, Python lockfile
infrastructure/    DigitalOcean App Platform preparation template
scripts/           Root development launcher and connectivity check
docs/              Storefront documentation and migration/deployment notes
```

See [monorepo setup and deployment](docs/MONOREPO.md), [frontend documentation](apps/web/README.md), [backend documentation](apps/api/README.md), and [backend security](apps/api/docs/security.md).

After setup, run **npm run dev** from this directory to start Vite, Django and the existing background worker. No root npm install is necessary. Use Node 24 and Python 3.13.

| Task | Command from repository root |
| --- | --- |
| Install web | npm --prefix apps/web ci |
| Web only | npm run dev:web |
| API only | npm run dev:api |
| Worker only | npm run dev:worker |
| Web production build | npm run build:web |
| Web tests | npm run test:web |
| Web typecheck/lint | npm run check:web |
| Proxy smoke check (dev running) | npm run check:connectivity |
| API Docker build | docker compose --project-directory apps/api build |

For native backend setup, work in apps/api: create .venv, install requirements.lock, set DEBUG=true and USE_SQLITE=true, then run python manage.py migrate. Activate that environment before the root launcher, or set PYTHON to its executable. The launcher uses apps/api/.venv automatically when present. Backend checks: python manage.py check; python manage.py makemigrations --check --dry-run; python manage.py test; python manage.py collectstatic --noinput. PostgreSQL and Docker validation commands remain in the backend README.

The optional Node Stripe sandbox remains an independent opt-in development tool in apps/web. It is not Octagon and is not deployed. Its existing /api/sandbox proxy takes precedence locally.

Dedicated server publishing: [GitHub Actions setup and required configuration](docs/SERVER_DEPLOYMENT.md) for 162.243.163.103.

Gmail sender setup without SMTP: [Gmail API over HTTPS](docs/GMAIL_API.md).

Working public inquiries: [setup and verification](docs/INQUIRIES.md). Operator inbox configuration is required; inquiries do not create subscriptions or bookings.

Customer policy drafts: `/policies/storage-agreement`, `/policies/packing`, and
`/policies/privacy`. These are review documents, not operative agreements. See the
[owner decisions, implementation conflicts and Texas research](docs/POLICY_OWNER_REVIEW.md)
before publishing approved terms or enabling enrollment.

Plan explanations and image-placeholder replacement: [Plans & details](docs/PLANS_DETAILS.md).

Automatic ZIP eligibility: [initial list, sources and admin controls](docs/SERVICE_AREA_ZIPS.md).

Enrollment billing setup and retained agreement records: [docs/ENROLLMENT_BILLING.md](docs/ENROLLMENT_BILLING.md).
