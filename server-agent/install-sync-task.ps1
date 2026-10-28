[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = "tengen.me Server Registry Sync",
  [string]$AgentPath = (Join-Path $PSScriptRoot "serverctl.ps1")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $AgentPath -PathType Leaf)) {
  throw "serverctl.ps1 was not found at $AgentPath"
}

$powerShellPath = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$AgentPath`" sync"
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory (Split-Path -Parent $AgentPath)
$startup = New-ScheduledTaskTrigger -AtStartup
$sixHours = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 6)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

if ($PSCmdlet.ShouldProcess($TaskName, "Register startup and six-hour synchronization task")) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($startup, $sixHours) -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "Registered '$TaskName' to run at startup and every six hours."
}
