param(
  [string]$TaskName = "CareerOpsDailyDigestTonight2am",
  [datetime]$At = (Get-Date "2026-08-13 02:00:00"),
  [datetime]$Expires = (Get-Date "2026-08-13 02:20:00"),
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$trackerRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$digestLauncher = Join-Path $trackerRoot "scripts\send-daily-digest.cmd"

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task: $TaskName"
  } else {
    Write-Host "No scheduled task found: $TaskName"
  }
  exit 0
}

if (-not (Test-Path $digestLauncher)) {
  throw "Cannot find daily digest launcher at $digestLauncher"
}

$taskUser = if ($env:USERDOMAIN -and $env:USERNAME) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }

# Enable wake timers on the current power scheme (AC + battery).
try {
  powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
  powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
  powercfg /SETACTIVE SCHEME_CURRENT | Out-Null
  Write-Host "Enabled wake timers on the current power plan (AC + battery)."
} catch {
  Write-Host "Could not enable wake timers: $($_.Exception.Message)"
}

$action = New-ScheduledTaskAction `
  -Execute $digestLauncher `
  -Argument "--send --date 2026-08-12" `
  -WorkingDirectory $trackerRoot

$trigger = New-ScheduledTaskTrigger -Once -At $At
$trigger.EndBoundary = $Expires.ToString("s")

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
  -MultipleInstances IgnoreNew `
  -DeleteExpiredTaskAfter (New-TimeSpan -Hours 6)

try { $settings.WakeToRun = $true } catch {
  Write-Host "WakeToRun not available on this Windows edition."
}
# Tight expiry: do not become a late-morning catch-up. Wake from sleep at 02:00.
try { $settings.StartWhenAvailable = $false } catch {}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "ONE NIGHT ONLY: send the 2026-08-12 Career-Ops digest at 02:00 ET. Daily 23:59 task is unchanged." `
  -User $taskUser `
  -Force | Out-Null

Write-Host "Registered one-shot task: $TaskName"
Write-Host "Runs at: $($At.ToString('yyyy-MM-dd HH:mm')) local"
Write-Host "Expires: $($Expires.ToString('yyyy-MM-dd HH:mm')) local"
Write-Host "Sends: Aug 12 digest via $digestLauncher --send --date 2026-08-12"
Write-Host "WakeToRun: on. Lid-closed sleep can wake; a full Shut Down cannot self-boot."
Write-Host "Daily CareerOpsDailyDigest at 11:59 PM is unchanged for tomorrow onward."
