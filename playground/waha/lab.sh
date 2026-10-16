#!/usr/bin/env bash
# Helper for the WAHA lab experiments. Run ./lab.sh with no arguments for usage.
set -euo pipefail

cd "$(dirname "$0")"
# The app stack (docker-compose.app.yml) only runs under its "app" profile.
COMPOSE=(docker compose -p waha-lab -f docker-compose.yml -f docker-compose.app.yml)
WAHA=http://127.0.0.1:3200
REC=http://127.0.0.1:3201
KEY=lab-api-key

api() { curl -sS -H "x-api-key: $KEY" -H 'content-type: application/json' "$@"; echo; }
need() { [ -n "${1:-}" ] || { echo "missing argument: $2" >&2; exit 1; }; }
stamp() { echo "[$(date '+%F %T')] $*" | tee -a data/experiments.log; }

cmd=${1:-help}
shift || true
mkdir -p data

case "$cmd" in
  up) "${COMPOSE[@]}" up -d && echo "dashboard: $REC   waha: $WAHA/dashboard (lab/lab)" ;;
  down) "${COMPOSE[@]}" down ;;
  logs) "${COMPOSE[@]}" logs -f --tail 100 "$@" ;;
  ps) "${COMPOSE[@]}" --profile app ps ;;
  # The real app (collector with admin page, gateway, backend) against lab WAHA.
  app)
    case "${1:-up}" in
      up) "${COMPOSE[@]}" --profile app up -d --build && echo "admin page: http://localhost:3202/admin (admin / local-admin-password)" ;;
      down) "${COMPOSE[@]}" --profile app stop postgres migrate minio minio-init backend collector-whatsapp gateway ;;
      logs) "${COMPOSE[@]}" --profile app logs -f --tail 100 collector-whatsapp backend gateway ;;
      *) echo "usage: ./lab.sh app up|down|logs" >&2; exit 1 ;;
    esac ;;

  sessions) api "$WAHA/api/sessions?all=true" | python3 -c '
import json, sys
for s in json.load(sys.stdin):
    me = (s.get("me") or {}).get("id", "-")
    print("%-12s %-14s %s" % (s["name"], s["status"], me))' ;;
  create) need "${1:-}" session; api -X POST "$WAHA/api/sessions" -d "{\"name\":\"$1\"}" >/dev/null
    echo "created bare session; restart the recorder to apply webhooks, or add it to LAB_SESSIONS" ;;
  start | stop | restart | logout)
    need "${1:-}" session; stamp "$cmd session $1"; api -X POST "$WAHA/api/sessions/$1/$cmd" ;;
  me) need "${1:-}" session; api "$WAHA/api/sessions/$1/me" ;;

  # SIGKILL node inside the container: a real crash, so the restart policy applies
  # (a plain `docker kill` counts as a manual stop and is never restarted).
  kill) stamp "crash waha (SIGKILL node)"; docker exec waha-lab sh -c 'kill -9 $(pgrep -f "node dist/main")' ;;
  restart-waha) stamp "restart waha container"; "${COMPOSE[@]}" restart waha ;;
  pause)
    secs=${1:-60}; stamp "pause waha ${secs}s"; docker pause waha-lab; sleep "$secs"
    docker unpause waha-lab; stamp "unpause waha" ;;
  netcut)
    secs=${1:-300}; stamp "cut waha internet ${secs}s (webhooks still flow)"
    docker network disconnect waha-lab_egress waha-lab; sleep "$secs"
    docker network connect waha-lab_egress waha-lab; stamp "restore waha internet" ;;
  upgrade)
    need "${1:-}" "image tag, e.g. latest-2026.9.2"; stamp "upgrade waha to $1"
    WAHA_TAG=$1 "${COMPOSE[@]}" up -d waha ;;

  fail-rate) need "${1:-}" "rate 0..1"; stamp "webhook fail rate $1"; curl -sS -X POST "$REC/control/fail-rate?rate=$1"; echo ;;
  stats) curl -sS "$REC/api/stats" ;;
  events) curl -sS "$REC/api/events?limit=${2:-20}${1:+&session=$1}" | python3 -c '
import json, sys
for e in reversed(json.load(sys.stdin)):
    print(e["id"], e["session"], e["event"], e["event_id"], "hmac", e["hmac_ok"], "FAILED" if e["failed"] else "")' ;;
  db) exec sqlite3 data/lab.db ;;

  mem)
    # Sample WAHA memory/CPU into data/mem.csv until Ctrl-C (default every 60s).
    every=${1:-60}; [ -f data/mem.csv ] || echo "time,sessions_working,mem,cpu" >data/mem.csv
    while true; do
      working=$(api "$WAHA/api/sessions" 2>/dev/null | grep -o '"WORKING"' | wc -l || true)
      line=$(docker stats --no-stream --format '{{.MemUsage}},{{.CPUPerc}}' waha-lab | sed 's| / [^,]*||')
      echo "$(date -Is),$working,$line" | tee -a data/mem.csv
      sleep "$every"
    done ;;

  reset)
    read -r -p "Delete recorded data AND all paired sessions? [y/N] " ok; [ "$ok" = y ] || exit 1
    "${COMPOSE[@]}" down -v; rm -rf data/lab.db* data/media data/mem.csv data/experiments.log ;;

  *) cat <<'EOF'
usage: ./lab.sh <command>
  up | down | ps | logs [service]       manage the lab stack
  app up|down|logs                       real collector + admin page on :3202 against lab WAHA
  sessions                               list sessions, status, paired number
  start|stop|restart|logout <session>    session lifecycle
  me <session>                           paired account info
  kill | restart-waha                    hard kill / graceful restart of the WAHA container
  pause [secs]                           freeze WAHA (hung process)
  netcut [secs]                          cut WAHA's internet; webhooks to recorder keep working
  upgrade <tag>                          recreate WAHA on another image tag
  fail-rate <0..1>                       recorder answers that share of webhooks with 500
  stats | events [session] [n]           recorder numbers / raw recent events
  mem [secs]                             sample WAHA memory into data/mem.csv
  db                                     sqlite3 shell on the recorder database
  reset                                  wipe data and sessions (asks first)
Every disruptive command is logged with a timestamp to data/experiments.log.
EOF
  ;;
esac
