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
  if ($property -and $property.Value) { return [string]$property.Value }
  return $Default
}

function Send-Snapshot {
  param([hashtable]$Snapshot, [string]$BridgeUrl, [string]$BridgeToken)
  $headers = @{ Authorization = "Bearer $BridgeToken" }
  $body = $Snapshot | ConvertTo-Json -Depth 4 -Compress
  Invoke-RestMethod -Uri $BridgeUrl -Method Post -Headers $headers -ContentType "application/json" -Body $body | Out-Null
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

$config = [pscustomobject]@{}
if (Test-Path -LiteralPath $ConfigPath) {
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
}

$apiUrl = (Get-Setting "PALWORLD_API_URL" $config "http://127.0.0.1:8212/v1/api").TrimEnd("/")
$apiUsername = Get-Setting "PALWORLD_API_USERNAME" $config "admin"
$adminPassword = Get-Setting "PALWORLD_ADMIN_PASSWORD" $config
$bridgeUrl = Get-Setting "TENGEN_BRIDGE_URL" $config "https://tengen.me/api/server-status/ingest"
$actionsUrl = Get-Setting "TENGEN_ACTIONS_URL" $config "https://tengen.me/api/server-status/actions"
$bridgeToken = Get-Setting "TENGEN_BRIDGE_TOKEN" $config

if (-not $adminPassword) { throw "PALWORLD_ADMIN_PASSWORD is required in the environment or local config file." }
if (-not $bridgeToken) { throw "TENGEN_BRIDGE_TOKEN is required in the environment or local config file." }

$credentialBytes = [Text.Encoding]::UTF8.GetBytes("${apiUsername}:${adminPassword}")
$apiHeaders = @{ Authorization = "Basic $([Convert]::ToBase64String($credentialBytes))" }

do {
  $observedAt = [DateTime]::UtcNow.ToString("o")
  $queuedAction = $null
  try {
    $queuedAction = Get-QueuedAction $actionsUrl $bridgeToken
  }
  catch {
    Write-Warning "[$observedAt] Could not check owner actions: $($_.Exception.Message)"
  }

  if ($queuedAction -and $queuedAction.action -eq "save-world") {
    try {
      Invoke-RestMethod -Uri "$apiUrl/save" -Headers $apiHeaders -Method Post -ContentType "application/json" -TimeoutSec 15 | Out-Null
      Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "completed" "Palworld confirmed that the world was saved."
      Write-Host "[$observedAt] Completed owner action: save world."
    }
    catch {
      $failureMessage = "Palworld save failed: $($_.Exception.Message)"
      Write-Warning "[$observedAt] $failureMessage"
      try { Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "failed" $failureMessage } catch { Write-Warning "[$observedAt] Could not report the failed owner action." }
    }
    $queuedAction = $null
  }
  elseif ($queuedAction -and $queuedAction.action -ne "refresh-status") {
    try { Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "failed" "The bridge rejected an unknown action." } catch { Write-Warning "[$observedAt] Could not reject the unknown owner action." }
    $queuedAction = $null
  }

  try {
    $metrics = Invoke-RestMethod -Uri "$apiUrl/metrics" -Headers $apiHeaders -Method Get -TimeoutSec 10
    $playersResponse = Invoke-RestMethod -Uri "$apiUrl/players" -Headers $apiHeaders -Method Get -TimeoutSec 10
    $currentPlayers = [Math]::Max(0, [int]$metrics.currentplayernum)
    $maximumPlayers = if ($metrics.maxplayernum) { [int]$metrics.maxplayernum } else { 32 }
    $playerNames = @($playersResponse.players | ForEach-Object { [string]$_.name } | Where-Object { $_ } | Select-Object -First 32)
    Send-Snapshot @{
      slug = "palworld-home"; status = "online"; currentPlayers = $currentPlayers
      maximumPlayers = $maximumPlayers; playerNames = $playerNames; observedAt = $observedAt
    } $bridgeUrl $bridgeToken
    Write-Host "[$observedAt] Published online: $currentPlayers/$maximumPlayers players."
    if ($queuedAction -and $queuedAction.action -eq "refresh-status") {
      Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "completed" "Published a fresh online status snapshot."
      Write-Host "[$observedAt] Completed owner action: refresh status."
    }
  }
  catch {
    Write-Warning "[$observedAt] Palworld query failed: $($_.Exception.Message)"
    try {
      Send-Snapshot @{
        slug = "palworld-home"; status = "offline"; currentPlayers = 0
        maximumPlayers = 32; playerNames = @(); observedAt = $observedAt
      } $bridgeUrl $bridgeToken
      Write-Host "[$observedAt] Published offline state."
      if ($queuedAction -and $queuedAction.action -eq "refresh-status") {
        Complete-QueuedAction $actionsUrl $bridgeToken $queuedAction.id "completed" "Published a fresh offline status snapshot."
        Write-Host "[$observedAt] Completed owner action: refresh status."
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
