# Windows PowerShell 5.1 / PowerShell 7. Local-only, no pings or deployment.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

function Test-HealthchecksPingUrl([string]$Value) {
    # Accept only a base UUID Ping URL, never a dashboard URL, /fail, or /start.
    return $Value -cmatch '^https://hc-ping\.com/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/?$'
}

$settingsPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.dev.vars'
if (-not (Test-Path -LiteralPath $settingsPath)) { throw 'Complete Telegram setup first.' }
$existingSettings = [IO.File]::ReadAllText($settingsPath)
if ($existingSettings -match '(?m)^\s*HEALTHCHECKS_URL\s*=') {
    throw 'Healthchecks settings already exist. No values changed; tell Codex the Ping URL is saved.'
}
$existingSettings = $null
try {
    Write-Host 'Copy the check''s base Ping URL from Healthchecks (https://hc-ping.com/ followed by its UUID).'
    Write-Host 'Right-click to paste into the hidden prompt. Do not paste the URL into chat.'
    $protectedUrl = Read-Host 'Paste the Healthchecks Ping URL (hidden)' -AsSecureString
    $pingUrl = [System.Net.NetworkCredential]::new('', $protectedUrl).Password.Trim()
    if (-not (Test-HealthchecksPingUrl $pingUrl)) {
        throw 'Expected the complete https://hc-ping.com/ UUID Ping URL, without /start, /fail, or query parameters. Nothing was saved.'
    }
    $pingUrl = $pingUrl.TrimEnd('/')
    [IO.File]::AppendAllText($settingsPath, "`nHEALTHCHECKS_URL=$pingUrl`n", [Text.Encoding]::UTF8)
    Write-Host 'Saved the Ping URL in ignored local settings. No secret was printed or transmitted.'
    Write-Host 'Tell Codex: Healthchecks Ping URL saved. The hosted connection still needs activation and verification.'
} finally { $pingUrl = $null; $protectedUrl = $null }
