$ErrorActionPreference = 'Stop'

Write-Host 'Stopping Node processes...' -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'Stopped.' -ForegroundColor Green
