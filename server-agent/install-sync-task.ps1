[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = "tengen.me Server Registry Sync",
  [string]$AgentPath = (Join-Path $PSScriptRoot "serverctl.ps1"),
  [string]$ConfigPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $AgentPath -PathType Leaf)) {
  throw "serverctl.ps1 was not found at $AgentPath"
}

$agentDirectory = Split-Path -Parent $AgentPath
if (-not $ConfigPath) {
  $ConfigPath = Join-Path $agentDirectory "config.local.json"
}
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "config.local.json was not found at $ConfigPath"
}

$powerShellPath = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$AgentPath`" sync -ConfigPath `"$ConfigPath`""
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $agentDirectory
$startup = New-ScheduledTaskTrigger -AtStartup
$sixHours = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 6)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

if ($PSCmdlet.ShouldProcess($TaskName, "Register startup and six-hour synchronization task")) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($startup, $sixHours) -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "Registered '$TaskName' to run at startup and every six hours."
}
