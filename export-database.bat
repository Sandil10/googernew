@echo off
REM Export Aurora PostgreSQL Database from AWS RDS
REM This script creates an RDS snapshot and optionally exports via pg_dump

setlocal enabledelayedexpansion

echo ========================================
echo Aurora PostgreSQL Database Export Tool
echo ========================================
echo.

REM Configuration
set AWS_REGION=ap-southeast-1
set DB_CLUSTER_ID=database-1
set DB_INSTANCE_ID=database-1-instance-1
set TIMESTAMP=%date:~10,4%%date:~4,2%%date:~7,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set SNAPSHOT_ID=!DB_CLUSTER_ID!-backup-!TIMESTAMP!
set BACKUP_DIR=%cd%\backups
set LOG_FILE=!BACKUP_DIR!\export-!TIMESTAMP!.log

REM Create backup directory
if not exist "!BACKUP_DIR!" mkdir "!BACKUP_DIR!"

echo [%date% %time%] Starting database export... >> "!LOG_FILE!"
echo Backup Directory: !BACKUP_DIR! >> "!LOG_FILE!"
echo.

echo Step 1: Checking AWS CLI installation...
where aws >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] AWS CLI not found. Please install it first.
    echo [ERROR] Download from: https://aws.amazon.com/cli/
    exit /b 1
)
echo [OK] AWS CLI found
echo [OK] AWS CLI found >> "!LOG_FILE!"
echo.

echo Step 2: Creating RDS snapshot...
echo Creating snapshot: !SNAPSHOT_ID!
aws rds create-db-cluster-snapshot ^
    --db-cluster-identifier !DB_CLUSTER_ID! ^
    --db-cluster-snapshot-identifier !SNAPSHOT_ID! ^
    --region !AWS_REGION! >> "!LOG_FILE!" 2>&1

if !errorlevel! neq 0 (
    echo [ERROR] Failed to create snapshot
    type "!LOG_FILE!"
    exit /b 1
)
echo [OK] Snapshot creation initiated: !SNAPSHOT_ID!
echo [OK] Snapshot creation initiated >> "!LOG_FILE!"
echo.

echo Step 3: Waiting for snapshot completion...
echo This may take several minutes. Checking status every 30 seconds...
setlocal enabledelayedexpansion
set MAX_WAIT=3600
set ELAPSED=0

:wait_loop
if !ELAPSED! geq !MAX_WAIT! (
    echo [WARNING] Timeout waiting for snapshot
    goto skip_wait
)

for /f "delims=" %%A in ('aws rds describe-db-cluster-snapshots --db-cluster-snapshot-identifier !SNAPSHOT_ID! --region !AWS_REGION! --query "DBClusterSnapshots[0].Status" --output text 2^>nul') do set SNAPSHOT_STATUS=%%A

if "!SNAPSHOT_STATUS!"=="available" (
    echo [OK] Snapshot is ready!
    echo [OK] Snapshot Status: available >> "!LOG_FILE!"
    goto snapshot_ready
)

echo    Current status: !SNAPSHOT_STATUS! (elapsed: !ELAPSED!s)
timeout /t 30 /nobreak >nul
set /a ELAPSED+=30
goto wait_loop

:snapshot_ready
echo.
echo Step 4: Optional - Export via pg_dump
echo.
echo To export the database as SQL file:
echo.
echo   1. Get the database endpoint from AWS Console
echo   2. Run: pg_dump -h ^<endpoint^> -U ^<username^> -d ^<database_name^> -f "!BACKUP_DIR!\database-1-!TIMESTAMP!.sql"
echo.
echo   Or use the provided pg_dump command below:
echo.
set /p DB_ENDPOINT="Enter database endpoint (or press Enter to skip): "

if not "!DB_ENDPOINT!"=="" (
    set /p DB_USER="Enter database username: "
    set /p DB_NAME="Enter database name: "
    set /p DB_PASSWORD="Enter database password: "
    
    set EXPORT_FILE=!BACKUP_DIR!\database-1-!TIMESTAMP!.sql
    
    echo Exporting database to: !EXPORT_FILE!
    
    REM Set password in environment variable for pg_dump
    set PGPASSWORD=!DB_PASSWORD!
    
    pg_dump -h !DB_ENDPOINT! -U !DB_USER! -d !DB_NAME! --verbose --file="!EXPORT_FILE!" >> "!LOG_FILE!" 2>&1
    
    if !errorlevel! equ 0 (
        echo [OK] Database exported successfully!
        echo Compressing backup...
        tar -czf "!EXPORT_FILE!.gz" -C "!BACKUP_DIR!" "database-1-!TIMESTAMP!.sql"
        if exist "!EXPORT_FILE!" del "!EXPORT_FILE!"
        echo [OK] Backup compressed: !EXPORT_FILE!.gz
    ) else (
        echo [ERROR] pg_dump failed. Check log for details.
    )
)

:skip_wait
echo.
echo ========================================
echo Export Complete
echo ========================================
echo Snapshot ID: !SNAPSHOT_ID!
echo Backup Location: !BACKUP_DIR!
echo Log File: !LOG_FILE!
echo.
echo Next steps:
echo 1. Verify snapshot exists in AWS Console
echo 2. Download backup if needed
echo 3. When ready, delete the database cluster
echo.
echo Log file contents:
echo.
type "!LOG_FILE!"

endlocal
