@echo off
chcp 65001 >nul
title Xiaolanmei Dev Server

rem Must be system Node 24 (better-sqlite3 is compiled against 24).
set "NODE=C:\Program Files\nodejs\node.exe"

if not exist "%NODE%" (
  echo [ERROR] Node 24 not found at:
  echo         C:\Program Files\nodejs\node.exe
  echo Edit the NODE line in this file if it lives somewhere else.
  pause
  exit /b 1
)

echo ============================================
echo   Xiaolanmei  -  backend :3001  frontend :5173
echo   Close this window or press Ctrl+C to stop both.
echo ============================================
echo.

"%NODE%" "%~dp0scripts\dev-start.mjs"

if errorlevel 1 pause
