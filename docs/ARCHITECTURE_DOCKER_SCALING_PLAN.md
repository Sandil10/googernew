# Googer Architecture, Docker, GitHub, and 1,000 Concurrent User Plan

## 1. Current Architecture

This codebase is not backend-less. It is a two-app modular monolith:

- `googernew-main`
  - Next.js main user frontend.
  - Express backend in `googernew-main/backend/src`.
  - REST APIs for auth, wallet, ads, market, upload content, chat, orders, subscriptions, feed, and admin support routes.
  - Socket.IO realtime chat.
  - PostgreSQL access through `pg`.
  - Background worker support.
  - Cluster server support via `backend/src/clusterServer.js`.

- `googeradminpanel`
  - Admin Next.js app.
  - Express admin backend in the same folder.
  - Admin routes for users, products, posts, wallet, ads, reports, verification, orders, categories, and notifications.
  - Background worker support.

- `shared`
  - Shared contracts, finance utilities, migrations, background worker utilities, and load-test scripts.

Current architecture name:

```text
Two-app modular monolith with shared utilities
```

It is not microservices yet, but it has real backend separation in code.

## 2. What Docker Is Used For

Docker gives repeatable deployment units:

- `main-frontend`: Next.js frontend for users.
- `main-backend`: Express API for the main app.
- `main-worker`: background worker for recurring jobs.
- `admin-app`: admin Express + Next production server.
- `redis`: cache/queue-ready dependency.
- optional `postgres`: local development database only.

Docker helps with:

- same runtime on local/VPS/cloud
- easier deployment
- independent process scaling
- cleaner environment variables
- future Kubernetes/ECS migration
- worker separation from API traffic

Docker does not automatically make the app scalable. It makes scaling easier.

## 3. Files Added

At workspace root:

```text
.dockerignore
.env.docker.example
docker-compose.yml
docker/main-frontend.Dockerfile
docker/main-backend.Dockerfile
docker/admin-app.Dockerfile
ARCHITECTURE_DOCKER_SCALING_PLAN.md
```

## 4. GitHub Upload Steps

Neither `googernew-main` nor `googeradminpanel` is currently a Git repository. The cleanest approach is to make the workspace root `C:\Users\Administrator\Documents\new` the repository, because Docker needs all three folders:

```text
googernew-main
googeradminpanel
shared
```

Run from:

```powershell
cd C:\Users\Administrator\Documents\new
```

Initialize Git:

```powershell
git init
git add .dockerignore .env.docker.example docker-compose.yml docker ARCHITECTURE_DOCKER_SCALING_PLAN.md googernew-main googeradminpanel shared
git commit -m "Add Docker deployment and scalability plan"
```

Create an empty GitHub repository, then connect it:

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_ORG/YOUR_REPO.git
git push -u origin main
```

If GitHub authentication is not configured, use GitHub CLI:

```powershell
gh auth login
gh repo create YOUR_ORG/YOUR_REPO --private --source . --remote origin --push
```

Important:

- Do not commit real `.env` files.
- Commit `.env.docker.example`, not `.env.docker`.
- Check secrets before push:

```powershell
git status --short
git diff --cached -- . ':!*.lock'
```

## 5. Docker Run Steps

Copy the env example:

```powershell
cd C:\Users\Administrator\Documents\new
Copy-Item .env.docker.example .env.docker
```

Edit `.env.docker`:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
JWT_SECRET=long-random-secret
WEB_URL=https://app.infranex.it.com
ADMIN_URL=https://appadmin.infranex.it.com
```

Build containers:

```powershell
docker compose --env-file .env.docker build
```

Start production-like stack with managed database:

```powershell
docker compose --env-file .env.docker up -d redis main-backend main-worker main-frontend admin-app
```

For local database testing only:

```powershell
docker compose --env-file .env.docker --profile local-db up -d
```

Check status:

```powershell
docker compose --env-file .env.docker ps
```

Check logs:

```powershell
docker compose --env-file .env.docker logs -f main-backend
docker compose --env-file .env.docker logs -f main-frontend
docker compose --env-file .env.docker logs -f admin-app
```

Open:

```text
Main frontend: http://localhost:3000
Main backend:  http://localhost:5000/api/health
Admin app:     http://localhost:3002
Redis:         localhost:6379
```

## 6. 1,000 Concurrent User Plan

Target:

```text
1,000 concurrent users
10,000+ DAU
```

This is achievable, but it must be proven by load testing.

### Phase 1: Production Hardening

Required:

- Use managed PostgreSQL.
- Use Cloudflare R2/S3/Cloudinary for media.
- Put CDN in front of media.
- Run backend with cluster mode.
- Run worker separately from API.
- Use Redis for distributed cache and future queues.
- Apply hot-path DB indexes.
- Enable health checks and metrics.

Recommended container count:

```text
main-frontend: 2 replicas
main-backend: 2-4 replicas
main-worker: 1-2 replicas
admin-app: 1 replica
redis: managed Redis or one container for small production
postgres: managed database, not compose container
```

For each main backend container:

```text
CLUSTER_WORKERS=2 or 4
DB_POOL_MAX=10-20
```

Do not set `DB_POOL_MAX` too high across many replicas. Total database connections matter:

```text
total DB connections = backend replicas * workers * DB_POOL_MAX + workers/admin connections
```

### Phase 2: Media Scale

Current local uploads are not ideal for high scale. Required future setup:

- Store upload originals/compressed media in object storage.
- Serve through CDN.
- Do not serve videos from the Node backend.
- Move video compression to worker queue.
- Save:
  - thumbnail image
  - 480p feed video
  - original/private source only if needed

Current implementation note:

- Main upload storage uses Cloudinary automatically when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are set.
- Set `FORCE_LOCAL_UPLOADS=true` only for local testing.
- Without Cloudinary credentials, Docker falls back to the `main-uploads` volume.

This reduces app lag and bandwidth.

### Phase 3: Cache and Feed Scale

Add Redis-backed cache for:

- public upload content
- home feed pages
- category lists
- product/ad public cards
- profile summaries

Use short TTLs:

```text
feed cache: 10-30 seconds
profile cache: 30-60 seconds
category cache: 5-10 minutes
```

Invalidate on writes where needed.

### Phase 4: Realtime Scale

Socket.IO needs a Redis adapter when backend replicas > 1.

Required:

- `@socket.io/redis-adapter`
- shared Redis pub/sub
- sticky sessions at load balancer, or WebSocket-aware routing

Without this, chat can behave inconsistently across multiple backend containers.

### Phase 5: Load Testing

Use existing load test script:

```powershell
cd C:\Users\Administrator\Documents\new\googernew-main\backend
$env:LOAD_TEST_BASE_URL="http://localhost:5000"
$env:LOAD_TEST_SCENARIO_FILE="..\..\shared\load-test-scenarios\main-public-mixed.json"
$env:LOAD_TEST_CONCURRENCY="100"
$env:LOAD_TEST_DURATION_SECONDS="60"
npm run loadtest
```

Increase gradually:

```text
100 concurrent
250 concurrent
500 concurrent
750 concurrent
1000 concurrent
```

Pass criteria:

```text
error rate < 1%
p95 latency < 500ms for public GET routes
p95 latency < 1000ms for authenticated/write routes
CPU < 75% average
DB connections below database max
memory stable, no leak
```

## 7. Current Capacity Estimate

These are estimates, not guarantees.

### Current non-Docker/simple server

```text
DAU: 1,000 - 5,000
Concurrent: 100 - 300
```

Main risks:

- media serving from app server
- DB query load
- Socket.IO scaling
- upload/video compression inside request lifecycle
- no distributed cache

### Docker + managed DB + CDN + Redis + cluster

```text
DAU: 10,000+
Concurrent: 1,000 possible
```

Must be verified by load test.

### Future microservices

```text
DAU: 50,000+
Concurrent: 5,000+
```

Depends on infrastructure budget and implementation quality.

## 8. Microservices Roadmap

Do not split everything immediately. Split by load and risk.

Recommended order:

1. `media-service`
   - uploads
   - compression
   - thumbnails
   - object storage

2. `wallet-service`
   - wallet balances
   - transfers
   - transaction safety
   - idempotency

3. `feed-service`
   - home feed
   - reels
   - public discovery

4. `chat-service`
   - Socket.IO
   - messages
   - realtime status

5. `notification-service`
   - notifications
   - email/push later

6. `ads-service`
   - campaigns
   - impressions
   - clicks
   - reach caps

Keep shared contracts and DB migrations controlled carefully during each split.

## 9. What To Tell The Client

Use this wording:

```text
The current system is not backend-less. It has two Express backends: one for the main app and one for the admin app, plus Next.js frontends, PostgreSQL, Socket.IO, workers, and shared utilities. The architecture is a modular monolith, not microservices. It can support 10,000 DAU and 1,000 concurrent users after production hardening with Docker, CDN/object storage, Redis, database indexing, worker separation, and load testing. For future scale, we should gradually split media, wallet, feed, and chat into microservices instead of rewriting everything at once.
```

## 10. Immediate Next Checklist

- [ ] Create GitHub repo at workspace root.
- [ ] Commit code without secrets.
- [ ] Fill `.env.docker`.
- [ ] Build Docker images.
- [ ] Run Docker Compose.
- [ ] Move media to Cloudinary/R2/S3.
- [ ] Add Redis-backed cache where code currently uses in-memory cache.
- [ ] Add Socket.IO Redis adapter before multiple backend replicas.
- [ ] Run 100, 250, 500, 1000 concurrent load tests.
- [ ] Tune DB pool and indexes from load-test results.
