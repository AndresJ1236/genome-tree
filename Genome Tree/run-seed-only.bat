@echo off
cd /d "LOCAL_REPO_PATH"
echo Corriendo seed...
call npm run db:seed
echo.
echo Exit code: %ERRORLEVEL%
pause
