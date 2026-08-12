#!/usr/bin/env bash
set -euo pipefail

# Opens a local port forward to the production RDS instance via SSM Session
# Manager, tunnelling through the EC2 box. No inbound ports are opened and the
# database stays private (rds.tf: publicly_accessible = false) — the session
# originates from the instance, which is the only source the RDS security group
# accepts (security_groups.tf).
#
#   ./scripts/db-tunnel.sh            # forwards localhost:15432 -> prod:5432
#   LOCAL_PORT=6543 ./scripts/db-tunnel.sh
#
# Runs in the foreground; Ctrl-C closes the tunnel. Connect from another shell:
#   psql "postgresql://analytics@localhost:15432/omb"

AWS_REGION="${AWS_REGION:-us-east-1}"
LOCAL_PORT="${LOCAL_PORT:-15432}"
INSTANCE_TAG="${INSTANCE_TAG:-omb-app}"        # ec2.tf: tags = { Name = "omb-app" }
DB_IDENTIFIER="${DB_IDENTIFIER:-omb-postgres}" # rds.tf: identifier

for cmd in aws session-manager-plugin; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' not found on PATH." >&2
    if [ "$cmd" = "session-manager-plugin" ]; then
      echo "Install: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html" >&2
    fi
    exit 1
  fi
done

echo "Resolving instance and database endpoint in ${AWS_REGION}..." >&2

INSTANCE_ID=$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --filters "Name=tag:Name,Values=${INSTANCE_TAG}" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "error: no running instance tagged Name=${INSTANCE_TAG} in ${AWS_REGION}." >&2
  exit 1
fi

RDS_HOST=$(aws rds describe-db-instances \
  --region "$AWS_REGION" \
  --db-instance-identifier "$DB_IDENTIFIER" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

if [ -z "$RDS_HOST" ] || [ "$RDS_HOST" = "None" ]; then
  echo "error: could not resolve endpoint for RDS instance ${DB_IDENTIFIER}." >&2
  exit 1
fi

echo "  instance : ${INSTANCE_ID}" >&2
echo "  database : ${RDS_HOST}:5432" >&2
echo "  local    : localhost:${LOCAL_PORT}" >&2
echo >&2
echo "Connect with: psql \"postgresql://analytics@localhost:${LOCAL_PORT}/omb\"" >&2
echo "Ctrl-C to close the tunnel." >&2
echo >&2

exec aws ssm start-session \
  --region "$AWS_REGION" \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
