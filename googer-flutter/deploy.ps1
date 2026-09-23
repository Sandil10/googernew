# Build Flutter web, stamp the bundle URL (cache-buster), restart the server on :8081.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# A Flutter release build is CPU-heavy. Keep it below the already-running web
# services so googer.site and admin.googer.site remain responsive during builds.
try {
  [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal'
} catch {
}

& D:\googer-recovery-code\tools\flutter\bin\flutter.bat build web --release --no-tree-shake-icons --no-wasm-dry-run
if ($LASTEXITCODE -ne 0) { throw "flutter build failed" }

# Replace the 0-byte service-worker stub with a kill switch.
#
# A browser that registered a worker from an older PWA build keeps that
# registration, and can serve a stale bundle indefinitely. Deleting the file
# does not help: serve-web.js falls back to index.html for unknown paths, so the
# request still answers 200. Instead ship a worker whose only job is to drop its
# caches, unregister itself, and reload every client it controls.
$sw = Join-Path $PSScriptRoot "build\web\flutter_service_worker.js"
$killSwitch = @'
// Kill switch: clears caches, unregisters, and reloads controlled clients.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) { clients.forEach(function (c) { c.navigate(c.url); }); })
      .catch(function () {})
  );
});
'@
[IO.File]::WriteAllText($sw, $killSwitch)
Write-Host "wrote service-worker kill switch"

# Cache-bust: main.dart.js URL changes every deploy so Cloudflare edge/browser caches can't pin old builds
$stamp = [DateTime]::UtcNow.Ticks
$bootstrap = Join-Path $PSScriptRoot "build\web\flutter_bootstrap.js"
$t = [IO.File]::ReadAllText($bootstrap)
$t = $t -replace 'main\.dart\.js(?:\?v=\d+)?', ('main.dart.js?v=' + $stamp)
# The generated bootstrap still registers a service worker even though this
# deployment deliberately uses network-fresh assets. Remove that registration
# so an existing worker cannot keep an older Flutter runtime alive.
$t = $t -replace '(?s)_flutter\.loader\.load\(\{\s*serviceWorkerSettings:\s*\{.*?\}\s*\}\);', '_flutter.loader.load();'
[IO.File]::WriteAllText($bootstrap, $t)
Write-Host "stamped v=$stamp"

# Also stamp flutter_bootstrap.js in index.html so browsers fetch the newest
# bootstrap file itself instead of reusing a previously cached one.
$indexPath = Join-Path $PSScriptRoot "build\web\index.html"
$indexHtml = [IO.File]::ReadAllText($indexPath)
$indexHtml = $indexHtml -replace 'flutter_bootstrap\.js(?:\?v=\d+)?', ('flutter_bootstrap.js?v=' + $stamp)
[IO.File]::WriteAllText($indexPath, $indexHtml)
Write-Host "stamped bootstrap v=$stamp"

# Restart static server + API proxy
$pid8081 = (Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)
if ($pid8081) { Stop-Process -Id $pid8081 -Force }
Start-Sleep -Seconds 2
try {
  Start-Process -FilePath 'D:\googer-recovery-code\tools\nodejs\node.exe' `
    -ArgumentList (Join-Path $PSScriptRoot 'serve-web.js') `
    -WorkingDirectory $PSScriptRoot -WindowStyle Hidden `
    -RedirectStandardOutput 'D:\googer-recovery-code\logs\flutter-web.log' `
    -RedirectStandardError 'D:\googer-recovery-code\logs\flutter-web.err.log'
} catch {
  # Some managed Windows shells expose both Path and PATH. Start-Process then
  # fails while copying the environment, so use the shell-backed launcher.
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'D:\googer-recovery-code\tools\nodejs\node.exe'
  $startInfo.Arguments = (Join-Path $PSScriptRoot 'serve-web.js')
  $startInfo.WorkingDirectory = $PSScriptRoot
  $startInfo.UseShellExecute = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  [void][System.Diagnostics.Process]::Start($startInfo)
}
Write-Host "deployed -> https://expo.googer.site"
