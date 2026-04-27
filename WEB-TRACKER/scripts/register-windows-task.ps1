param(
  [string]$TaskName = "CareerOpsDashboardAutopilot",
  [string]$Mode = "assisted"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$trackerRoot = Resolve-Path (Join-Path $scriptRoot "..")
$runScript = Join-Path $trackerRoot "run.mjs"

if (-not (Test-Path $runScript)) {
  throw "Cannot find run.mjs at $runScript"
}

if ($Mode -notin @("assisted", "autopilot", "manual")) {
  throw "Mode must be assisted, autopilot, or manual"
}

$node = (Get-Command node -ErrorAction Stop).Source
$arguments = "`"$runScript`" --mode $Mode --no-open"

$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $trackerRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs the local Career-Ops dashboard control plane and scheduled scans at login." `
  -Force | Out-Null

Write-Host "Registered scheduled task: $TaskName"
Write-Host "Mode: $Mode"
Write-Host "Working directory: $trackerRoot"
