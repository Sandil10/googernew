# Build Flutter web, stamp the bundle URL (cache-buster), restart the server on :8081.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

& D:\googer-recovery-code\tools\flutter\bin\flutter.bat build web --release --no-tree-shake-icons --pwa-strategy=none --no-wasm-dry-run
if ($LASTEXITCODE -ne 0) { throw "flutter build failed" }

# Cache-bust: main.dart.js URL changes every deploy so Cloudflare edge/browser caches can't pin old builds
$stamp = [DateTime]::UtcNow.Ticks
$bootstrap = Join-Path $PSScriptRoot "build\web\flutter_bootstrap.js"
$t = [IO.File]::ReadAllText($bootstrap)
$t = $t -replace '"main\.dart\.js"', ('"main.dart.js?v=' + $stamp + '"')
[IO.File]::WriteAllText($bootstrap, $t)
Write-Host "stamped v=$stamp"

# Restart static server + API proxy
$pid8081 = (Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)
if ($pid8081) { Stop-Process -Id $pid8081 -Force }
Start-Sleep -Seconds 2
Start-Process -FilePath 'D:\googer-recovery-code\tools\nodejs\node.exe' `
  -ArgumentList (Join-Path $PSScriptRoot 'serve-web.js') `
  -WorkingDirectory $PSScriptRoot -WindowStyle Hidden `
  -RedirectStandardOutput 'D:\googer-recovery-code\logs\flutter-web.log' `
  -RedirectStandardError 'D:\googer-recovery-code\logs\flutter-web.err.log'
Write-Host "deployed -> https://expo.googer.site"
