@echo off
setlocal

set "ROOT=%~dp0"
set "TUNNEL_ID=70dad40c-325d-41c2-a3c7-ccf45815a215"
set "CONFIG_FILE=%ROOT%config.yml"
set "PUBLIC_URL=https://app.infranex.it.com"
set "CLOUDFLARED_CMD="

where cloudflared >nul 2>nul
if not errorlevel 1 (
  set "CLOUDFLARED_CMD=cloudflared"
)

if not defined CLOUDFLARED_CMD if exist "%ROOT%cloudflared.exe" (
  set "CLOUDFLARED_CMD=%ROOT%cloudflared.exe"
)

if not defined CLOUDFLARED_CMD if exist "%USERPROFILE%\.cloudflared\cloudflared.exe" (
  set "CLOUDFLARED_CMD=%USERPROFILE%\.cloudflared\cloudflared.exe"
)

if not defined CLOUDFLARED_CMD (
  echo cloudflared is not installed or not in PATH.
  echo Put cloudflared.exe in one of these places, then run this file again:
  echo   1. %ROOT%cloudflared.exe
  echo   2. %USERPROFILE%\.cloudflared\cloudflared.exe
  echo   3. Install it into PATH
  echo Expected public site: %PUBLIC_URL%
  pause
  exit /b 1
)

echo Stopping old Googer frontend, backend, and dev processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$targets = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*googernew-main*' }; " ^
  "foreach ($proc in $targets) { try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch {} }"

echo Cleaning stale Next build state...
if exist "%ROOT%.next\dev\lock" del /f /q "%ROOT%.next\dev\lock" >nul 2>nul

echo Starting Googer frontend, backend, and Cloudflare tunnel...

start "Googer Frontend" cmd /k "cd /d "%ROOT%" && npm run build && npm run start -- --hostname 0.0.0.0 --port 3000"
start "Googer Backend" cmd /k "cd /d "%ROOT%backend" && set WEB_URL=%PUBLIC_URL% && set DATABASE_URL= && set POSTGRES_URL= && set FORCE_LOCAL_DB=true && npm run start"
start "Googer Cloudflare Tunnel" cmd /k "cd /d "%ROOT%" && "%CLOUDFLARED_CMD%" tunnel --config "%CONFIG_FILE%" run %TUNNEL_ID%"

echo Frontend: http://localhost:3000
echo Backend:  http://localhost:5000
echo Public:   %PUBLIC_URL%
echo.
echo Opening public app link in your browser...
start "" "%PUBLIC_URL%"
echo.
echo You can close this window. The app will keep running in the opened terminals.

endlocal
