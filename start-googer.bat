@echo off
setlocal
title Googer Launcher

set "ROOT=%~dp0"
set "TUNNEL_ID=70dad40c-325d-41c2-a3c7-ccf45815a215"
set "CONFIG_FILE=%ROOT%config.yml"
set "PUBLIC_URL=https://app.infranex.it.com"
set "LOCAL_URL=http://localhost:3000"
set "CLOUDFLARED_CMD="

where cloudflared >nul 2>nul
if not errorlevel 1 set "CLOUDFLARED_CMD=cloudflared"

if not defined CLOUDFLARED_CMD if exist "%ROOT%cloudflared.exe" (
  set "CLOUDFLARED_CMD=%ROOT%cloudflared.exe"
)
if not defined CLOUDFLARED_CMD if exist "C:\Users\Administrator\Desktop\Googer Launchers\tools\cloudflared.exe" (
  set "CLOUDFLARED_CMD=C:\Users\Administrator\Desktop\Googer Launchers\tools\cloudflared.exe"
)
if not defined CLOUDFLARED_CMD if exist "%USERPROFILE%\.cloudflared\cloudflared.exe" (
  set "CLOUDFLARED_CMD=%USERPROFILE%\.cloudflared\cloudflared.exe"
)
if not defined CLOUDFLARED_CMD (
  echo [ERROR] cloudflared not found. Place cloudflared.exe next to this file or install it in PATH.
  pause
  exit /b 1
)

echo.
echo [1/4] Killing previous server processes...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":3000 "') do taskkill /F /PID %%P >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":5000 "') do taskkill /F /PID %%P >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*googernew-main*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }"
taskkill /IM cloudflared.exe /F >nul 2>nul
taskkill /IM nodemon.exe /F >nul 2>nul
timeout /t 3 /nobreak >nul

echo [2/4] Clearing frontend cache...
if exist "%ROOT%.next\cache" rd /s /q "%ROOT%.next\cache" >nul 2>nul
if exist "%ROOT%.next\dev\lock" del /f /q "%ROOT%.next\dev\lock" >nul 2>nul
if exist "%ROOT%.next\trace" del /f /q "%ROOT%.next\trace" >nul 2>nul

echo [3/4] Starting backend on port 5000...
start "Googer Backend" /D "%ROOT%backend" cmd /k "set WEB_URL=%PUBLIC_URL%&& set MOBILE_URL=%PUBLIC_URL%&& npm run start"
timeout /t 4 /nobreak >nul

echo Starting Cloudflare named tunnel...
start "Googer Tunnel" /D "%ROOT%" cmd /k ""%CLOUDFLARED_CMD%" tunnel --config "%CONFIG_FILE%" run %TUNNEL_ID%"

echo Waiting for Cloudflare tunnel process...
set /a TUNNEL_WAIT=0
:wait_tunnel_ready
tasklist /FI "IMAGENAME eq cloudflared.exe" | find /I "cloudflared.exe" >nul
if not errorlevel 1 goto tunnel_ready
set /a TUNNEL_WAIT+=1
if %TUNNEL_WAIT% GEQ 20 (
  echo [ERROR] Cloudflare tunnel process did not start.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_tunnel_ready
:tunnel_ready

echo [4/4] Building frontend for preview...
call cmd /c "cd /d "%ROOT%" && set "BACKEND_URL=http://127.0.0.1:5000" && npm run build"
if errorlevel 1 (
  echo [ERROR] Frontend build failed. Tunnel is running, but app was not started.
  pause
  exit /b 1
)

echo Starting frontend preview on port 3000...
start "Googer Frontend" /D "%ROOT%" cmd /k "set BACKEND_URL=http://127.0.0.1:5000&& npm run start:3000"

echo Waiting for frontend port 3000...
set /a FRONTEND_WAIT=0
:wait_frontend_ready
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ready = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -InformationLevel Quiet; if ($ready) { exit 0 } else { exit 1 }" >nul 2>nul
if not errorlevel 1 goto frontend_ready
set /a FRONTEND_WAIT+=1
if %FRONTEND_WAIT% GEQ 90 (
  echo [WARN] Frontend did not become ready within 90 seconds.
  goto frontend_ready
)
timeout /t 1 /nobreak >nul
goto wait_frontend_ready
:frontend_ready

echo.
echo Frontend: %LOCAL_URL%
echo Backend : http://localhost:5000
echo Public  : %PUBLIC_URL%
echo.
start "" "%LOCAL_URL%"
start "" "%PUBLIC_URL%"
echo Servers are running. You can close this launcher window.
pause
endlocal
