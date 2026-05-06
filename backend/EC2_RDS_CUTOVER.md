## EC2 to RDS Cutover

Before disabling PostgreSQL on EC2, make sure the backend is using RDS:

1. Set `DATABASE_URL` or `POSTGRES_URL` in the EC2 backend environment.
2. Do not rely on `DB_HOST=localhost` for production.
3. Restart the backend and confirm logs show `Using Cloud Database Connection URL`.

To permanently turn off the local PostgreSQL server on EC2:

```bash
chmod +x backend/scripts/disable-ec2-postgres.sh
./backend/scripts/disable-ec2-postgres.sh
```

This script:

- Stops PostgreSQL immediately
- Disables it from starting on boot
- Masks the service to prevent accidental restarts

If your EC2 environment still contains local-only DB variables, update them first. The backend now prefers `DATABASE_URL` and `POSTGRES_URL` unless `FORCE_LOCAL_DB=true` is explicitly set.
