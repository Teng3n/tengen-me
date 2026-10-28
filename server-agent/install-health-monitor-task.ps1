[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = "tengen.me Enshrouded Health Monitor",
  [string]$MonitorPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "bridge\enshrouded-status-bridge.ps1"),
  [string]$ControllerConfigPath = (Join-Path $PSScriptRoot "config.local.json"),
  [string]$BridgeConfigPath,
  [ValidateRange(15, 3600)]
  [int]$IntervalSeconds = 60
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $MonitorPath -PathType Leaf)) {
  throw "The Enshrouded health monitor was not found at $MonitorPath"
}
if (-not (Test-Path -LiteralPath $ControllerConfigPath -PathType Leaf)) {
  throw "The controller configuration was not found at $ControllerConfigPath"
}

if (-not $BridgeConfigPath) {
  $controllerConfig = Get-Content -LiteralPath $ControllerConfigPath -Raw | ConvertFrom-Json
  $legacyProperty = $controllerConfig.PSObject.Properties["legacyBridgeConfigPath"]
  $configuredPath = if ($legacyProperty) { [string]$legacyProperty.Value } else { "" }
  if ($configuredPath) {
    $BridgeConfigPath = if ([IO.Path]::IsPathRooted($configuredPath)) {
      $configuredPath
    } else {
      Join-Path (Split-Path -Parent $ControllerConfigPath) $configuredPath
    }
  }
}
if (-not $BridgeConfigPath -or -not (Test-Path -LiteralPath $BridgeConfigPath -PathType Leaf)) {
  throw "A bridge configuration containing the existing token is required. Pass -BridgeConfigPath explicitly or set legacyBridgeConfigPath in config.local.json."
}

$monitorPathResolved = (Resolve-Path -LiteralPath $MonitorPath).Path
$bridgeConfigPathResolved = (Resolve-Path -LiteralPath $BridgeConfigPath).Path
$powerShellPath = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$monitorPathResolved`" -IntervalSeconds $IntervalSeconds -ConfigPath `"$bridgeConfigPathResolved`""
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory (Split-Path -Parent $monitorPathResolved)
$startup = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

if ($PSCmdlet.ShouldProcess($TaskName, "Register one-minute Enshrouded health monitor")) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $startup -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "Registered '$TaskName' to query Enshrouded every $IntervalSeconds seconds after system startup."
}
