# Without -Register, only add a missing local webhook secret. No network or deployment.
# Run -Register only during approved deployment, after uploading secrets to the host.
[CmdletBinding()]
param([switch]$Register, [string]$WorkerUrl)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 6) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}
$settingsPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.dev.vars'
if (-not (Test-Path -LiteralPath $settingsPath)) { throw 'Complete Telegram pairing first.' }
$values = @{}
foreach ($line in [IO.File]::ReadAllLines($settingsPath)) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
}
if (-not $values['TELEGRAM_WEBHOOK_SECRET']) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $values['TELEGRAM_WEBHOOK_SECRET'] = [BitConverter]::ToString($bytes).Replace('-', '')
    [Array]::Clear($bytes, 0, $bytes.Length)
    [IO.File]::AppendAllText($settingsPath, "`nTELEGRAM_WEBHOOK_SECRET=$($values['TELEGRAM_WEBHOOK_SECRET'])`n")
    Write-Output 'Added webhook secret to ignored local settings. No value was printed.'
}
if (-not $Register) { Write-Output 'Local reminder settings ready; no hosted changes made.'; exit }
try {
    $target = [Uri]$WorkerUrl
    if ($target.Scheme -ne 'https' -or $target.AbsolutePath -ne '/' -or $target.Query -or
        $target.Fragment -or $target.UserInfo -or -not $target.IsDefaultPort) {
        throw 'Expected an HTTPS Worker origin.'
    }
    $origin = $target.GetLeftPart([UriPartial]::Authority)
    $health = Invoke-RestMethod "$origin/health" -TimeoutSec 15 -MaximumRedirection 0
    if ($health.state.paused -ne $true) { throw 'Pause the monitor before webhook setup.' }
    $webhookUrl = "$origin/telegram-webhook"
    # Confirm the host knows this exact secret before registering a stop destination.
    $null = Invoke-RestMethod -Method Post -Uri $webhookUrl -ContentType 'application/json' -Body '{}' `
        -Headers @{ 'X-Telegram-Bot-Api-Secret-Token' = $values['TELEGRAM_WEBHOOK_SECRET'] } `
        -TimeoutSec 15 -MaximumRedirection 0
    $api = 'https://api.telegram.org/bot' + $values['TELEGRAM_BOT_TOKEN']
    $existing = Invoke-RestMethod -Method Post -Uri "$api/getWebhookInfo" -TimeoutSec 15 -MaximumRedirection 0
    if (-not $existing.ok -or ($existing.result.url -and $existing.result.url -ne $webhookUrl)) {
        throw 'Another webhook is configured. Do not overwrite it.'
    }
    $payload = @{ url = $webhookUrl; secret_token = $values['TELEGRAM_WEBHOOK_SECRET'];
        allowed_updates = @('message', 'callback_query'); max_connections = 1; drop_pending_updates = $false }
    $reply = Invoke-RestMethod -Method Post -Uri "$api/setWebhook" -ContentType 'application/json' `
        -Body ($payload | ConvertTo-Json -Compress) -TimeoutSec 15 -MaximumRedirection 0
    if (-not $reply.ok) { throw 'Webhook registration rejected.' }
    $verified = Invoke-RestMethod -Method Post -Uri "$api/getWebhookInfo" -TimeoutSec 15 -MaximumRedirection 0
    if (-not $verified.ok -or $verified.result.url -ne $webhookUrl) { throw 'Webhook verification failed.' }
    Write-Output 'Stop webhook registered and verified. Keep monitoring paused until the end-to-end stop test succeeds.'
} catch {
    throw 'Webhook setup failed; raw errors suppressed to protect tokens. Check paused state, uploaded secrets, Worker URL, network access, and existing webhook configuration.'
} finally { $values.Clear(); $api = $null; $payload = $null; $existing = $null; $verified = $null }
