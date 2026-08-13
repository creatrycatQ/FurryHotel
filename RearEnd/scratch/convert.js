const fs = require('fs');
const path = require('path');
const iconv = require('../node_modules/iconv-lite');

const batContent = `@echo off
title Cloudflare Tunnel Helper - FurryHotel
cd /d "%~dp0"
node RearEnd\\setup-tunnel.js
pause
`;

// Write 重新搭建隧道.bat in GBK
const targetBat = path.join(__dirname, '../../重新搭建隧道.bat');
const buf = iconv.encode(batContent, 'gbk');
fs.writeFileSync(targetBat, buf);
console.log('Successfully updated 重新搭建隧道.bat wrapper!');

// Write RearEnd/启动.bat in GBK
const startBatPath = path.join(__dirname, '../启动.bat');
const startBatContent = `@echo off
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
    if exist tunnel_token.txt (
        call :log INFO "Starting cloudflared tunnel using Token..."
        set /p CF_TOKEN=<tunnel_token.txt
        start /b "" cloudflared.exe tunnel run --token !CF_TOKEN!
        call :log INFO "Cloudflared tunnel started with Token."
    ) else if exist config.yml (
        call :log INFO "Starting cloudflared tunnel using config.yml..."
        start /b "" cloudflared.exe tunnel --config .\\config.yml run --protocol http2
        call :log INFO "Cloudflared tunnel started with config.yml."
    ) else (
        call :log WARN "Neither tunnel_token.txt nor config.yml found, skipping tunnel."
    )
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
`;

fs.writeFileSync(startBatPath, iconv.encode(startBatContent, 'gbk'));
console.log('Successfully updated RearEnd/启动.bat in GBK encoding!');
