[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Position = 0)]
  [ValidateSet("sync", "deploy", "start", "stop", "retire", "unretire")]
  [string]$Command = "sync",

  [ValidateSet("enshrouded", "palworld")]
  [string]$Game,

  [string]$Slug,
  [string]$ConfigPath = (Join-Path $PSScriptRoot "config.local.json")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$AgentVersion = "1.0.0"
$StatePath = Join-Path $PSScriptRoot "state.local.json"

$Catalog = @{
  enshrouded = [pscustomobject]@{
    Key = "enshrouded"
    Game = "Enshrouded"
    SteamAppId = "2278520"
    ProcessNames = @("enshrouded_server")
    Executables = @("enshrouded_server.exe")
    MaximumPlayers = 16
  }
  palworld = [pscustomobject]@{
    Key = "palworld"
    Game = "Palworld"
    SteamAppId = "2394010"
    ProcessNames = @("PalServer", "PalServer-Win64-Shipping-Cmd")
    Executables = @("PalServer.exe", "Pal\\Binaries\\Win64\\PalServer-Win64-Shipping-Cmd.exe")
    MaximumPlayers = 32
  }
}

function Read-JsonFile {
  param([string]$Path, [switch]$Optional)
  if (-not (Test-Path -LiteralPath $Path)) {
    if ($Optional) { return [pscustomobject]@{} }
    throw "Required configuration file was not found: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-PropertyValue {
  param([object]$Object, [string]$Name, [object]$Default = $null)
  if ($null -eq $Object) { return $Default }
  $property = $Object.PSObject.Properties[$Name]
  if ($property -and $null -ne $property.Value) { return $property.Value }
  return $Default
}

function Get-BridgeToken {
  param([object]$Config)
  $environmentToken = [Environment]::GetEnvironmentVariable("TENGEN_BRIDGE_TOKEN")
  if ($environmentToken) { return $environmentToken }
  $configuredToken = [string](Get-PropertyValue $Config "bridgeToken" "")
  if ($configuredToken) { return $configuredToken }
  $legacyRelative = [string](Get-PropertyValue $Config "legacyBridgeConfigPath" "")
  if ($legacyRelative) {
    $legacyPath = if ([IO.Path]::IsPathRooted($legacyRelative)) { $legacyRelative } else { Join-Path $PSScriptRoot $legacyRelative }
    $legacy = Read-JsonFile $legacyPath -Optional
    $legacyToken = [string](Get-PropertyValue $legacy "TENGEN_BRIDGE_TOKEN" "")
    if ($legacyToken) { return $legacyToken }
  }
  throw "TENGEN_BRIDGE_TOKEN is required in the environment, config.local.json, or the legacy bridge config."
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    return [pscustomobject]@{ servers = @() }
  }
  $state = Read-JsonFile $StatePath
  if (-not $state.PSObject.Properties["servers"]) { $state | Add-Member -NotePropertyName servers -NotePropertyValue @() }
  return $state
}

function Save-State {
  param([object]$State)
  $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatePath -Encoding utf8
}

function Read-AppManifest {
  param([string]$Path)
  try {
    $content = Get-Content -LiteralPath $Path -Raw
    $appId = [regex]::Match($content, '"appid"\s+"(?<value>\d+)"').Groups["value"].Value
    $installDir = [regex]::Match($content, '"installdir"\s+"(?<value>[^"]+)"').Groups["value"].Value
    if (-not $appId -or -not $installDir) { return $null }
    return [pscustomobject]@{
      AppId = $appId
      InstallPath = Join-Path (Join-Path (Split-Path -Parent $Path) "common") $installDir
    }
  }
  catch {
    Write-Warning "Could not read Steam manifest $Path`: $($_.Exception.Message)"
    return $null
  }
}

function Get-SteamInstallations {
  param([object]$Config)
  $installations = @{}
  foreach ($root in @(Get-PropertyValue $Config "steamLibraryRoots" @())) {
    $steamApps = [string]$root
    if (-not (Test-Path -LiteralPath $steamApps)) { continue }
    foreach ($manifestFile in Get-ChildItem -LiteralPath $steamApps -Filter "appmanifest_*.acf" -File -ErrorAction SilentlyContinue) {
      $manifest = Read-AppManifest $manifestFile.FullName
      if ($manifest) { $installations[$manifest.AppId] = $manifest.InstallPath }
    }
  }
  return $installations
}

function Get-StateEntry {
  param([object]$State, [string]$GameKey)
  $matches = @($State.servers | Where-Object { [string]$_.gameKey -eq $GameKey } | Select-Object -First 1)
  if ($matches.Count -gt 0) { return $matches[0] }
  return $null
}

function Get-GameConfig {
  param([object]$Config, [string]$GameKey)
  $games = Get-PropertyValue $Config "games" $null
  return Get-PropertyValue $games $GameKey ([pscustomobject]@{})
}

function Get-InstallPath {
  param([object]$Config, [object]$State, [object]$Definition, [hashtable]$SteamInstallations)
  $gameConfig = Get-GameConfig $Config $Definition.Key
  $configuredPath = [string](Get-PropertyValue $gameConfig "installPath" "")
  if ($configuredPath -and (Test-Path -LiteralPath $configuredPath)) { return $configuredPath }
  $entry = Get-StateEntry $State $Definition.Key
  if ($entry -and $entry.installPath -and (Test-Path -LiteralPath ([string]$entry.installPath))) { return [string]$entry.installPath }
  if ($SteamInstallations.ContainsKey($Definition.SteamAppId)) { return [string]$SteamInstallations[$Definition.SteamAppId] }
  $installRoot = [string](Get-PropertyValue $Config "installRoot" "")
  if ($installRoot) {
    $candidate = Join-Path $installRoot $Definition.Key
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Get-RunningProcess {
  param([object]$Definition, [string]$InstallPath)
  foreach ($processName in $Definition.ProcessNames) {
    foreach ($process in @(Get-Process -Name $processName -ErrorAction SilentlyContinue)) {
      if (-not $InstallPath) { return $process }
      try {
        if ($process.Path -and $process.Path.StartsWith($InstallPath, [StringComparison]::OrdinalIgnoreCase)) { return $process }
      }
      catch {
        # Protected processes can omit Path. A matching dedicated-server process name is still useful.
        return $process
      }
    }
  }
  return $null
}

function Resolve-Executable {
  param([object]$Definition, [string]$InstallPath)
  foreach ($relativePath in $Definition.Executables) {
    $candidate = Join-Path $InstallPath $relativePath
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  throw "No known $($Definition.Game) server executable was found under $InstallPath."
}

function Get-Inventory {
  param([object]$Config, [object]$State)
  $steamInstallations = Get-SteamInstallations $Config
  $inventory = [System.Collections.Generic.List[object]]::new()
  foreach ($definition in $Catalog.Values | Sort-Object Game) {
    $installPath = Get-InstallPath $Config $State $definition $steamInstallations
    $entry = Get-StateEntry $State $definition.Key
    if (-not $installPath -and -not $entry) { continue }
    if (-not $installPath -or -not (Test-Path -LiteralPath $installPath)) { continue }
    $process = Get-RunningProcess $definition $installPath
    $retired = [bool](Get-PropertyValue $entry "retired" $false)
    $current = [bool](Get-PropertyValue $entry "current" $false)
    $configuredSlug = [string](Get-PropertyValue $entry "slug" "$($definition.Key)-home")
    $inventory.Add([pscustomobject]@{
      slug = $configuredSlug
      name = [string](Get-PropertyValue $entry "name" "Home Server")
      game = $definition.Game
      steamAppId = $definition.SteamAppId
      region = [string](Get-PropertyValue $Config "region" "US West")
      status = if ($process) { "online" } else { "offline" }
      current = $current -and -not $retired
      retired = $retired
      currentPlayers = $null
      maximumPlayers = [int]$definition.MaximumPlayers
      playerNames = @()
    })
  }
  $nonRetired = @($inventory | Where-Object { -not $_.retired })
  $online = @($nonRetired | Where-Object { $_.status -eq "online" })
  $current = @($nonRetired | Where-Object current)
  if ($online.Count -gt 0) {
    $selected = @($online | Where-Object current | Select-Object -First 1)
    if ($selected.Count -eq 0) { $selected = @($online | Select-Object -First 1) }
    foreach ($server in $nonRetired) { $server.current = $false }
    $selected[0].current = $true
  }
  elseif ($current.Count -eq 0 -and $nonRetired.Count -gt 0) {
    $selected = $nonRetired | Select-Object -First 1
    $selected.current = $true
  }
  return @($inventory)
}

function Publish-Inventory {
  param([object]$Config, [object]$State)
  $token = Get-BridgeToken $Config
  $syncUrl = [string](Get-PropertyValue $Config "syncUrl" "https://tengen.me/api/server-registry/sync")
  $payload = @{
    hostId = [string](Get-PropertyValue $Config "hostId" "home-windows")
    hostName = [string](Get-PropertyValue $Config "hostName" $env:COMPUTERNAME)
    agentVersion = $AgentVersion
    observedAt = [DateTime]::UtcNow.ToString("o")
    servers = @(Get-Inventory $Config $State)
  }
  $body = $payload | ConvertTo-Json -Depth 8 -Compress
  $headers = @{ Authorization = "Bearer $token" }
  $result = Invoke-RestMethod -Uri $syncUrl -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 30
  Write-Host "Synchronized $($payload.servers.Count) server(s) with tengen.me at $($result.receivedAt)."
}

function Ensure-StateEntry {
  param([object]$Config, [object]$State, [string]$GameKey, [string]$RequestedSlug, [string]$InstallPath)
  $existing = Get-StateEntry $State $GameKey
  $entries = @($State.servers | Where-Object { [string]$_.gameKey -ne $GameKey })
  foreach ($entry in $entries) { $entry.current = $false }
  $stateEntry = [pscustomobject]@{
    gameKey = $GameKey
    slug = if ($RequestedSlug) { $RequestedSlug } elseif ($existing) { [string]$existing.slug } else { "$GameKey-home" }
    name = if ($existing -and $existing.name) { [string]$existing.name } else { "Home Server" }
    installPath = $InstallPath
    current = $true
    retired = $false
  }
  if ($WhatIfPreference) { return $stateEntry }
  $State.servers = @($entries + $stateEntry)
  Save-State $State
  return $stateEntry
}

function Deploy-Server {
  param([object]$Config, [object]$State, [string]$GameKey, [string]$RequestedSlug)
  if (-not $GameKey) { throw "-Game is required for deploy." }
  $definition = $Catalog[$GameKey]
  $steamCmdPath = [string](Get-PropertyValue $Config "steamCmdPath" "")
  $installRoot = [string](Get-PropertyValue $Config "installRoot" "")
  if (-not (Test-Path -LiteralPath $steamCmdPath -PathType Leaf)) { throw "steamcmd.exe was not found at $steamCmdPath." }
  if (-not $installRoot) { throw "installRoot is required in config.local.json." }
  $existing = Get-StateEntry $State $GameKey
  $installPath = if ($existing -and $existing.installPath) { [string]$existing.installPath } else { Join-Path $installRoot $GameKey }
  if ($PSCmdlet.ShouldProcess($definition.Game, "Install or update with SteamCMD")) {
    New-Item -ItemType Directory -Path $installPath -Force | Out-Null
    & $steamCmdPath "+force_install_dir" $installPath "+login" "anonymous" "+app_update" $definition.SteamAppId "validate" "+quit"
    if ($LASTEXITCODE -ne 0) { throw "SteamCMD exited with code $LASTEXITCODE." }
  }
  if ($WhatIfPreference) { return }
  [void](Ensure-StateEntry $Config $State $GameKey $RequestedSlug $installPath)
  Start-Server $Config $State $GameKey
}

function Start-Server {
  param([object]$Config, [object]$State, [string]$GameKey)
  if (-not $GameKey) { throw "-Game is required for start." }
  $definition = $Catalog[$GameKey]
  $steamInstallations = Get-SteamInstallations $Config
  $installPath = Get-InstallPath $Config $State $definition $steamInstallations
  if (-not $installPath) { throw "$($definition.Game) is not installed in a configured location." }
  if (Get-RunningProcess $definition $installPath) { Write-Host "$($definition.Game) is already running."; return }
  $executable = Resolve-Executable $definition $installPath
  $gameConfig = Get-GameConfig $Config $GameKey
  $arguments = [string](Get-PropertyValue $gameConfig "startArguments" "")
  if ($PSCmdlet.ShouldProcess($definition.Game, "Start dedicated server")) {
    Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory (Split-Path -Parent $executable) -WindowStyle Hidden
    Write-Host "Started $($definition.Game)."
  }
  [void](Ensure-StateEntry $Config $State $GameKey $Slug $installPath)
}

function Stop-Server {
  param([object]$Config, [object]$State, [string]$GameKey)
  if (-not $GameKey) { throw "-Game is required for stop." }
  $definition = $Catalog[$GameKey]
  $installPath = Get-InstallPath $Config $State $definition (Get-SteamInstallations $Config)
  $process = Get-RunningProcess $definition $installPath
  if (-not $process) { Write-Host "$($definition.Game) is not running."; return }
  if ($PSCmdlet.ShouldProcess($definition.Game, "Stop dedicated server")) {
    Stop-Process -Id $process.Id
    Write-Host "Stopped $($definition.Game)."
  }
}

function Set-Retirement {
  param([object]$State, [string]$GameKey, [bool]$Retired)
  if (-not $GameKey) { throw "-Game is required for retire or unretire." }
  $entry = Get-StateEntry $State $GameKey
  if (-not $entry) { throw "$GameKey is not registered in state.local.json." }
  if ($WhatIfPreference) { Write-Host "What if: set $GameKey retired=$Retired"; return }
  $entry.retired = $Retired
  $entry.current = -not $Retired
  if (-not $Retired) {
    foreach ($other in @($State.servers | Where-Object { [string]$_.gameKey -ne $GameKey })) { $other.current = $false }
  }
  Save-State $State
}

$config = Read-JsonFile $ConfigPath
$state = Read-State

switch ($Command) {
  "deploy" { Deploy-Server $config $state $Game $Slug }
  "start" { Start-Server $config $state $Game }
  "stop" { Stop-Server $config $state $Game }
  "retire" { Stop-Server $config $state $Game; Set-Retirement $state $Game $true }
  "unretire" { Set-Retirement $state $Game $false }
}

if (-not $WhatIfPreference) { Publish-Inventory $config (Read-State) }
