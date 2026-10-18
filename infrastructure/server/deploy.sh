#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export RELEASE_SHA=${1:?Commit SHA required}
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]]
base=/opt/totekeeper
release="$base/releases/$RELEASE_SHA"
[[ -f "$base/shared/.env" && -f "$release/apps/web/dist/index.html" ]]
[[ "$(stat -c '%a' "$base/shared/.env")" == 600 ]] || { echo 'Set shared/.env permissions to 600'; exit 1; }
compose=(docker compose --project-name totekeeper --env-file "$base/shared/.env" -f "$release/infrastructure/server/compose.yaml")
# Validate without printing resolved environment values.
"${compose[@]}" config --quiet
"${compose[@]}" build app
"${compose[@]}" pull db proxy
"${compose[@]}" run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
"${compose[@]}" up -d --wait db
"${compose[@]}" run --rm --no-deps app python manage.py check --deploy
"${compose[@]}" run --rm --no-deps app python manage.py migrate --plan
# Maintenance window: stop every application writer before backup/migration.
# An error after this point requires operator recovery; never reverse migrations automatically.
"${compose[@]}" stop proxy worker app
mkdir -p "$base/backups"
chmod 700 "$base/backups"
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-$RELEASE_SHA.dump"
# shellcheck disable=SC2016 # These variables expand inside the database container.
"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
test -s "$backup"
"${compose[@]}" exec -T db pg_restore --list < "$backup" > /dev/null
"${compose[@]}" run --rm --no-deps app python manage.py migrate --noinput
# Recreate proxy as well: it mounts static assets from this immutable release path.
"${compose[@]}" up -d --wait --force-recreate app worker proxy
portal_url=$("${compose[@]}" exec -T app python -c 'import os; print(os.environ["PUBLIC_BASE_URL"].rstrip("/"))')
[[ "$portal_url" == https://* ]]
curl --fail --silent --show-error --retry 6 --retry-delay 5 "$portal_url/api/health/" > /dev/null
web_domain=$("${compose[@]}" exec -T proxy printenv WEB_DOMAIN)
curl --fail --silent --show-error --retry 6 --retry-delay 5 "https://$web_domain/" > /dev/null
api_missing_status=$(curl --silent --show-error -o /dev/null -w '%{http_code}' "https://$web_domain/api/not-a-real-endpoint/")
[[ "$api_missing_status" == 404 ]] || { echo 'API requests fell through backend routing'; exit 1; }
ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
printf '%s\n' "$RELEASE_SHA" > "$base/current-sha"
echo "Deployment healthy: $RELEASE_SHA"
