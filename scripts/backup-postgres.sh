#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR=${1:-./backups}
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DATABASE_URL_VALUE=${DATABASE_URL:-}
mkdir -p $OUTPUT_DIR

if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
  docker compose exec -T postgres sh -lc '
    PGPASSWORD=${POSTGRES_PASSWORD:-} \
    pg_dump -U ${POSTGRES_USER:-googer} ${POSTGRES_DB:-googer}
  ' | gzip > $OUTPUT_DIR/postgres-${TIMESTAMP}.sql.gz
elif [ -n $DATABASE_URL_VALUE ]; then
  pg_dump $DATABASE_URL_VALUE | gzip > $OUTPUT_DIR/postgres-${TIMESTAMP}.sql.gz
else
  DB_HOST=${DB_HOST:-127.0.0.1}
  DB_NAME=${DB_NAME:-googer}
  DB_USER=${DB_USER:-googer}
  export PGPASSWORD=${DB_PASSWORD:-}
  pg_dump -h $DB_HOST -p ${DB_PORT:-5432} -U $DB_USER $DB_NAME | gzip > $OUTPUT_DIR/postgres-${TIMESTAMP}.sql.gz
fi

echo [backup] wrote $OUTPUT_DIR/postgres-${TIMESTAMP}.sql.gz

