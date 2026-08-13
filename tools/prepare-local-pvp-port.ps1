param(
  [ValidateRange(1, 65535)]
  [int]$Port = 18123
)

$ErrorActionPreference = 'Stop'

$listeners = @(
  Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
)
if ($listeners.Count -eq 0) { exit 0 }

$owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($ownerId in $owners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
  $commandLine = [string]$process.CommandLine
  $isLocalPvp = (
    ($process.Name -match '^node(\.exe)?$') -and
    ($commandLine -match 'tools[\\/]+local-pvp-server\.mjs')
  )
  if (-not $isLocalPvp) {
    Write-Error "Port $Port is occupied by PID $ownerId ($($process.Name)); it was not stopped."
    exit 2
  }

  Write-Host "  Restarting stale local PVP process PID $ownerId..."
  Stop-Process -Id $ownerId
}

$deadline = (Get-Date).AddSeconds(5)
do {
  $remaining = @(
    Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  )
  if ($remaining.Count -eq 0) { exit 0 }
  Start-Sleep -Milliseconds 100
} while ((Get-Date) -lt $deadline)

Write-Error "Port $Port did not become available after stopping the stale local PVP process."
exit 3
