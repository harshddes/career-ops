param(
  [string]$TaskName = "CareerOpsDashboardAutopilot",
  [string]$ControlTaskName = "CareerOpsControlTick",
  [string]$FactoryTaskName = "CareerOpsEuraxessFactoryTick",
  [string]$DigestTaskName = "CareerOpsDailyDigest",
  [string]$GithubSyncTaskName = "CareerOpsGithubSync",
  [string]$Mode = "assisted",
  [switch]$SkipControlTick,
  [switch]$SkipFactoryTick,
  [switch]$SkipDigestTick,
  [switch]$SkipGithubSyncTick,
  [switch]$SkipAutopilotTick,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$trackerRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$careerOpsRoot = (Resolve-Path (Join-Path $trackerRoot "..")).Path
$launcher = Join-Path $careerOpsRoot "Launch-CareerOps-Dashboard.cmd"

if (-not (Test-Path $launcher)) {
  throw "Cannot find dashboard launcher at $launcher"
}

if ($Mode -notin @("assisted", "autopilot", "manual")) {
  throw "Mode must be assisted, autopilot, or manual"
}

if ($Remove) {
  foreach ($name in @($TaskName, $ControlTaskName, $FactoryTaskName, $DigestTaskName, $GithubSyncTaskName)) {
    $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing) {
      Unregister-ScheduledTask -TaskName $name -Confirm:$false
      Write-Host "Removed scheduled task: $name"
    } else {
      Write-Host "No scheduled task found: $name"
    }
  }
  exit 0
}

$cmd = $env:ComSpec
if (-not $cmd) {
  $cmd = (Get-Command cmd.exe -ErrorAction Stop).Source
}
# Prefer current user registration so Dropbox/path moves do not require elevation.
$taskUser = if ($env:USERDOMAIN -and $env:USERNAME) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }

if (-not $SkipAutopilotTick) {
  $arguments = "/c `"`"$launcher`" $Mode --no-open`""

  $action = New-ScheduledTaskAction -Execute $cmd -Argument $arguments -WorkingDirectory $careerOpsRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 12)

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Runs the local Career-Ops dashboard control plane and scheduled scans at login." `
    -User $taskUser `
    -Force | Out-Null

  Write-Host "Registered scheduled task: $TaskName"
  Write-Host "Mode: $Mode"
  Write-Host "User: $taskUser"
  Write-Host "Working directory: $careerOpsRoot"
}

if (-not $SkipControlTick) {
  $controlArgs = "--health"
  if ($Mode -eq "autopilot") {
    $controlArgs = "$controlArgs --autopilot"
  }
  $controlCommand = "/c `"node `"`"$trackerRoot\control-plane.mjs`"`" $controlArgs`""
  $controlAction = New-ScheduledTaskAction -Execute $cmd -Argument $controlCommand -WorkingDirectory $trackerRoot
  $controlTriggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $taskUser),
    (New-ScheduledTaskTrigger -Daily -At 8:17am),
    (New-ScheduledTaskTrigger -Daily -At 8:17pm)
  )
  $controlSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

  Register-ScheduledTask `
    -TaskName $ControlTaskName `
    -Action $controlAction `
    -Trigger $controlTriggers `
    -Settings $controlSettings `
    -Description "Runs due Career-Ops health checks, EURAXESS + PhD board scans, sync, and optional research gating." `
    -User $taskUser `
    -Force | Out-Null

  Write-Host "Registered scheduled task: $ControlTaskName"
  Write-Host "Control args: $controlArgs"
}

if (-not $SkipFactoryTick) {
  $factoryArgs = "--health --euraxess-factory --phdscanner-factory"
  $factoryCommand = "/c `"node `"`"$trackerRoot\control-plane.mjs`"`" $factoryArgs`""
  $factoryAction = New-ScheduledTaskAction -Execute $cmd -Argument $factoryCommand -WorkingDirectory $trackerRoot
  $factoryTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(5) `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
  $factorySettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

  Register-ScheduledTask `
    -TaskName $FactoryTaskName `
    -Action $factoryAction `
    -Trigger $factoryTrigger `
    -Settings $factorySettings `
    -Description "Runs EURAXESS + PhDScanner scans and factory workers every 30 minutes while Windows is awake." `
    -User $taskUser `
    -Force | Out-Null

  Write-Host "Registered scheduled task: $FactoryTaskName"
  Write-Host "Factory args: $factoryArgs"
}

if (-not $SkipDigestTick) {
  $digestLauncher = Join-Path $trackerRoot "scripts\send-daily-digest.cmd"
  if (-not (Test-Path $digestLauncher)) {
    throw "Cannot find daily digest launcher at $digestLauncher"
  }
  # Use the .cmd wrapper directly. Nested cmd /c "node ""path with spaces"" ..."
  # silently no-ops (exit 0, no mail, no log) on this Dropbox path.
  $digestAction = New-ScheduledTaskAction -Execute $digestLauncher -WorkingDirectory $trackerRoot
  $digestTrigger = New-ScheduledTaskTrigger -Daily -At 11:59pm
  # Fixed 23:59 only. Do NOT enable StartWhenAvailable — that is what caused
  # catch-up sends at 2 AM / late morning after sleep.
  $digestSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew

  try {
    $digestSettings.WakeToRun = $true
  } catch {
    Write-Host "WakeToRun not available on this Windows edition; PC must be awake at 23:59."
  }
  try {
    $digestSettings.StartWhenAvailable = $false
  } catch {}

  Register-ScheduledTask `
    -TaskName $DigestTaskName `
    -Action $digestAction `
    -Trigger $digestTrigger `
    -Settings $digestSettings `
    -Description "Sends Career-Ops Daily Digest to DAILY_DIGEST_RECIPIENTS at exactly 23:59 Eastern. No catch-up after sleep." `
    -User $taskUser `
    -Force | Out-Null

  Write-Host "Registered scheduled task: $DigestTaskName"
  Write-Host "Digest: daily 11:59 PM Eastern via $digestLauncher (no StartWhenAvailable)"
  Write-Host "Log: $trackerRoot\runtime\daily-digest.log"
}

if (-not $SkipGithubSyncTick) {
  $githubSyncLauncher = Join-Path $trackerRoot "scripts\push-local-to-github.cmd"
  if (-not (Test-Path $githubSyncLauncher)) {
    throw "Cannot find GitHub sync launcher at $githubSyncLauncher"
  }
  $githubSyncAction = New-ScheduledTaskAction -Execute $githubSyncLauncher -WorkingDirectory $trackerRoot
  $githubSyncTrigger = New-ScheduledTaskTrigger -Daily -At 11:50pm
  $githubSyncSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew

  try {
    $githubSyncSettings.WakeToRun = $true
  } catch {
    Write-Host "WakeToRun not available on this Windows edition; PC must be awake at 23:50 for GitHub sync."
  }

  Register-ScheduledTask `
    -TaskName $GithubSyncTaskName `
    -Action $githubSyncAction `
    -Trigger $githubSyncTrigger `
    -Settings $githubSyncSettings `
    -Description "Pushes allowlisted local Career-Ops changes to GitHub at 23:50, before the 23:59 digest. Never commits WEB-TRACKER/.env. Catch-up after sleep is allowed." `
    -User $taskUser `
    -Force | Out-Null

  Write-Host "Registered scheduled task: $GithubSyncTaskName"
  Write-Host "GitHub sync: daily 11:50 PM via $githubSyncLauncher (StartWhenAvailable on; no force push; no .env)"
  Write-Host "Log: $trackerRoot\runtime\github-sync.log"
}
