@echo off
cd /d "LOCAL_REPO_PATH"
echo ============================================
echo  Genome Tree - Schema v2 Migration
echo ============================================
echo.
echo [1/3] Resetting database and pushing new schema...
call npx prisma db push --force-reset --accept-data-loss
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: prisma db push failed
  pause
  exit /b 1
)
echo.
echo [2/3] Running seed...
call npm run db:seed
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: seed failed
  pause
  exit /b 1
)
echo.
echo [3/3] Done! Schema v2 is live.
echo   - fatherId / motherId en Person
echo   - isCore en Person
echo   - FamilyConfig model
echo   - AuditLog model
echo   - PARENT_CHILD eliminado de Relationship
echo.
pause
