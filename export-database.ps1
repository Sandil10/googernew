# Aurora PostgreSQL Database Export Tool
# PowerShell version with more robust error handling

param(
    [string]$ClusterID = "database-1",
    [string]$InstanceID = "database-1-instance-1",
    [string]$Region = "ap-southeast-1",
    [string]$BackupDir = "backups"
)

# Configuration
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshotID = "$ClusterID-backup-$timestamp"
$logFile = "$BackupDir\export-$timestamp.log"
$backupPath = (Join-Path -Path $PSScriptRoot -ChildPath $BackupDir)

# Colors for output
$colors = @{
    Success = "Green"
    Error = "Red"
    Warning = "Yellow"
    Info = "Cyan"
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "Info",
        [ValidateSet("Success", "Error", "Warning", "Info")]
        [string]$Type = "Info"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    Add-Content -Path $logFile -Value $logMessage
    Write-Host $logMessage -ForegroundColor $colors[$Type]
}

function Initialize-Environment {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Aurora PostgreSQL Database Export Tool" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Create backup directory
    if (-not (Test-Path $backupPath)) {
        New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    }
    
    # Create log file
    "Export started: $(Get-Date)" | Set-Content -Path $logFile
    
    Write-Log "Initialization started..." -Level "START"
    Write-Host "Backup Directory: $backupPath" -ForegroundColor Yellow
    Write-Host ""
}

function Test-Prerequisites {
    Write-Host "Step 1: Checking prerequisites..." -ForegroundColor Cyan
    
    # Check AWS CLI
    $awsCLI = Get-Command aws -ErrorAction SilentlyContinue
    if (-not $awsCLI) {
        Write-Log "AWS CLI not found" -Type "Error"
        Write-Host "[ERROR] AWS CLI not found. Download from: https://aws.amazon.com/cli/" -ForegroundColor Red
        return $false
    }
    Write-Log "AWS CLI found: $($awsCLI.Source)" -Type "Success"
    Write-Host "[OK] AWS CLI found" -ForegroundColor Green
    
    # Check AWS credentials
    try {
        $identity = aws sts get-caller-identity 2>$null | ConvertFrom-Json
        Write-Log "AWS credentials valid. Account: $($identity.Account)" -Type "Success"
        Write-Host "[OK] AWS credentials valid" -ForegroundColor Green
    } catch {
        Write-Log "AWS credentials not configured: $_" -Type "Error"
        Write-Host "[ERROR] AWS credentials not found. Run: aws configure" -ForegroundColor Red
        return $false
    }
    
    Write-Host ""
    return $true
}

function Create-Snapshot {
    Write-Host "Step 2: Creating RDS snapshot..." -ForegroundColor Cyan
    Write-Host "Snapshot ID: $snapshotID" -ForegroundColor Yellow
    
    try {
        $result = aws rds create-db-cluster-snapshot `
            --db-cluster-identifier $ClusterID `
            --db-cluster-snapshot-identifier $snapshotID `
            --region $Region 2>&1
        
        Write-Log "Snapshot creation initiated: $snapshotID" -Type "Success"
        Write-Host "[OK] Snapshot creation initiated" -ForegroundColor Green
        Write-Host ""
        return $true
    } catch {
        Write-Log "Failed to create snapshot: $_" -Type "Error"
        Write-Host "[ERROR] Failed to create snapshot" -ForegroundColor Red
        Write-Host $_ -ForegroundColor Red
        return $false
    }
}

function Wait-SnapshotCompletion {
    Write-Host "Step 3: Waiting for snapshot completion..." -ForegroundColor Cyan
    Write-Host "This may take several minutes..." -ForegroundColor Yellow
    Write-Host ""
    
    $maxWait = 3600 # 1 hour
    $elapsed = 0
    $interval = 30
    
    while ($elapsed -lt $maxWait) {
        try {
            $snapshot = aws rds describe-db-cluster-snapshots `
                --db-cluster-snapshot-identifier $snapshotID `
                --region $Region `
                --query "DBClusterSnapshots[0]" `
                --output json 2>$null | ConvertFrom-Json
            
            $status = $snapshot.Status
            $progress = $snapshot.PercentProgress
            
            Write-Host -NoNewline "`r   Status: $status | Progress: $progress% (Elapsed: ${elapsed}s)          "
            
            if ($status -eq "available") {
                Write-Host ""
                Write-Log "Snapshot ready: $snapshotID (Size: $($snapshot.AllocatedStorage)GB)" -Type "Success"
                Write-Host "[OK] Snapshot is ready!" -ForegroundColor Green
                Write-Host ""
                return $true
            }
        } catch {
            Write-Log "Error checking snapshot status: $_" -Level "WARNING"
        }
        
        Start-Sleep -Seconds $interval
        $elapsed += $interval
    }
    
    Write-Log "Timeout waiting for snapshot completion after ${maxWait}s" -Level "WARNING"
    Write-Host "[WARNING] Snapshot creation is taking longer than expected" -ForegroundColor Yellow
    return $false
}

function Export-ViaPgDump {
    Write-Host "Step 4: Export database via pg_dump (Optional)" -ForegroundColor Cyan
    Write-Host ""
    
    $response = Read-Host "Export database as SQL file? (y/n)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        return
    }
    
    $dbEndpoint = Read-Host "Enter database endpoint (or press Enter to skip)"
    if ([string]::IsNullOrEmpty($dbEndpoint)) {
        return
    }
    
    $dbUser = Read-Host "Enter database username"
    $dbName = Read-Host "Enter database name"
    $dbPassword = Read-Host "Enter database password" -AsSecureString
    
    $exportFile = Join-Path $backupPath "database-1-$timestamp.sql"
    $exportFileGz = "$exportFile.gz"
    
    Write-Host "Exporting to: $exportFile" -ForegroundColor Yellow
    
    # Convert SecureString to plain text for pg_dump
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($dbPassword)
    )
    
    $env:PGPASSWORD = $plainPassword
    
    try {
        & pg_dump -h $dbEndpoint -U $dbUser -d $dbName --verbose --file="$exportFile" 2>&1 | Tee-Object -FilePath $logFile -Append
        
        Write-Log "Database exported: $exportFile" -Type "Success"
        Write-Host "[OK] Database exported successfully!" -ForegroundColor Green
        
        # Compress
        Write-Host "Compressing backup..." -ForegroundColor Yellow
        $compress = @{
            Path = $exportFile
            DestinationPath = $exportFileGz
            Force = $true
        }
        Compress-Archive @compress
        
        Remove-Item $exportFile
        Write-Log "Backup compressed: $exportFileGz" -Type "Success"
        Write-Host "[OK] Backup compressed: $(Split-Path $exportFileGz -Leaf)" -ForegroundColor Green
    } catch {
        Write-Log "pg_dump failed: $_" -Type "Error"
        Write-Host "[ERROR] pg_dump failed: $_" -ForegroundColor Red
    } finally {
        $env:PGPASSWORD = ""
        Clear-Variable plainPassword -ErrorAction SilentlyContinue
    }
}

function Show-Summary {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Export Complete" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Snapshot ID: $snapshotID" -ForegroundColor Yellow
    Write-Host "Backup Location: $backupPath" -ForegroundColor Yellow
    Write-Host "Log File: $logFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Verify snapshot in AWS RDS Console"
    Write-Host "2. Download backup if needed"
    Write-Host "3. Test database restore in non-prod environment"
    Write-Host "4. When ready, delete the database cluster"
    Write-Host ""
}

# Main execution
try {
    Initialize-Environment
    
    if (-not (Test-Prerequisites)) {
        exit 1
    }
    
    if (-not (Create-Snapshot)) {
        exit 1
    }
    
    Wait-SnapshotCompletion | Out-Null
    
    Export-ViaPgDump
    
    Show-Summary
    
    # Open log file
    Write-Host "Opening log file..."
    Invoke-Item $logFile
    
} catch {
    Write-Log "Unexpected error: $_" -Type "Error"
    Write-Host "[ERROR] $($_)" -ForegroundColor Red
    exit 1
}
