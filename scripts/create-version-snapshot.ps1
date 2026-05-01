$ErrorActionPreference = 'Stop'

$runner = 'C:\Users\andre\Documents\New project\genome-tree'
$versionsRoot = 'C:\Users\andre\Documents\GenomeTreeVersions'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$snapshot = Join-Path $versionsRoot ("phase4-working-" + $timestamp)

if (!(Test-Path $versionsRoot)) {
  New-Item -ItemType Directory -Path $versionsRoot | Out-Null
}

Write-Host "Creating snapshot at $snapshot" -ForegroundColor Cyan
robocopy $runner $snapshot /MIR /XD .next node_modules test-results | Out-Null

Write-Host "Snapshot created." -ForegroundColor Green
Write-Host $snapshot
