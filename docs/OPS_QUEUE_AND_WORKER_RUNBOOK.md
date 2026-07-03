# Queue And Worker Ops Runbook

## Purpose

This runbook is the repeatable operational guide for checking queue health,
worker health, and degraded background processing on staging/production Docker
servers.

## Auth

The ops endpoints require `OPS_MONITOR_TOKEN`.

Example:

```bash
curl -H "Authorization: Bearer $OPS_MONITOR_TOKEN" http://127.0.0.1:5000/api/ops/health
curl -H "Authorization: Bearer $OPS_MONITOR_TOKEN" http://127.0.0.1:5000/api/ops/metrics
```

## Healthy Signals

Expected healthy state:

- `/api/ops/health` returns `200`
- `database` is `Connected`
- `checks.failedJobs` is `ok`
- `checks.staleWorkers` is `ok`
- queue pending jobs do not grow continuously
- worker heartbeat ages stay below `WORKER_STALE_AFTER_SECONDS`

## Queue Checks

Watch:

- `pending_jobs`
- `running_jobs`
- `failed_jobs`
- `oldest_pending_age_seconds`

Degraded examples:

- `failed_jobs > 0`
- `oldest_pending_age_seconds` keeps growing
- a queue has pending jobs but no active worker heartbeat

## Worker Checks

Watch:

- `status`
- `current_job_type`
- `heartbeat_age_seconds`
- `is_stale`
- `last_error`

Degraded examples:

- `is_stale = true`
- repeated crash loops in `docker compose logs`
- workers stuck on one job for too long

## Docker Commands

```bash
docker compose ps
docker compose logs --tail=100 main-worker notification-worker main-backend
docker compose restart main-worker
docker compose restart notification-worker
```

## Recovery Order

1. Check `/api/ops/health`
2. Check `/api/ops/metrics`
3. Check container status with `docker compose ps`
4. Inspect recent logs
5. Restart only the degraded worker/service first
6. Restart backend only if API health is failing
7. Escalate to DB/Redis investigation if stale workers or failed jobs continue
