# Compatible with Windows PowerShell 5.1 and PowerShell 7.
# Keys are entered without echo and never printed.
# No deployment, DNS change, payment, or notification is performed by this helper.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# Windows PowerShell uses .NET Framework; require modern TLS for this process only.
if ($PSVersionTable.PSVersion.Major -lt 6) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}
$monitorRoot = Split-Path -Parent $PSScriptRoot
$settingsPath = Join-Path $monitorRoot '.dev.vars'
if (Test-Path -LiteralPath $settingsPath) {
    throw 'A .dev.vars file already exists. Keep it; update its settings privately instead of rerunning setup.'
}

function Read-PrivateValue([string]$Label) {
    $protectedValue = Read-Host $Label -AsSecureString
    $plainValue = [System.Net.NetworkCredential]::new('', $protectedValue).Password
    if ([string]::IsNullOrWhiteSpace($plainValue)) { throw "$Label is required." }
    return $plainValue.Trim()
}

function New-AdminToken {
    $randomBytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($randomBytes)
        return [BitConverter]::ToString($randomBytes).Replace('-', '')
    } finally {
        $generator.Dispose()
        [Array]::Clear($randomBytes, 0, $randomBytes.Length)
    }
}

function Invoke-TelegramRead([string]$Method, [hashtable]$Body) {
    try {
        $reply = Invoke-RestMethod -Uri "https://api.telegram.org/bot$telegramToken/$Method" `
            -Method Post -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Compress) `
            -TimeoutSec 15 -MaximumRedirection 0 -Verbose:$false -Debug:$false
        if ($reply.ok -ne $true) { throw 'Telegram rejected the request.' }
        return $reply.result
    } catch {
        # The underlying error may contain a token-bearing URL. Do not print it.
        throw 'Telegram lookup failed. Check the token and connection. No settings were saved.'
    }
}

try {
    Write-Host 'Create a bot with the verified @BotFather in Telegram using /newbot.'
    $telegramToken = Read-PrivateValue 'Paste the bot token (hidden)'
    if ($telegramToken -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw 'The bot token format is not valid.' }
    $bot = Invoke-TelegramRead 'getMe' @{}
    $pairingPhrase = 'pair-' + [Guid]::NewGuid().ToString('N')
    Write-Host "Open @$($bot.username) in Telegram, tap Start, then send this exact text:"
    Write-Host $pairingPhrase
    [void](Read-Host 'Press Enter after you send that text')
    $updates = @(Invoke-TelegramRead 'getUpdates' @{ timeout = 0; limit = 100 })
    $pairingMatches = @($updates | Where-Object {
        $_.message.chat.type -eq 'private' -and
        $_.message.text -ceq $pairingPhrase -and
        $_.message.from.id -eq $_.message.chat.id
    })
    $chatIds = @($pairingMatches | ForEach-Object { [string]$_.message.chat.id } | Select-Object -Unique)
    if ($chatIds.Count -ne 1) {
        throw 'Could not uniquely verify your private chat. Send the pairing text to this new bot and rerun setup. No updates were deleted.'
    }
    Write-Host 'Your private Telegram chat is verified.'
    $adminToken = New-AdminToken
    $webhookSecret = New-AdminToken
    $settings = @(
        'PUSH_PROVIDER=telegram'
        "TELEGRAM_BOT_TOKEN=$telegramToken"
        "TELEGRAM_CHAT_ID=$($chatIds[0])"
        "ADMIN_TOKEN=$adminToken"
        "TELEGRAM_WEBHOOK_SECRET=$webhookSecret"
        'FAILURE_ALERT_AFTER=5'
        'CHECK_LOG_RETENTION_DAYS=30'
    ) -join "`n"
    # CreateNew makes reruns non-destructive. Never overwrite existing secrets.
    $fileStream = [IO.File]::Open($settingsPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $settingsBytes = [Text.Encoding]::UTF8.GetBytes($settings + "`n")
        $fileStream.Write($settingsBytes, 0, $settingsBytes.Length)
    } finally { $fileStream.Dispose() }
    Write-Host 'Saved local environment settings in the ignored .dev.vars file. No keys were printed.'
    Write-Host 'Telegram delivery still needs testing. Tell Codex: notification credentials are ready.'
} finally {
    $telegramToken = $null
    $adminToken = $null
    $webhookSecret = $null
    $settings = $null
    $settingsBytes = $null
}
