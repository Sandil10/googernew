$ErrorActionPreference = "Stop"

$backendRoot = "D:\googer-recovery-code\googernew-main\backend"
$node = "D:\googer-recovery-code\tools\nodejs\node.exe"
$outLog = "D:\googer-recovery-code\logs\googer-backend.log"
$errLog = "D:\googer-recovery-code\logs\googer-backend.err.log"

$procId = Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess

if ($procId) {
  Stop-Process -Id $procId -Force
  Start-Sleep -Seconds 2
}

Start-Process -FilePath $node `
  -ArgumentList "src/server.js" `
  -WorkingDirectory $backendRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog

Start-Sleep -Seconds 5
$response = Invoke-WebRequest http://127.0.0.1:5000/api/health -UseBasicParsing -TimeoutSec 20
Write-Host "backend $($response.StatusCode)"
