@echo off
setlocal

set "ROOT=%~dp0"
set "TUNNEL_ID=70dad40c-325d-41c2-a3c7-ccf45815a215"
set "CONFIG_FILE=%ROOT%config.yml"
set "PUBLIC_URL=https://app.infranex.it.com"
set "RDS_DATABASE_URL=postgresql://postgres:Asphalt10Rds%%23@googer-db.ctssuq0g0svg.ap-southeast-1.rds.amazonaws.com:5432/Googer?sslmode=require"
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

echo Starting Googer frontend, backend, and Cloudflare tunnel...

start "Googer Frontend" cmd /k "cd /d "%ROOT%" && npm run build && npm run start -- --hostname 0.0.0.0 --port 3000"
start "Googer Backend" cmd /k "cd /d "%ROOT%backend" && set WEB_URL=%PUBLIC_URL% && set DATABASE_URL=%RDS_DATABASE_URL% && set FORCE_LOCAL_DB=false && npm run dev"
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
