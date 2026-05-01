@echo off
cd /d "C:\Users\andre\OneDrive\Estudio\USFQ\genome-tree"
echo Deteniendo servidor en puerto 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul
echo Borrando cache .next...
rmdir /s /q .next 2>nul
echo.
echo Listo. Ahora corre: npm run dev
pause
