# Database Export & Deletion - Summary

**Date:** April 28, 2026  
**Target Database:** `database-1` (Aurora PostgreSQL Regional Cluster)  
**Action:** Export → Delete

---

## Files Created

### 1. **DATABASE_EXPORT_GUIDE.md**
Comprehensive guide covering:
- **Option 1:** AWS RDS Snapshots (recommended for complete backup)
- **Option 2:** pg_dump SQL export (for portable SQL format)
- **Option 3:** AWS Data Export (for large datasets to S3)
- **Option 4:** AWS DMS (for migration scenarios)
- Deletion steps (via console and CLI)
- Restoration instructions
- Important considerations and cost warnings

### 2. **export-database.bat** (Windows Batch Script)
Automated Windows script that:
- ✅ Creates an RDS cluster snapshot
- ✅ Monitors snapshot progress (polls every 30 seconds)
- ✅ Optionally exports database via pg_dump
- ✅ Compresses SQL export
- ✅ Creates detailed logs
- 📁 Saves backups to `./backups` directory

**Usage:**
```cmd
export-database.bat
```

### 3. **export-database.ps1** (PowerShell Script)
Advanced PowerShell version with:
- ✅ Better error handling and validation
- ✅ AWS credentials verification
- ✅ Real-time progress tracking
- ✅ Color-coded output
- ✅ Interactive prompts
- ✅ Detailed logging
- 📦 Automatic backup compression

**Usage:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\export-database.ps1
```

---

## Quick Start

### Recommended Workflow

#### Step 1: Create a Snapshot (Safe & Fast)
```bash
# PowerShell
.\export-database.ps1

# Or manually via AWS CLI
aws rds create-db-cluster-snapshot `
  --db-cluster-identifier database-1 `
  --db-cluster-snapshot-identifier database-1-backup-$(Get-Date -Format 'yyyyMMdd') `
  --region ap-southeast-1
```

**Time:** 5-15 minutes  
**Cost:** Snapshot storage (varies by data size)  
**Benefit:** Can restore entire database anytime

---

#### Step 2 (Optional): Export SQL Dump
If you need a portable SQL backup:

```bash
# Get the writer instance endpoint from AWS Console
# Then run pg_dump:

$env:PGPASSWORD = "your_password"
pg_dump -h database-1-instance-1.xxxxx.ap-southeast-1.rds.amazonaws.com `
  -U master_username `
  -d postgres `
  -f database-1-backup-20260428.sql

# Compress it
gzip database-1-backup-20260428.sql
```

**Time:** 5-30 minutes (depends on data size)  
**Benefit:** Database-agnostic format (can restore anywhere)

---

#### Step 3: Verify Backup
```bash
# List snapshots
aws rds describe-db-cluster-snapshots `
  --db-cluster-identifier database-1 `
  --region ap-southeast-1

# Check backup files
ls -la backups/
```

---

#### Step 4: Delete the Cluster (When Ready)

**⚠️ WARNING: This is irreversible. Ensure backups are secure first.**

**Via AWS Console:**
1. Go to RDS → Databases
2. Click `database-1`
3. Actions → Delete
4. Uncheck "Create final snapshot" (you already have one)
5. Check "I acknowledge..."
6. Type the database identifier
7. Click Delete

**Via AWS CLI:**
```bash
aws rds delete-db-cluster `
  --db-cluster-identifier database-1 `
  --skip-final-snapshot `
  --region ap-southeast-1
```

---

## Pre-Deletion Checklist

Before deleting, verify:

- [ ] **Snapshot Created & Accessible**
  ```bash
  aws rds describe-db-cluster-snapshots --region ap-southeast-1
  ```

- [ ] **Application Updated** (if needed)
  - Update connection strings in environment
  - Redeploy app pointing to new database
  - Test connections

- [ ] **Data Migration Complete**
  - All necessary data transferred
  - No active connections to old database

- [ ] **Backup Verified**
  - Tested restore in non-prod environment
  - Backup files are accessible
  - Backup location documented

- [ ] **Security**
  - Remove secrets from shell history
  - Clear temporary backup files
  - Verify no hardcoded credentials in code

- [ ] **Documentation**
  - Keep snapshot ID: `database-1-backup-20260428` (example)
  - Document deletion date/time
  - Update runbooks/procedures

---

## Backup Storage Locations

### After Running export-database Script
```
./backups/
├── export-20260428-143022.log
├── database-1-20260428-143022.sql.gz
└── database-1-20260428-143022.sql (if uncompressed)
```

### AWS RDS Snapshots
- **Location:** AWS RDS Console → Snapshots
- **Retention:** Manual (stays until deleted)
- **Cost:** $0.021/GB-month (varies by region)

### AWS Backup Service (if enabled)
- **Location:** AWS Backup Console → Backup vaults
- **Retention:** Based on backup plan policy

---

## Cost Estimation

| Component | Timeframe | Cost |
|-----------|-----------|------|
| **Snapshot Storage** | Per GB/month | $0.021/GB |
| **Data Transfer (Export)** | One-time | $0.01-0.02/GB |
| **pg_dump Download** | One-time | Minimal |
| **Cluster Deletion** | After deletion | $0 (stops billing) |

**Example:** 100GB database
- Snapshot: ~$2.10/month
- Export transfer: ~$1-2
- **Total to export & backup:** ~$3-4

---

## Restoration Scenarios

### Scenario 1: Restore from Snapshot
```bash
aws rds restore-db-cluster-from-snapshot `
  --db-cluster-identifier database-1-restored `
  --snapshot-identifier database-1-backup-20260428 `
  --engine aurora-postgresql `
  --region ap-southeast-1
```
**Time:** 15-30 minutes  
**Downtime:** New cluster is separate URL

### Scenario 2: Restore from SQL File
```bash
# Decompress if needed
gunzip database-1-backup-20260428.sql.gz

# Restore
$env:PGPASSWORD = "password"
psql -h new-cluster-endpoint.rds.amazonaws.com `
  -U postgres `
  -d postgres `
  -f database-1-backup-20260428.sql
```
**Time:** Depends on data size (10-30 minutes typical)

---

## Troubleshooting

### Snapshot Fails
```bash
# Check permissions
aws iam get-user

# Verify cluster exists
aws rds describe-db-clusters --region ap-southeast-1
```

### pg_dump Connection Error
```bash
# Test connectivity first
psql -h $DB_ENDPOINT -U $DB_USER -d postgres -c "SELECT 1"

# Verify security group allows inbound 5432
# Verify DB parameter group allows connections
```

### Script Execution Error (PowerShell)
```powershell
# Allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Run script with full path
& "C:\path\to\export-database.ps1"
```

### Snapshot Stuck
```bash
# Cancel stuck snapshot
aws rds delete-db-cluster-snapshot `
  --db-cluster-snapshot-identifier database-1-backup-stuck `
  --region ap-southeast-1
```

---

## Additional Resources

- **AWS RDS Documentation:** https://docs.aws.amazon.com/rds/
- **PostgreSQL pg_dump:** https://www.postgresql.org/docs/current/app-pgdump.html
- **AWS CLI Reference:** https://docs.aws.amazon.com/cli/latest/userguide/
- **AWS Database Migration Service:** https://docs.aws.amazon.com/dms/

---

## Next Steps

1. ✅ Review this guide
2. ✅ Run export script: `.\export-database.ps1`
3. ✅ Verify snapshot in AWS Console
4. ✅ Test restore if needed
5. ✅ Update application configuration
6. ✅ Complete pre-deletion checklist
7. ✅ Delete cluster via AWS Console or CLI
8. ✅ Monitor billing to confirm deletion

---

**Status:** Ready for execution  
**Last Updated:** April 28, 2026  
**Prepared By:** Database Export Automation
