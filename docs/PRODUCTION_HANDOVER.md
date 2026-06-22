# Googer Main System Production Handover

This package contains the Googer main application and backend API. The production cleanup keeps existing business logic, transaction logic, advertisement logic, wallet behavior, profile behavior, and product behavior unchanged.

## Runtime Requirements

- Node.js 20 or newer
- npm
- PostgreSQL 17 compatible server
- Cloudinary and external API credentials used by the current deployment

## Install

```bash
npm install
cd backend
npm install
```

## Environment Files

Create production environment files from the examples:

```bash
cp .env.example .env.local
cp backend/.env.production.example backend/.env
```

Set database, JWT, domain, Cloudinary, currency/API, and other deployment-specific values on the target server. Do not commit real `.env` files to source control.

## Database

The final SQL export is stored in:

```text
database/googer_production_2026-06-10.sql
```

Restore example:

```bash
psql -h YOUR_DB_HOST -U YOUR_DB_USER -d Googer -f database/googer_production_2026-06-10.sql
```

## Build And Start

Frontend:

```bash
npm run build
npm run start
```

Backend:

```bash
cd backend
npm run start
```

## Notes

- `node_modules`, `.next`, logs, local tunnels, and editor files are intentionally excluded from the handover package.
- The SQL export is a handover snapshot. Confirm production credentials and secrets before deployment.
