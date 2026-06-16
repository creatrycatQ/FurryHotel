@echo off
title FurryHotel Server
cd /d "%~dp0"

echo.
echo ========================================
echo       FurryHotel Server Launcher
echo ========================================
echo.

:: ---------- Check port 3000 ----------
set "PORT=3000"
set "PID="

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%.*LISTENING" 2^>nul') do (
    set "PID=%%a"
)

if not defined PID goto LAUNCH

:: ---------- Port in use ----------
echo [WARN] Port %PORT% is already in use by PID: %PID%

for /f "tokens=1 delims=," %%a in ('tasklist /fi "PID eq %PID%" /fo csv /nh 2^>nul') do (
    set "PNAME=%%a"
)
echo        Process: %PNAME:"=%
echo.

:ASK
set "INPUT="
set /p "INPUT=Kill this process and free the port? [Y/N]: "

if /i "%INPUT%"=="Y" goto KILL
if /i "%INPUT%"=="N" goto EXIT
echo Please enter Y or N.
goto ASK

:KILL
echo.
echo [INFO] Killing PID %PID% ...
taskkill /F /PID %PID% >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to kill process. Run as Administrator.
    pause
    exit /b 1
)
echo [INFO] Process killed, port released.
echo.
goto LAUNCH

:EXIT
echo.
echo [INFO] Launch cancelled.
pause
exit /b 0

:: ---------- Launch server ----------
:LAUNCH
echo [INFO] Starting server...
echo.

:: ---------- Launch cloudflared tunnel ----------
echo [INFO] Starting cloudflared tunnel...
cd /d "%~dp0.."
start /b "" cloudflared.exe tunnel --config .\config.yml run --protocol http2
cd /d "%~dp0"
echo [INFO] Cloudflared tunnel started.
echo.

node server.js

:: ---------- Cleanup: kill cloudflared on exit ----------
echo.
echo [INFO] Shutting down cloudflared...
taskkill /F /IM cloudflared.exe >nul 2>&1
echo [INFO] Done.
pause
