[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$TestId)
$ErrorActionPreference = 'Stop'
# Explicit user-authorized real checkout-opening TEST ONLY. NEVER run unattended.
# Reuse this exact ID after an ambiguous result; never generate a new ID to retry.
$settingsPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.dev.vars'
$adminLine = [IO.File]::ReadAllLines($settingsPath) | Where-Object { $_ -match '^ADMIN_TOKEN=' } | Select-Object -First 1
if (-not $adminLine) { throw 'Local admin credential missing.' }
try {
    $result = Invoke-RestMethod -Method Post -Uri 'https://blizzard-forever-stock-monitor.teng3n.workers.dev/helper-checkout-test' -Headers @{
        Authorization = 'Bearer ' + $adminLine.Substring(12).Trim()
        'X-Checkout-Test-Confirm' = 'OPEN_ONE_COPY_NO_PAYMENT'
        'X-Checkout-Test-Id' = $TestId
    } -TimeoutSec 20 -MaximumRedirection 0
    $result | ConvertTo-Json -Depth 5
} catch {
    if ($_.Exception.Response) { Write-Output ('HTTP status: ' + [int]$_.Exception.Response.StatusCode) }
    Write-Output ('Test ID: ' + $TestId)
    throw 'Checkout simulation delivery not confirmed. Do not automatically retry or generate a new test ID. Raw details suppressed.'
} finally { $adminLine = $null }
