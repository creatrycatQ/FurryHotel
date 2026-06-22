@echo off
title FurryEvent Server
cd /d "%~dp0"

echo.
echo ========================================
echo       FurryEvent Server Launcher
echo ========================================
echo.

:: ---------- Launch server ----------
echo [INFO] Starting server...
echo.

:: ---------- Launch cloudflared tunnel ----------
cd /d "%~dp0.."
if exist cloudflared.exe (
    echo [INFO] Starting cloudflared tunnel...
    start /b "" cloudflared.exe tunnel --config .\config.yml run --protocol http2
    echo [INFO] Cloudflared tunnel started.
) else (
    echo [WARN] cloudflared.exe not found, skipping tunnel.
)
cd /d "%~dp0"
echo.

node server.js

:: ---------- Cleanup: kill cloudflared on exit ----------
echo.
echo [INFO] Shutting down cloudflared...
taskkill /F /IM cloudflared.exe >nul 2>&1
echo [INFO] Done.
pause