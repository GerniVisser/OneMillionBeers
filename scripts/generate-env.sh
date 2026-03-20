#!/usr/bin/env bash
# Pulls all /omb/* parameters from SSM Parameter Store and writes .env
# Run on EC2 before docker compose up. Requires IAM instance profile with ssm:GetParametersByPath.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
OUTPUT_FILE="${1:-/opt/onemillionbeers/.env}"

echo "Fetching parameters from SSM /omb/ ..."

aws ssm get-parameters-by-path \
  --path "/omb/" \
  --with-decryption \
  --region "$REGION" \
  --query "Parameters[*].[Name,Value]" \
  --output text | while IFS=$'\t' read -r name value; do
    key="${name##/omb/}"
    echo "${key}=${value}"
  done > "$OUTPUT_FILE"

chmod 600 "$OUTPUT_FILE"
echo "Written to $OUTPUT_FILE"
