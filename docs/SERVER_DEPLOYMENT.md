# Dedicated Linux server deployment

Target: **162.243.163.103**. This workflow supports the existing monorepo on one dedicated Linux server using Docker Compose, PostgreSQL, Caddy HTTPS and the existing background worker. It does not use a Java servlet runtime. It does not install the operating system, Docker, SSH keys or secrets for you.

## One-time server preparation

Use a supported Ubuntu/Debian server with Bash, OpenSSH/SFTP, Docker Engine and Compose v2 supporting `up --wait`, curl, tar, gzip, flock and GNU coreutils. Allow adequate CPU/RAM/disk for a Python image build, PostgreSQL, database-backed private photos, retained releases and backups. A practical initial target is 2 vCPU / 4 GB RAM, with capacity adjusted to actual usage. Node and Git are not needed on the server: Actions builds the frontend and sends committed source plus its build.

Create a dedicated `deploy` user and add a dedicated deployment public key to its `~/.ssh/authorized_keys`. Allow that user to run Docker without interactive sudo (Docker membership is effectively root access). Keep its private key in GitHub, never in this repository. Restrict inbound ports to SSH (normally 22) and public HTTP/HTTPS 80/443. Do not expose PostgreSQL or Django port 8000. Any existing web server/servlet occupying 80/443 must be deliberately stopped or integrated before using this Caddy configuration. Do not open those ports blindly if they serve something else.

As an administrator, prepare stable directories:

```sh
sudo install -d -o deploy -g deploy -m 700 /opt/totekeeper
sudo -u deploy mkdir -p /opt/totekeeper/{incoming,releases,shared,backups}
```

The deployment never deletes database/certificate volumes, old releases or backups. Set off-host encrypted backups, tested restore procedures, monitoring, disk alerts and a deliberate retention policy. Copies on this server alone do not protect against server loss. If a database already exists elsewhere, plan an explicit backed-up data migration first: this Compose project creates its own `totekeeper_postgres_data` volume and does not import existing data automatically.

## Domains and server configuration

Choose two distinct DNS hostnames: the storefront (for example `totekeeper.com`) and the existing Django portal (for example `portal.totekeeper.com`). Point their A records at **162.243.163.103**; remove incorrect AAAA records. DNS/ports must work before Caddy can obtain certificates. The IP is the SSH destination; production Django's authentication requires stable HTTPS origins, so this setup does not publish the portal over raw HTTP at the IP.

On the server, create `/opt/totekeeper/shared/.env` from `infrastructure/server/.env.example`, with permissions **600**, owned by the deploy user. Add these Caddy settings:

```dotenv
WEB_DOMAIN=totekeeper.com
PORTAL_DOMAIN=portal.totekeeper.com
ACME_EMAIL=YOUR_REAL_CERTIFICATE_CONTACT_EMAIL
```

Replace example domains. Complete all backend settings, including:

- `DEBUG=false`, `USE_SQLITE=false`.
- A unique `SECRET_KEY` of at least 50 characters; a separately generated, persistent `MFA_ENCRYPTION_KEY` (Fernet). Preserve both across releases and back them up securely.
- Strong `POSTGRES_PASSWORD`; `POSTGRES_DB=octagon`, `POSTGRES_USER=octagon`, `POSTGRES_PORT=5432`. The deployment sets `POSTGRES_HOST=db`. Do not change an existing database role's password only by editing the env file.
- `ALLOWED_HOSTS=totekeeper.com,portal.totekeeper.com` and `CSRF_TRUSTED_ORIGINS=https://totekeeper.com,https://portal.totekeeper.com` using your domains.
- `PUBLIC_BASE_URL=https://portal.totekeeper.com` so existing email, login and billing return paths remain valid.
- Email delivery and `DEFAULT_FROM_EMAIL`: use the [Gmail API over HTTPS](GMAIL_API.md) on DigitalOcean (SMTP ports may be blocked), or configure an available SMTP service. Also supply Stripe secret/webhook keys, portal configuration and business contact values described in `apps/api/.env.example`.

Never put these secrets in frontend `VITE_*` variables or in a tracked file. Actions does not upload an env file and does not print Compose's resolved environment. The optional Node Stripe sandbox is not deployed. Both webhook routes retain the same Django signature checks.

Caddy sends storefront `/api` and `/stripe/webhook` requests to Django before the React fallback, preserving paths. All portal-host requests go to Django, including `/accounts/`, `/octagon/`, `/static/`, and authorized private-photo routes. Do not expose database photos as public files.

## GitHub setup and first run

1. Commit and push the reviewed monorepo and workflow to **main**. This task does not push them. Manual deployment is intentionally restricted to main.
2. Create a GitHub Environment named **production**. Configure main as its allowed deployment branch and any desired reviewer protection.
3. Add these **environment secrets**:

| Secret | Value |
| --- | --- |
| `DEPLOY_USER` | SSH username, for example `deploy` |
| `DEPLOY_SSH_PRIVATE_KEY` | Dedicated SSH private key accepted by the server; usable non-interactively |
| `DEPLOY_SSH_KNOWN_HOSTS` | Verified OpenSSH known_hosts entry for `162.243.163.103` |

Optional environment variable `DEPLOY_PORT` overrides port 22. For a nonstandard port, the known_hosts name must be `[162.243.163.103]:PORT`. Obtain the server host-key fingerprint through the DigitalOcean console or another trusted channel, then verify the known_hosts entry before storing it. Do not trust an unverified `ssh-keyscan` result. The workflow enforces strict host-key verification.

4. In GitHub Actions choose **Deploy dedicated server ? Run workflow ? main**. There is no automatic push deployment yet. Deployment script tests and Compose/Caddy validation run alongside both existing CI suites, including PostgreSQL tests, Docker smoke tests and frontend/API proxy checks. After they pass, the production environment gate applies.
5. The job builds and uploads a SHA-addressed release, verifies its archive checksum, validates/builds server containers and checks Django settings/migration plans. It then stops the old proxy, app and worker, makes and validates a PostgreSQL dump, runs migrations, starts all components, and checks public HTTPS API health, storefront response and API 404 routing. There is a short maintenance window. A server-side lock prevents overlapping deploy scripts.

The database and TLS volumes always use Compose project `totekeeper`, regardless of release path. Successful releases update `/opt/totekeeper/current` and `current-sha`. Retrying the same SHA reuses its immutable extracted release; an incomplete extraction is rejected for operator inspection.

## Initial administration and launch readiness

After the first successful deployment, SSH in as the deploy user:

```sh
cd /opt/totekeeper/current
export RELEASE_SHA=$(cat /opt/totekeeper/current-sha)
# Run subsequent commands in this same Bash session.
compose=(docker compose --project-name totekeeper --env-file /opt/totekeeper/shared/.env -f infrastructure/server/compose.yaml)
"${compose[@]}" exec app python manage.py createsuperuser
"${compose[@]}" exec app python manage.py check_launch
"${compose[@]}" ps
```

Verify staff email and enroll/complete real MFA. Configure approved terms/policies, offerings with Stripe mappings and reviewed tax behavior, service areas and future service windows. `check_launch` can fail until these are configured: hosting the app is separate from approval to accept real enrollments. No default accounts or demo data are created. Configure Stripe's HTTPS webhook destination, for example `https://portal.totekeeper.com/api/stripe/webhook/`, and save its signing secret in the server env file. Restart the app and worker after configuration changes. Test actual provider delivery separately.

Verify storefront, portal login, MFA, authorization, password-reset email, webhook signature behavior, private photos, notification processing and backup restore. Schedule the existing `clearsessions` management command daily. Production logs intentionally omit request URLs and form bodies.

## Failure and recovery

Preflight failures leave the existing application running. Once maintenance begins, a failed backup, migration or startup can leave the app stopped or unhealthy; the workflow fails and does not automatically reverse database migrations. The `current` link advances only after health succeeds, but it does not automatically roll containers back. Investigate on the server; avoid dumping environment/configuration or sensitive logs into Actions. Backups are in `/opt/totekeeper/backups` with owner-only permissions.

For a code-only rollback, confirm schema compatibility, select a retained release SHA and invoke its `install-release.sh` using its retained incoming archive and checksum, or follow the backend's documented recovery procedure. Never automatically restore over the production database or run `docker compose down -v`. Preserve old images/releases until recovery is confirmed. A database restore requires a deliberate reviewed recovery operation.

The legacy **Deploy to IONOS** workflow still exists and remains separately configured. Disable it before the eventual hosting cutover if IONOS should no longer receive frontend updates. The earlier App Platform template is an alternative deployment method, not used by this server workflow.

No connection to this server, infrastructure provisioning, DNS changes, secret configuration or live deployment was performed while creating these files.

## Validation while preparing this workflow

YAML parsing and Bash syntax checks passed locally. Six tests passed using mocked Docker/network commands: successful release ordering and failures in preflight, backup, migration, public health and API routing. These tests do not exercise real containers. Docker is unavailable in the local workspace, so actual Compose/Caddy validation runs in the new Actions configuration job before publishing. SSH connectivity, host identity, server readiness, DNS, certificates and provider credentials remain unverified.
