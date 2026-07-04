#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/googernew-main}"
BASE_URL="${LOAD_TEST_BASE_URL:-http://127.0.0.1:5000}"
SCENARIO_FILE="${LOAD_TEST_SCENARIO_FILE:-$APP_DIR/shared/load-test-scenarios/main-public-mixed.json}"
SCENARIO_FILE_CONTAINER="${LOAD_TEST_SCENARIO_FILE_CONTAINER:-/app/googernew/shared/load-test-scenarios/$(basename "$SCENARIO_FILE")}"
DURATION_SECONDS="${LOAD_TEST_DURATION_SECONDS:-20}"
TIMEOUT_MS="${LOAD_TEST_TIMEOUT_MS:-10000}"
WARMUP_SECONDS="${LOAD_TEST_WARMUP_SECONDS:-3}"
STAGES="${LOAD_TEST_STAGES:-25,50,100,150}"

run_host_loadtest() {
  cd "$APP_DIR/backend"
  npm run loadtest
}

run_container_loadtest() {
  cd "$APP_DIR"
  docker compose exec -T main-backend sh -lc "\
    cd /app/googernew/backend && \
    LOAD_TEST_BASE_URL='$BASE_URL' \
    LOAD_TEST_SCENARIO_FILE='$SCENARIO_FILE_CONTAINER' \
    LOAD_TEST_CONCURRENCY='$CONCURRENCY' \
    LOAD_TEST_DURATION_SECONDS='$DURATION_SECONDS' \
    LOAD_TEST_TIMEOUT_MS='$TIMEOUT_MS' \
    LOAD_TEST_WARMUP_SECONDS='$WARMUP_SECONDS' \
    npm run loadtest"
}

for CONCURRENCY in ${STAGES//,/ }; do
  echo "[load-test] starting concurrency=$CONCURRENCY duration=${DURATION_SECONDS}s base=$BASE_URL"
  if command -v npm >/dev/null 2>&1; then
    LOAD_TEST_BASE_URL="$BASE_URL" \
    LOAD_TEST_SCENARIO_FILE="$SCENARIO_FILE" \
    LOAD_TEST_CONCURRENCY="$CONCURRENCY" \
    LOAD_TEST_DURATION_SECONDS="$DURATION_SECONDS" \
    LOAD_TEST_TIMEOUT_MS="$TIMEOUT_MS" \
    LOAD_TEST_WARMUP_SECONDS="$WARMUP_SECONDS" \
    run_host_loadtest || true
  else
    run_container_loadtest || true
  fi
  echo "[load-test] finished concurrency=$CONCURRENCY"
  sleep 3
done
