# Aurora PostgreSQL Database Export Guide

## Overview
This guide covers exporting your Aurora PostgreSQL database (`database-1`) from AWS RDS before deletion.

## Prerequisites
- AWS CLI installed and configured with appropriate credentials
- PostgreSQL client tools (`pg_dump`) installed
- Access to your database endpoint
- Sufficient storage space for the backup file

## Option 1: AWS RDS Snapshot (Recommended - Most Complete)

### Via AWS Console:
1. Go to AWS RDS Console → Databases
2. Select `database-1`
3. Click **Actions** → **Create snapshot**
4. Name it (e.g., `database-1-backup-$(date +%Y%m%d)`)
5. Click **Create snapshot**
6. Wait for status to change to "Available"
7. Download/export snapshot if needed via AWS Backup

### Via AWS CLI:
```bash
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier database-1 \
  --db-cluster-snapshot-identifier database-1-backup-$(date +%Y%m%d) \
  --region ap-southeast-1

# Check status
aws rds describe-db-cluster-snapshots \
  --db-cluster-snapshot-identifier database-1-backup-$(date +%Y%m%d) \
  --region ap-southeast-1
```

## Option 2: pg_dump Export (Portable SQL Format)

### Get your database endpoint:
1. Go to AWS RDS Console → Databases → database-1-instance-1
2. Copy the "Endpoint" (e.g., `database-1-instance-1.xxxxx.ap-southeast-1.rds.amazonaws.com`)

### Export the database:
```bash
# Set these variables
DB_ENDPOINT="database-1-instance-1.xxxxx.ap-southeast-1.rds.amazonaws.com"
DB_PORT=5432
DB_NAME="your_database_name"
DB_USER="your_master_username"
BACKUP_FILE="database-1-backup-$(date +%Y%m%d-%H%M%S).sql"

# Run pg_dump
pg_dump -h $DB_ENDPOINT \
  -p $DB_PORT \
  -U $DB_USER \
  -d $DB_NAME \
  --verbose \
  --file=$BACKUP_FILE

# Compress the backup (optional but recommended)
gzip $BACKUP_FILE
```

### Verify the backup:
```bash
ls -lh $BACKUP_FILE
file $BACKUP_FILE
```

## Option 3: AWS Data Export (For Large Datasets)

1. Go to AWS RDS Console → Exports
2. Click **Create export**
3. Select snapshot from Option 1
4. Choose Parquet or CSV format
5. Choose S3 bucket for export location
6. Click **Create export**

## Option 4: AWS Database Migration Service (DMS)

For heterogeneous database migration or continuous replication:
1. Create DMS replication instance
2. Create source/target endpoints
3. Create migration task
4. Monitor replication

## Deletion Steps (After Backup)

### Via AWS Console:
1. Go to Databases
2. Select `database-1`
3. Click **Actions** → **Delete**
4. **IMPORTANT:** Uncheck "Create final snapshot" (you already have one)
5. Check "I acknowledge..."
6. Enter database identifier to confirm
7. Click **Delete**

### Via AWS CLI:
```bash
aws rds delete-db-cluster \
  --db-cluster-identifier database-1 \
  --skip-final-snapshot \
  --region ap-southeast-1
```

## Verification Checklist
- [ ] Backup created and verified
- [ ] Backup location documented
- [ ] All data confirmed present in backup
- [ ] Database deletion confirmed
- [ ] Application updated to use new database (if applicable)

## Restore Instructions (If Needed Later)

### From Snapshot:
```bash
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier database-1-restored \
  --snapshot-identifier database-1-backup-YYYYMMDD \
  --engine aurora-postgresql \
  --region ap-southeast-1
```

### From SQL File:
```bash
psql -h new-db-endpoint \
  -p 5432 \
  -U master_username \
  -d database_name \
  -f database-1-backup-YYYYMMDD.sql
```

## Important Notes
⚠️ **Before deletion:**
- Ensure all applications have been migrated to new database
- Verify backup is accessible and valid
- Document all connection strings and credentials
- Test restoration in a non-production environment first

⚠️ **AWS Costs:**
- Snapshots are retained and billed (manage retention)
- Data transfer charges may apply
- Monitor backup storage costs

---
**Last Updated:** 2026-04-28
