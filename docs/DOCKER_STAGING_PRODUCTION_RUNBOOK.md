# Docker Staging And Production Runbook

## Purpose

This document makes Docker deployment repeatable for staging and production.

## Files To Use

- `.env.staging.example`
- `.env.production.example`
- `scripts/bootstrap-ubuntu-docker.sh`
- `scripts/restore-postgres-dump.sh`
- `scripts/validate-docker-env.sh`
- `scripts/run-staged-load-test.sh`

## Bootstrap

```bash
chmod +x scripts/*.sh
./scripts/bootstrap-ubuntu-docker.sh
```

## Restore Existing Database Snapshot

```bash
./scripts/restore-postgres-dump.sh ./database/googer_production_2026-06-10.sql
```

## Start Stack

```bash
docker compose --env-file .env --profile local-db up -d
```

## Validate Ops

```bash
curl -H "Authorization: Bearer $OPS_MONITOR_TOKEN" http://127.0.0.1:5000/api/ops/health
curl -H "Authorization: Bearer $OPS_MONITOR_TOKEN" http://127.0.0.1:5000/api/ops/metrics
```

## Staged Load Test

```bash
./scripts/run-staged-load-test.sh
```

## Secrets Rule

Do not deploy with placeholder values for:

- `JWT_SECRET`
- `INTERNAL_SERVICE_TOKEN`
- `OPS_MONITOR_TOKEN`

Run:

```bash
./scripts/validate-docker-env.sh .env
```
