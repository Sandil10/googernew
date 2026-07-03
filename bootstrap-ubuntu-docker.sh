#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/googernew-main}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
SOURCE_ENV_FILE="${SOURCE_ENV_FILE:-$APP_DIR/.env.staging.example}"

echo "[bootstrap] app dir: $APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "[bootstrap][fail] docker is not installed" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[bootstrap][fail] docker compose is not available" >&2
  exit 1
fi

mkdir -p "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ ! -f "$SOURCE_ENV_FILE" ]]; then
    echo "[bootstrap][fail] env template not found: $SOURCE_ENV_FILE" >&2
    exit 1
  fi
  cp "$SOURCE_ENV_FILE" "$ENV_FILE"
  echo "[bootstrap] created env file from template: $ENV_FILE"
else
  echo "[bootstrap] env file already exists: $ENV_FILE"
fi

cd "$APP_DIR"
bash ./scripts/validate-docker-env.sh "$ENV_FILE"
docker compose --env-file "$ENV_FILE" config --quiet

echo "[bootstrap] docker compose config validated"
echo "[bootstrap] next:"
echo "  docker compose --env-file $ENV_FILE --profile local-db up -d"
