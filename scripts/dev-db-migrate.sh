#!/usr/bin/env bash
set -euo pipefail

# Load .env.local (strip comments, export all KEY=VALUE pairs)
export $(grep -v '^#' .env.local | xargs)

DB_URL="${DATABASE_URL}"

parse() { python3 -c "from urllib.parse import urlparse; u=urlparse('${DB_URL}'); print($1)"; }
HOST=$(parse "u.hostname")
PORT=$(parse "u.port or 5432")
DBPATH=$(parse "u.path")
DB_USER=$(parse "u.username")
DB_PASS=$(parse "u.password")

# If Postgres is on localhost, reach it via the Docker network if a container is running,
# otherwise fall back to host.docker.internal (when Postgres runs on the host directly).
DOCKER_OPTS=()
if [[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]]; then
  NETWORK=$(docker inspect omb-postgres-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)
  if [[ -n "$NETWORK" ]]; then
    HOST="postgres"
    DOCKER_OPTS+=(--network "$NETWORK")
  else
    HOST="host.docker.internal"
    DOCKER_OPTS+=(--add-host=host.docker.internal:host-gateway)
  fi
fi

docker run --rm \
  "${DOCKER_OPTS[@]}" \
  -e FLYWAY_URL="jdbc:postgresql://${HOST}:${PORT}${DBPATH}" \
  -e FLYWAY_USER="${DB_USER}" \
  -e FLYWAY_PASSWORD="${DB_PASS}" \
  -e FLYWAY_BASELINE_ON_MIGRATE=true \
  -e FLYWAY_BASELINE_VERSION=4 \
  omb-flyway:local \
  migrate
