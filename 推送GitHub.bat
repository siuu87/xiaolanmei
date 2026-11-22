@echo off
chcp 65001 >nul
title Push to GitHub
cd /d "%~dp0"

echo ============================================
echo   Push commits to GitHub  -  origin/main
echo ============================================
echo.
echo Latest local commit:
git log --oneline -1
echo.
echo Pushing...  first time may ask for GitHub login in a popup.
echo.

git push origin main
set "CODE=%errorlevel%"

echo.
if not "%CODE%"=="0" goto FAILED

echo [OK] GitHub is up to date.
echo.
echo Also pushing the Gitee copy...
git push gitee main
echo.
echo [DONE] both remotes tried.
pause
exit /b 0

:FAILED
echo [FAILED] git push exit code %CODE%
echo.
echo Common reasons:
echo   1. github.com unreachable  - schannel / 502 / timeout  -^> turn on your VPN, run again
echo   2. not logged in           - the login popup was closed    -^> run again and finish it
echo   3. nothing to push         - "Everything up-to-date" is fine, not an error
echo.
echo Gitee copy is always usable, pushing that one now...
git push gitee main
echo.
pause
exit /b %CODE%
