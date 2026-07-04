#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/googernew-main}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-googernew-main-postgres-1}"
DUMP_FILE="${1:-$APP_DIR/database/googer_production_2026-06-10.sql}"
DB_NAME="${DB_NAME:-googer}"
DB_USER="${DB_USER:-googer}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "[restore][fail] dump file not found: $DUMP_FILE" >&2
  exit 1
fi

cd "$APP_DIR"
docker compose --env-file "$ENV_FILE" --profile local-db up -d "$POSTGRES_SERVICE"

echo "[restore] recreating database $DB_NAME"
docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE);"
docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

TMP_DUMP="/tmp/$(basename "$DUMP_FILE")"
docker cp "$DUMP_FILE" "$POSTGRES_CONTAINER:$TMP_DUMP"
docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -f "$TMP_DUMP"

echo "[restore] applying migrations"
docker compose --env-file "$ENV_FILE" --profile local-db run --rm main-backend npm run migrate

echo "[restore] restarting application containers"
docker compose --env-file "$ENV_FILE" --profile local-db up -d main-backend main-worker media-service notification-service notification-worker main-frontend admin-app

echo "[restore] complete"
