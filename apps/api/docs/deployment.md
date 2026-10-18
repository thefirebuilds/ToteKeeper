# Deployment and operations

For the monorepo dedicated-server GitHub Actions workflow, use [the server deployment guide](../../../docs/SERVER_DEPLOYMENT.md). The commands below remain the backend-only manual deployment and recovery reference. Use a Linux droplet with Git, Docker Engine, Compose v2 and a separately managed off-host backup destination. No configuration from another project is assumed.

Configuration follows the [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/). Login limiting uses [Django Axes](https://django-axes.readthedocs.io/en/stable/).

This version adds allauth, Stripe, private photo blobs and a maintenance worker. Read [provider/commercial setup](providers-and-policies.md) and [security/retention](security.md) before enabling enrollment. Set `PUBLIC_BASE_URL` to the stable HTTPS portal URL, supply a separate persistent `MFA_ENCRYPTION_KEY`, Stripe secret/webhook/portal configuration, real business contact details and the service timezone. Run `python manage.py check_launch` after configuring approved database records. Back up the MFA encryption key separately and securely; restored database secrets cannot be decrypted without the original key.

## First deployment

1. Push reviewed code and require a passing Backend CI run. Clone on the droplet and check out an approved commit SHA/tag. Record that revision.
2. Configure DNS A/AAAA records. Open public TCP 80/443 and restrict SSH. PostgreSQL has no published port; app port 8000 is loopback-only. Never publish it directly: the app trusts Caddy's HTTPS header.
3. Copy `.env.example` to `.env`, then `chmod 600 .env`. Set `DEBUG=false`, `USE_SQLITE=false`, a unique random `SECRET_KEY` of at least 50 characters, a strong `POSTGRES_PASSWORD`, explicit `ALLOWED_HOSTS`, HTTPS `CSRF_TRUSTED_ORIGINS`, `DOMAIN` (hostname without protocol), and `ACME_EMAIL`. Set real SMTP `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS=true`, and verified `DEFAULT_FROM_EMAIL`. Production defaults to the SMTP backend. Complete your provider's DNS verification. Never commit `.env`.
4. Use the production override on every production command:

```sh
docker compose -f compose.yaml -f compose.production.yaml build
docker compose -f compose.yaml -f compose.production.yaml run --rm app python manage.py check --deploy
docker compose -f compose.yaml -f compose.production.yaml run --rm app python manage.py migrate --plan
docker compose -f compose.yaml -f compose.production.yaml run --rm app python manage.py migrate --noinput
docker compose -f compose.yaml -f compose.production.yaml run --rm app python manage.py createsuperuser
docker compose -f compose.yaml -f compose.production.yaml up -d --wait
```

Static assets are collected into the image at build and served by WhiteNoise. Caddy obtains/renews HTTPS certificates and persists them in `caddy_data`. PostgreSQL persists in `postgres_data`. Keep the Compose directory/project name stable or set `COMPOSE_PROJECT_NAME` so releases reuse the same database volume. Never run `down -v` in production.

The worker is required: it expires unpaid holds/credits every 30 seconds, processes notification jobs, and reconciles recent Stripe events every five minutes. Monitor worker liveness, unsent notification jobs, webhook retries, open refund-review support cases, database disk and public health. Schedule `python manage.py clearsessions` daily. Do not scale the worker until its throughput/locking behavior is measured. Staff must verify email and complete real MFA after provisioning before entering Octagon/admin; create no default production accounts.

5. Verify the public HTTPS `/health/`, login, customer isolation, one request lifecycle and real SMTP password reset. Check HTTP-to-HTTPS redirects and Secure session/CSRF cookies. Use a fictional test customer and suspend it afterward. Demo seeding is prohibited in production.
6. Replace branding in base/login/reset templates and `storage/admin.py`. Business messaging and actual terms remain the operator's responsibility; no insurance promises or legal agreements are supplied.

Production refuses incomplete required settings at import. `check --deploy` may warn about HSTS subdomains/preload: these are deliberately disabled until HTTPS is controlled for every related subdomain. Review rather than automatically enabling them. Monitor public HTTPS health and database disk space externally.

## Releases

Stop the **worker as well as app/proxy** before schema-changing migrations or restore/cutover. Restart all three after migrations. Private photos are stored in the database and included in dumps; account for their size. The migrations are additive and backfill existing accounts without activating paid plans. Review legacy subscriptions/requests before any commercial migration; no provider subscriptions are created by migrations.

Retain the previous revision/image and back up before migrations. Pull an approved revision, build, inspect migration plans, migrate and recreate services under the same Compose project. Announce a short maintenance window and stop app/proxy before schema-changing migrations, keeping the database running. Check health, login and a service request afterward. Never log form bodies, passwords, reset tokens or customer addresses while debugging. Access logs are disabled for Caddy/Gunicorn; Django request and Axes loggers are silenced. Console email is for fictional local data only.

## Backups

Run in Bash on the droplet from the checkout. Dumps contain personal data: restrict access, encrypt them and transfer off-host. Define retention and schedule daily and pre-release backups with your chosen scheduler/provider.

```sh
mkdir -p backups
chmod 700 backups
backup_path="backups/octagon-$(date -u +%Y%m%dT%H%M%SZ).dump"
umask 077
docker compose -f compose.yaml -f compose.production.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_path"
test -s "$backup_path"
docker compose -f compose.yaml -f compose.production.yaml exec -T db pg_restore --list < "$backup_path" > /dev/null
```

Only transfer a dump after `pg_dump` succeeds. Record its timestamp, app revision and PostgreSQL major version without secrets. Test restoration regularly. Changing `POSTGRES_PASSWORD` in Compose does not change the password of an existing PostgreSQL role; rotate database and SMTP credentials deliberately.

## Restore and recovery

Practice in a separate database/project, never the only production database. Create a rehearsal database and restore a chosen dump:

```sh
docker compose -f compose.yaml -f compose.production.yaml exec -T db sh -c 'createdb -U "$POSTGRES_USER" octagon_restore'
docker compose -f compose.yaml -f compose.production.yaml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d octagon_restore --no-owner --exit-on-error' < backups/CHOSEN_BACKUP.dump
```

Use code matching the dump revision and point an isolated app at the restored database. Validate counts, login, ownership, subscriptions, requests and health. For actual recovery, stop writes, preserve the failed database, obtain operator approval before replacing data, and cut over to the validated restored database. Record that changes after the backup are lost. Never use `--clean` against an unverified database target.

## Rollback

Application-only rollback is safe only if prior code supports the current schema. Stop app/proxy, check out the prior approved revision, rebuild and restart with the production override. Do not automatically reverse migrations; data migrations and subsequent writes may be irreversible. For incompatible changes prefer a forward fix or restore the pre-release backup into a separate database and cut over using matching code. Preserve database and certificate volumes throughout.

For HTTPS email delivery through a Gmail sender, see [Gmail API setup](../../../docs/GMAIL_API.md). Select `EMAIL_BACKEND=config.gmail.GmailAPIBackend` and configure the three OAuth values plus `DEFAULT_FROM_EMAIL`; SMTP settings are then not required.
