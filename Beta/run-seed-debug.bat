@echo off
cd /d "LOCAL_REPO_PATH"
echo Regenerando cliente Prisma...
call npx prisma generate > "%~dp0seed-log.txt" 2>&1

echo Corriendo seed...
call npm run db:seed >> "%~dp0seed-log.txt" 2>&1

echo.
echo === Resultado ===
type "%~dp0seed-log.txt"
echo.
echo Log guardado en: %~dp0seed-log.txt
pause
