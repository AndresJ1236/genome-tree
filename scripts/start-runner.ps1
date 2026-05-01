$ErrorActionPreference = 'Stop'

$runner = 'USER_HOME\Documents\New project\genome-tree'
$log = Join-Path $runner 'runner-start.log'

Write-Host 'Stopping old Node processes...' -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Write-Host 'Syncing source to runner...' -ForegroundColor Cyan
& 'LOCAL_REPO_PATH\scripts\sync-runner.ps1'

Push-Location $runner
try {
  if (Test-Path '.next') {
    Write-Host 'Removing stale .next...' -ForegroundColor Cyan
    Remove-Item -LiteralPath '.next' -Recurse -Force
  }

  Write-Host 'Installing dependencies...' -ForegroundColor Cyan
  npm install

  Write-Host 'Building local production bundle...' -ForegroundColor Cyan
  npm run build:local

  if (Test-Path $log) {
    Remove-Item -LiteralPath $log -Force
  }

  $cmd = "Set-Location '$runner'; npm run start:local *> '$log'"
  Write-Host 'Starting server...' -ForegroundColor Cyan
  Start-Process -FilePath powershell -ArgumentList '-NoProfile', '-Command', $cmd -WindowStyle Hidden
  Start-Sleep -Seconds 8

  Write-Host 'Checking /login...' -ForegroundColor Cyan
  $login = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/login' -TimeoutSec 20
  if ($login.StatusCode -ne 200) {
    throw "Login health check failed with status $($login.StatusCode)"
  }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $html = $login.Content
  $fields = @{}
  [regex]::Matches($html, '<input type="hidden" name="([^"]+)" value="([^"]*)"') | ForEach-Object {
    $fields[$_.Groups[1].Value] = [System.Net.WebUtility]::HtmlDecode($_.Groups[2].Value)
  }
  $fields['email'] = 'admin@demo.com'
  $fields['password'] = 'admin123'

  Write-Host 'Checking login flow...' -ForegroundColor Cyan
  $loginSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $login = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/login' -WebSession $loginSession -TimeoutSec 20
  $html = $login.Content
  $fields = @{}
  [regex]::Matches($html, '<input type="hidden" name="([^"]+)" value="([^"]*)"') | ForEach-Object {
    $fields[$_.Groups[1].Value] = [System.Net.WebUtility]::HtmlDecode($_.Groups[2].Value)
  }
  $fields['email'] = 'admin@demo.com'
  $fields['password'] = 'admin123'
  Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/login' -Method Post -Body $fields -WebSession $loginSession -TimeoutSec 20 | Out-Null
  $tree = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/familia-demo/tree' -WebSession $loginSession -TimeoutSec 20
  if ($tree.StatusCode -ne 200) {
    throw "Tree health check failed with status $($tree.StatusCode)"
  }

  Write-Host 'Runner is ready:' -ForegroundColor Green
  Write-Host '  http://127.0.0.1:3000/login'
  Write-Host ''
  Write-Host 'Credentials:' -ForegroundColor Green
  Write-Host '  admin@demo.com'
  Write-Host '  admin123'
} finally {
  Pop-Location
}
