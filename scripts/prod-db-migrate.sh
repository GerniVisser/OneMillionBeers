#!/usr/bin/env bash
set -euo pipefail

# Production Flyway migration — run from /opt/onemillionbeers after .env is written.
# FLYWAY_IMAGE must be set by the caller (e.g. FLYWAY_IMAGE=ghcr.io/.../omb-flyway:<sha> ./prod-migrate.sh)

ENV_FILE="${1:-.env}"

DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)

parse() { python3 -c "from urllib.parse import urlparse; u=urlparse('${DB_URL}'); print($1)"; }
HOST=$(parse "u.hostname")
PORT=$(parse "u.port or 5432")
DBPATH=$(parse "u.path")
DB_USER=$(parse "u.username")
DB_PASS=$(parse "u.password")

docker run --rm \
  -e FLYWAY_URL="jdbc:postgresql://${HOST}:${PORT}${DBPATH}?sslmode=require" \
  -e FLYWAY_USER="${DB_USER}" \
  -e FLYWAY_PASSWORD="${DB_PASS}" \
  -e FLYWAY_BASELINE_ON_MIGRATE=true \
  -e FLYWAY_BASELINE_VERSION=4 \
  "${FLYWAY_IMAGE}" \
  migrate
