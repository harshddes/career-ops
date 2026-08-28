param(
  [ValidateSet("assisted", "autopilot", "manual")]
  [string]$Mode = "assisted"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$trackerRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$run = Join-Path $trackerRoot "run.mjs"
$runtimeDir = Join-Path $trackerRoot "runtime"
$logDir = Join-Path $env:LOCALAPPDATA "career-ops\logs"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:HOST = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
$env:PORT = if ($env:PORT) { $env:PORT } else { "3737" }

$node = (Get-Command node -ErrorAction Stop).Source
$pidFile = Join-Path $runtimeDir "dashboard.pid"
$quotedRun = '"{0}"' -f $run
$argLine = "--experimental-sqlite $quotedRun --mode $Mode --no-open"

# Windows PowerShell 5.1 Start-Process uses ShellExecute. An argument array
# splits the Dropbox path on spaces and Node exits immediately. One quoted
# string is required. RedirectStandardOutput is also incompatible with that mode.
$p = Start-Process -FilePath $node -ArgumentList $argLine -WorkingDirectory $trackerRoot -WindowStyle Hidden -PassThru

Set-Content -Path $pidFile -Value $p.Id
Write-Output $p.Id
