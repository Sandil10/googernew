#!/usr/bin/env bash
set -euo pipefail

: "${OPS_MONITOR_TOKEN:?OPS_MONITOR_TOKEN is required}"

MAIN_BASE_URL="${MAIN_BASE_URL:-http://127.0.0.1:5000}"
ADMIN_BASE_URL="${ADMIN_BASE_URL:-http://127.0.0.1:3002}"

curl -fsS "${MAIN_BASE_URL}/api/health" >/dev/null
curl -fsS "${ADMIN_BASE_URL}/api/health" >/dev/null
curl -fsS -H "Authorization: Bearer ${OPS_MONITOR_TOKEN}" "${MAIN_BASE_URL}/api/ops/health" >/dev/null
curl -fsS -H "Authorization: Bearer ${OPS_MONITOR_TOKEN}" "${ADMIN_BASE_URL}/api/ops/health" >/dev/null
curl -fsS -H "Authorization: Bearer ${OPS_MONITOR_TOKEN}" "${MAIN_BASE_URL}/api/ops/prometheus" >/dev/null

echo "[readiness] main and admin runtime checks passed"
