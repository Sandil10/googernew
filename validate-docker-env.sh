#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[env][fail] env file not found: $ENV_FILE" >&2
  exit 1
fi

required_keys=(
  WEB_URL
  ADMIN_URL
  MOBILE_URL
  JWT_SECRET
  INTERNAL_SERVICE_TOKEN
  OPS_MONITOR_TOKEN
)

for key in "${required_keys[@]}"; do
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- || true)"
  if [[ -z "${value:-}" ]]; then
    echo "[env][fail] missing required key: $key" >&2
    exit 1
  fi
done

if grep -q "replace-with-a-long-random-secret" "$ENV_FILE"; then
  echo "[env][fail] replace placeholder JWT secret before deployment" >&2
  exit 1
fi

if grep -q "googer-internal-dev-token" "$ENV_FILE"; then
  echo "[env][fail] replace placeholder internal token before deployment" >&2
  exit 1
fi

if grep -q "googer-ops-monitor-token" "$ENV_FILE"; then
  echo "[env][fail] replace placeholder ops monitor token before deployment" >&2
  exit 1
fi

echo "[env][ok] $ENV_FILE passed validation"
