$ErrorActionPreference = 'Stop'

$baseUrl = 'http://127.0.0.1:3000'
$loginUrl = "$baseUrl/login"
$authUrl = "$baseUrl/auth/login"
$treeUrl = "$baseUrl/familia-demo/tree"
$timeoutSec = 15

function Assert-StatusCode {
  param(
    [string]$Name,
    [string]$Url,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null,
    [string]$Method = 'GET',
    [hashtable]$Body = $null,
    [int]$ExpectedStatus = 200
  )

  try {
    if ($Session) {
      $response = Invoke-WebRequest -UseBasicParsing $Url -Method $Method -Body $Body -WebSession $Session -TimeoutSec $timeoutSec
    } else {
      $response = Invoke-WebRequest -UseBasicParsing $Url -Method $Method -Body $Body -TimeoutSec $timeoutSec
    }
  } catch {
    throw "$Name fallo: $($_.Exception.Message)"
  }

  if ($response.StatusCode -ne $ExpectedStatus) {
    throw "$Name devolvio status $($response.StatusCode), se esperaba $ExpectedStatus"
  }

  Write-Host "$Name OK ($($response.StatusCode))" -ForegroundColor Green
  return $response
}

Write-Host 'Verificando runtime HTTP...' -ForegroundColor Cyan

$loginResponse = Assert-StatusCode -Name 'GET /login' -Url $loginUrl

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$authResponse = Assert-StatusCode `
  -Name 'POST /auth/login' `
  -Url $authUrl `
  -Session $session `
  -Method 'POST' `
  -Body @{ email = 'admin@demo.com'; password = 'admin123' }

$cookieNames = @($session.Cookies.GetCookies($baseUrl) | ForEach-Object { $_.Name })
if (-not ($cookieNames -contains 'session')) {
  throw 'POST /auth/login no dejo cookie de sesion en la WebRequestSession'
}
Write-Host 'Cookie de sesion OK' -ForegroundColor Green

Assert-StatusCode -Name 'GET /familia-demo/tree' -Url $treeUrl -Session $session | Out-Null

Write-Host ''
Write-Host 'Verificacion de runtime completada.' -ForegroundColor Green
Write-Host "  $loginUrl"
Write-Host "  $treeUrl"
