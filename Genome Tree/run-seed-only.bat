@echo off
cd /d "C:\Users\andre\OneDrive\Estudio\USFQ\genome-tree"
echo Corriendo seed...
call npm run db:seed
echo.
echo Exit code: %ERRORLEVEL%
pause
