@echo off
chcp 65001 >nul
title Public URL  -  tunnelmole
cd /d "%~dp0"

rem Step 1: the app itself must be running on :3001 (double-click 启动.bat first).
curl -s -m 4 http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 goto NOBACKEND

echo ============================================
echo   Public URL for http://localhost:3001
echo ============================================
echo.
echo The https://xxxx.tunnelmole.net line below IS your phone link.
echo Open it on any phone. Keep THIS window open while using it.
echo Close this window  =  the link dies.
echo.
echo WARNING: there is no login in this app. Anyone who gets the link
echo          can read your diary and chat. Do not share it.
echo.

"%~dp0.workbuddy\tools\node_modules\.bin\tmole.cmd" 3001

echo.
echo Tunnel closed.
pause
exit /b 0

:NOBACKEND
echo [ERROR] Backend is not answering on port 3001.
echo.
echo Start the app first: double-click  启动.bat
echo Wait for "backend :3001" to be ready, then run this file again.
echo.
pause
exit /b 1
