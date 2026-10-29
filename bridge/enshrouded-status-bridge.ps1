[CmdletBinding()]
param(
  [switch]$Once,
  [ValidateRange(15, 3600)]
  [int]$IntervalSeconds = 60,
  [string]$ConfigPath = (Join-Path $PSScriptRoot "bridge-config.local.json")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Setting {
  param([string]$Name, [object]$Config, [string]$Default = "")
  $environmentValue = [Environment]::GetEnvironmentVariable($Name)
  if ($environmentValue) { return $environmentValue }
  $property = $Config.PSObject.Properties[$Name]
  if ($property -and $null -ne $property.Value -and [string]$property.Value -ne "") { return [string]$property.Value }
  return $Default
}

function Send-Snapshot {
  param([hashtable]$Snapshot, [string]$BridgeUrl, [string]$BridgeToken)
  $headers = @{ Authorization = "Bearer $BridgeToken" }
  $body = $Snapshot | ConvertTo-Json -Depth 4 -Compress
  Invoke-RestMethod -Uri $BridgeUrl -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 15 | Out-Null
}

function Get-QueuedAction {
  param([string]$ActionsUrl, [string]$BridgeToken)
  $headers = @{ Authorization = "Bearer $BridgeToken" }
  return Invoke-RestMethod -Uri "$($ActionsUrl.TrimEnd('/'))/next" -Method Get -Headers $headers -TimeoutSec 10
}

function Complete-QueuedAction {
  param(
    [string]$ActionsUrl,
    [string]$BridgeToken,
    [string]$ActionId,
    [ValidateSet("completed", "failed")]
    [string]$Status,
    [string]$Message
  )
  $headers = @{ Authorization = "Bearer $BridgeToken" }
  $body = @{ status = $Status; message = $Message } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "$($ActionsUrl.TrimEnd('/'))/$ActionId/complete" -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 10 | Out-Null
}

function Invoke-A2SRequest {
  param([string]$HostName, [int]$Port, [byte[]]$Payload)
  $client = [System.Net.Sockets.UdpClient]::new()
  try {
    $client.Client.ReceiveTimeout = 5000
    $client.Client.SendTimeout = 5000
    $client.Connect($HostName, $Port)
    [void]$client.Send($Payload, $Payload.Length)
    $remoteEndpoint = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 0)
    for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
      $response = $client.Receive([ref]$remoteEndpoint)
      if ($response.Length -lt 5 -or [BitConverter]::ToInt32($response, 0) -ne -1) {
        throw "The Steam query response was invalid or split across packets."
      }
      if ($response[4] -ne 0x41) { return [byte[]]$response }
      if ($response.Length -lt 9) { throw "The Steam query challenge was incomplete." }
      if ($attempt -eq 2) { throw "The Steam query challenge was not accepted." }

      # Challenges must be answered on the same socket as the original query.
      $challenge = $response[5..8]
      if ($Payload[4] -eq 0x54) {
        $challengedPayload = [byte[]]($Payload + $challenge)
      }
      elseif ($Payload[4] -eq 0x55) {
        $challengedPayload = [byte[]]($Payload[0..4] + $challenge)
      }
      else { throw "The Steam query type does not support challenges." }
      [void]$client.Send($challengedPayload, $challengedPayload.Length)
    }
  }
  finally {
    $client.Dispose()
  }
}

function Read-CString {
  param([byte[]]$Bytes, [ref]$Offset)
  $start = $Offset.Value
  $cursor = $start
  while ($cursor -lt $Bytes.Length -and $Bytes[$cursor] -ne 0) { $cursor += 1 }
  if ($cursor -ge $Bytes.Length) { throw "The Steam query response contained an unterminated string." }
  $Offset.Value = $cursor + 1
  return [Text.Encoding]::UTF8.GetString($Bytes, $start, $cursor - $start)
}

function Get-EnshroudedInfo {
  param([string]$HostName, [int]$Port)
  $prefix = [byte[]](0xFF, 0xFF, 0xFF, 0xFF)
  $query = [byte[]]($prefix + [Text.Encoding]::ASCII.GetBytes("TSource Engine Query`0"))
  $response = Invoke-A2SRequest $HostName $Port $query
  if ($response[4] -ne 0x49) { throw "The query port did not return a Source A2S_INFO response." }

  $offset = 6
  $serverName = Read-CString $response ([ref]$offset)
  [void](Read-CString $response ([ref]$offset))
  [void](Read-CString $response ([ref]$offset))
  [void](Read-CString $response ([ref]$offset))
  if ($offset + 4 -gt $response.Length) { throw "The A2S_INFO response was incomplete." }
  $offset += 2
  $currentPlayers = [int]$response[$offset]
  $maximumPlayers = [int]$response[$offset + 1]
  return [pscustomobject]@{
    Name = $serverName
    CurrentPlayers = $currentPlayers
    MaximumPlayers = $maximumPlayers
  }
}

function Get-EnshroudedPlayers {
  param([string]$HostName, [int]$Port)
  $prefix = [byte[]](0xFF, 0xFF, 0xFF, 0xFF)
  $playerQuery = [byte[]]($prefix + 0x55 + 0xFF + 0xFF + 0xFF + 0xFF)
  $response = Invoke-A2SRequest $HostName $Port $playerQuery
  if ($response.Length -lt 6 -or $response[4] -ne 0x44) { throw "The query port did not return an A2S_PLAYER response." }

  $playerCount = [int]$response[5]
  $offset = 6
  $names = [System.Collections.Generic.List[string]]::new()
  for ($index = 0; $index -lt $playerCount; $index += 1) {
    if ($offset -ge $response.Length) { break }
    $offset += 1
    $name = Read-CString $response ([ref]$offset)
    if ($offset + 8 -gt $response.Length) { break }
    $offset += 8
    if ($name) { $names.Add($name) }
  }
  return @($names)
}

function Test-EnshroudedPlayerName {
  param([string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
  $trimmed = $Name.Trim()
  if ($trimmed -match '^\d+(\(\d+\))?$') { return $false }
  return $trimmed -notin @("Reserve", "WaitForJoin", "HostOnline", "Host_Online", "Lobby", "LoadingWorld", "Playing", "Login", "Session")
}

function Resolve-EnshroudedLogDirectory {
  param([object]$Config, [string]$ConfiguredPath)
  if ($ConfiguredPath) { return $ConfiguredPath }

  $serverProcess = Get-Process -Name "enshrouded_server" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $serverProcess -or -not $serverProcess.Path) { return $null }
  $serverDirectory = Split-Path -Parent $serverProcess.Path
  $serverConfigPath = Join-Path $serverDirectory "enshrouded_server.json"
  $logDirectory = "./logs"
  if (Test-Path -LiteralPath $serverConfigPath) {
    try {
      $serverConfig = Get-Content -LiteralPath $serverConfigPath -Raw | ConvertFrom-Json
      if ($serverConfig.logDirectory) { $logDirectory = [string]$serverConfig.logDirectory }
    }
    catch {
      Write-Warning "Could not read the Enshrouded server configuration; using its default log directory."
    }
  }
  if ([System.IO.Path]::IsPathRooted($logDirectory)) { return $logDirectory }
  return [System.IO.Path]::GetFullPath((Join-Path $serverDirectory $logDirectory))
}

function Get-EnshroudedLogPlayers {
  param([string]$LogDirectory, [int]$CurrentPlayers)
  if ($CurrentPlayers -le 0 -or -not $LogDirectory -or -not (Test-Path -LiteralPath $LogDirectory)) { return @() }
  $log = Get-ChildItem -LiteralPath $LogDirectory -File -Filter "*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $log) { return @() }

  # Enshrouded leaves A2S player names blank. Its local log records joins,
  # departures, and a complete roster inside regular save blocks.
  $roster = [ordered]@{}
  $savingRoster = $null
  foreach ($line in (Get-Content -LiteralPath $log.FullName -Tail 25000 -ErrorAction Stop)) {
    if ($line -match '\(up\)!|\(down\)!') { continue }
    if ($line -match '\[server\] Start Saving') {
      $savingRoster = [ordered]@{}
      continue
    }
    if ($null -ne $savingRoster) {
      if ($line -match "Sending Character Savegame '([^']+)'") {
        $name = $Matches[1].Trim()
        if (Test-EnshroudedPlayerName $name) { $savingRoster[$name] = $true }
        continue
      }
      if ($line -match '\[server\] Saved') {
        $roster = $savingRoster
        $savingRoster = $null
        continue
      }
    }
    if ($line -match "\[server\] Player '([^']+)' (?:logged in|joined)") {
      $name = $Matches[1].Trim()
      if (Test-EnshroudedPlayerName $name) {
        $roster.Remove($name)
        $roster[$name] = $true
      }
      continue
    }
    if ($line -match "\[server\] Remove (?:Entity for )?Player '([^']+)'" -or $line -match "Player '([^']+)' (?:logged out|left|disconnected)") {
      $roster.Remove($Matches[1].Trim())
    }
  }
  return @($roster.Keys | Select-Object -First $CurrentPlayers)
}

$config = [pscustomobject]@{}
if (Test-Path -LiteralPath $ConfigPath) {
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
}

$queryHost = Get-Setting "ENSHROUDED_QUERY_HOST" $config "127.0.0.1"
$queryPort = [int](Get-Setting "ENSHROUDED_QUERY_PORT" $config "15637")
$slotCount = [int](Get-Setting "ENSHROUDED_SLOT_COUNT" $config "16")
$configuredLogDirectory = Get-Setting "ENSHROUDED_LOG_DIRECTORY" $config
$bridgeUrl = Get-Setting "TENGEN_BRIDGE_URL" $config "https://tengen.me/api/server-status/ingest"
$actionsUrl = Get-Setting "TENGEN_ACTIONS_URL" $config "https://tengen.me/api/server-status/actions"
$bridgeToken = Get-Setting "TENGEN_BRIDGE_TOKEN" $config

if (-not $bridgeToken) { throw "TENGEN_BRIDGE_TOKEN is required in the environment or local config file." }
if ($queryPort -lt 1 -or $queryPort -gt 65535) { throw "ENSHROUDED_QUERY_PORT must be a valid UDP port." }
if ($slotCount -lt 1 -or $slotCount -gt 16) { throw "ENSHROUDED_SLOT_COUNT must be between 1 and 16." }

do {
  $observedAt = [DateTime]::UtcNow.ToString("o")
  $queuedAction = $null
  try {
    $queuedAction = Get-QueuedAction $actionsUrl $bridgeToken
  }
  catch {
    Write-Warning "[$observedAt] Could not check owner actions: $($_.Exception.Message)"
  }

  if ($queuedAction -and $queuedAction.action -ne "refresh-status") {
    try { Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "failed" "The Enshrouded bridge rejected an unsupported action." } catch { Write-Warning "[$observedAt] Could not reject the unsupported owner action." }
    $queuedAction = $null
  }

  try {
    $info = Get-EnshroudedInfo $queryHost $queryPort
    $currentPlayers = [Math]::Max(0, [int]$info.CurrentPlayers)
    $maximumPlayers = if ([int]$info.MaximumPlayers -gt 0) { [Math]::Min(16, [int]$info.MaximumPlayers) } else { $slotCount }
    $playerNames = @()
    try {
      $playerNames = @(Get-EnshroudedPlayers $queryHost $queryPort | Where-Object { $_ } | Select-Object -First 16)
    }
    catch {
      Write-Warning "[$observedAt] Player names were unavailable; publishing the A2S_INFO count only: $($_.Exception.Message)"
    }
    if ($playerNames.Count -lt $currentPlayers) {
      try {
        $logDirectory = Resolve-EnshroudedLogDirectory $config $configuredLogDirectory
        $logPlayerNames = @(Get-EnshroudedLogPlayers $logDirectory $currentPlayers)
        if ($logPlayerNames.Count -gt $playerNames.Count) { $playerNames = $logPlayerNames }
      }
      catch {
        Write-Warning "[$observedAt] Player names were unavailable from the Enshrouded log: $($_.Exception.Message)"
      }
    }

    Send-Snapshot @{
      slug = "enshrouded-home"; status = "online"; currentPlayers = $currentPlayers
      maximumPlayers = $maximumPlayers; playerNames = $playerNames; observedAt = $observedAt
    } $bridgeUrl $bridgeToken
    Write-Host "[$observedAt] Published Enshrouded online: $currentPlayers/$maximumPlayers players."
    if ($queuedAction -and $queuedAction.action -eq "refresh-status") {
      Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "completed" "Published a fresh Enshrouded status snapshot."
      Write-Host "[$observedAt] Completed owner action: refresh status."
    }
  }
  catch {
    Write-Warning "[$observedAt] Enshrouded query failed: $($_.Exception.Message)"
    try {
      Send-Snapshot @{
        slug = "enshrouded-home"; status = "offline"; currentPlayers = 0
        maximumPlayers = $slotCount; playerNames = @(); observedAt = $observedAt
      } $bridgeUrl $bridgeToken
      Write-Host "[$observedAt] Published Enshrouded offline state."
      if ($queuedAction -and $queuedAction.action -eq "refresh-status") {
        Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "completed" "Published a fresh Enshrouded offline status snapshot."
      }
    }
    catch {
      Write-Warning "[$observedAt] Could not reach tengen.me: $($_.Exception.Message)"
      if ($queuedAction -and $queuedAction.action -eq "refresh-status") {
        try { Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "failed" "The bridge could not publish the requested status snapshot." } catch { Write-Warning "[$observedAt] Could not report the failed owner action." }
      }
    }
  }
  if (-not $Once) { Start-Sleep -Seconds $IntervalSeconds }
} while (-not $Once)
