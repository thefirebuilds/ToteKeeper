#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
release_sha=${1:?Commit SHA required}
archive_hash=${2:?Archive SHA256 required}
[[ "$release_sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$archive_hash" =~ ^[a-f0-9]{64}$ ]]
base=/opt/totekeeper
exec 9>"$base/.deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
archive="$base/incoming/$release_sha.tar.gz.part"
printf '%s  %s\n' "$archive_hash" "$archive" | sha256sum --check --status
release="$base/releases/$release_sha"
if [[ ! -d "$release" ]]; then
    mkdir "$release"
    tar -xzf "$archive" -C "$release" --no-same-owner
    touch "$release/.extracted"
fi
[[ -f "$release/.extracted" ]] || { echo 'Incomplete extraction: inspect release directory'; exit 1; }
bash "$release/infrastructure/server/deploy.sh" "$release_sha"
