param(
  [ValidateRange(1, 65535)]
  [int]$Port = 18123
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$origin = "http://127.0.0.1:$Port"
$deadline = (Get-Date).AddSeconds(20)

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "$origin/api/pvp/rooms" -TimeoutSec 1
    if ($response.StatusCode -eq 200) { break }
  } catch {
    Start-Sleep -Milliseconds 250
  }
}

if ((Get-Date) -ge $deadline) {
  Write-Host 'Local PVP server did not become ready within 20 seconds.'
  exit 1
}

$runtime = Join-Path $root '.runtime'
$profileA = Join-Path $runtime 'local-pvp-browser-a'
$profileB = Join-Path $runtime 'local-pvp-browser-b'
New-Item -ItemType Directory -Force -Path $profileA, $profileB | Out-Null

$browserCandidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
)
$browser = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  Select-Object -First 1

$urlA = "$origin/?pvp=1&localPlayer=A&localRoom=1"
$urlB = "$origin/?pvp=1&localPlayer=B&localRoom=1"

if ($browser) {
  Start-Process -FilePath $browser -ArgumentList @(
    "--user-data-dir=$profileA",
    '--new-window',
    '--no-first-run',
    '--no-default-browser-check',
    $urlA
  )
  Start-Process -FilePath $browser -ArgumentList @(
    "--user-data-dir=$profileB",
    '--new-window',
    '--no-first-run',
    '--no-default-browser-check',
    $urlB
  )
} else {
  Start-Process $urlA
  Start-Process $urlB
}
