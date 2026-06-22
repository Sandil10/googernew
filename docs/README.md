# Googer Main App Runbook

This is the main Googer user application. It contains:

- Next.js frontend in `app/`
- Express backend in `backend/src/`
- Socket.IO realtime chat
- PostgreSQL database access
- upload/content APIs, wallet, ads, market, feed, chat, orders, and subscriptions

The backend is real and separate in code. The current architecture is a modular monolith, not microservices.

## Local Development

Run from `googernew-main`:

```bash
npm install
cd backend && npm install
cd ..
npm run dev:all
```

Open:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:5000/api/health
```

Run frontend only:

```bash
npm run dev:3000
```

Run backend only:

```bash
cd backend
npm run dev
```

Run worker:

```bash
cd backend
npm run worker
```

## Public Access Without LocalTunnel

Use Cloudflare Tunnel instead of `loca.lt` if you want a public URL without the LocalTunnel warning page.

Start the app locally:

```bash
npm run dev:all
```

Expose frontend:

```bash
npm run tunnel:frontend
```

Expose backend:

```bash
npm run tunnel:backend
```

Quick tunnels are temporary. For production, use a named Cloudflare Tunnel connected to your own domain.

## Production Docker

Docker files are at the workspace root, not inside this folder:

```text
C:\Users\Administrator\Documents\new
```

Read:

```text
ARCHITECTURE_DOCKER_SCALING_PLAN.md
docker-compose.yml
.env.docker.example
```

Basic Docker flow from the workspace root:

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d redis main-backend main-worker main-frontend admin-app
```

## Deployment Notes

For real scale:

- Use managed PostgreSQL.
- Use Cloudflare R2/S3/Cloudinary + CDN for uploaded media.
- Use Redis for distributed cache and Socket.IO scaling.
- Run backend in cluster mode.
- Run background workers separately from API.
- Load test before claiming 1,000 concurrent users.

## GitHub

The recommended repository root is the workspace root because Docker needs:

```text
googernew-main
googeradminpanel
shared
```

Push from:

```bash
cd C:\Users\Administrator\Documents\new
git remote add origin https://github.com/YOUR_ORG/YOUR_REPO.git
git push -u origin main
```

Do not commit real `.env` files or database dumps.
