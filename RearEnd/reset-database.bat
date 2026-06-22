@echo off
title Reset FurryHotel Database
cd /d "%~dp0"

echo ========================================
echo       FurryHotel Database Reset Tool
echo ========================================
echo.
echo WARNING: This operation will PERMANENTLY delete all database data!
echo Make sure you really want to start from scratch.
echo.
pause

echo.
echo [INFO] Stopping Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 >nul

echo [INFO] Deleting database files...
if exist furry_hotel.db del /f /q furry_hotel.db
if exist furry_hotel.db-wal del /f /q furry_hotel.db-wal
if exist furry_hotel.db-shm del /f /q furry_hotel.db-shm
echo [OK] Deletion command executed.

echo.
echo ========================================
echo Database reset complete!
echo Next time you start the server, it will re-initialize
echo and generate a new admin password in the terminal.
echo ========================================
echo.
pause
