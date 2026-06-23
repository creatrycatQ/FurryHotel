@echo off
setlocal enabledelayedexpansion
title FurryEvent Server
cd /d "%~dp0"

echo.
echo ========================================
echo       FurryEvent Server Launcher
echo ========================================
echo.

:: ---------- Launch server ----------
call :log INFO "Starting server..."
echo.

:: ---------- Launch cloudflared tunnel ----------
cd /d "%~dp0.."
if exist cloudflared.exe (
    call :log INFO "Starting cloudflared tunnel..."
    start /b "" cloudflared.exe tunnel --config .\config.yml run --protocol http2
    call :log INFO "Cloudflared tunnel started."
) else (
    call :log WARN "cloudflared.exe not found, skipping tunnel."
)
cd /d "%~dp0"
echo.

node server.js

:: ---------- Cleanup: kill cloudflared on exit ----------
echo.
call :log INFO "Shutting down cloudflared..."
taskkill /F /IM cloudflared.exe >nul 2>&1
call :log INFO "Done."
pause
exit /b

:: ---------- Helper function for timestamped logging ----------
:log
set "level=%~1"
set "message=%~2"
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set "timestamp=%%a-%%b-%%c"
for /f "tokens=1-3 delims=:." %%a in ("%time%") do set "timestamp=!timestamp! %%a:%%b:%%c"
echo [!timestamp!] [%level%] %message%
exit /b