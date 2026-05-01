$ErrorActionPreference = 'Stop'

$source = 'LOCAL_REPO_PATH'
$runner = 'USER_HOME\Documents\New project\genome-tree'

Write-Host "Syncing source to runner..." -ForegroundColor Cyan

if (!(Test-Path $runner)) {
  New-Item -ItemType Directory -Path $runner | Out-Null
}

robocopy $source $runner /MIR /XD .next node_modules test-results scripts | Out-Null

$files = @(
  '.env',
  '.env.local',
  '.env.example',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'eslint.config.mjs',
  'prisma.config.ts',
  'README.md',
  'Dockerfile',
  'docker-compose.yml',
  'next-env.d.ts',
  '.gitignore',
  'AGENTS.md',
  'CLAUDE.md'
)

foreach ($file in $files) {
  $srcFile = Join-Path $source $file
  if (Test-Path $srcFile) {
    Copy-Item -LiteralPath $srcFile -Destination (Join-Path $runner $file) -Force
  }
}

Write-Host "Generating Prisma client..." -ForegroundColor Cyan
Push-Location $runner
try {
  npx prisma generate
  Write-Host "Runner synced at $runner" -ForegroundColor Green
} finally {
  Pop-Location
}
