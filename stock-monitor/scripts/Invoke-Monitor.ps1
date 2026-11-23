[CmdletBinding()]
param(
    [ValidateSet('health','logs','check','probe','pause','resume','test-notifications','test-reminders','test-reminders-state','reminders-state','retry-notifications','checker-state')]
    [string]$Action = 'health'
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 6) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}
$settingsPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.dev.vars'
$adminLine = [IO.File]::ReadAllLines($settingsPath) | Where-Object { $_ -match '^ADMIN_TOKEN=' } | Select-Object -First 1
if (-not $adminLine) { throw 'Local admin credential missing.' }
$adminValue = $adminLine.Substring('ADMIN_TOKEN='.Length).Trim()
$method = if ($Action -in @('health','logs','reminders-state','test-reminders-state','checker-state')) { 'Get' } else { 'Post' }
try {
    $result = Invoke-RestMethod -Method $method -Uri "https://blizzard-forever-stock-monitor.teng3n.workers.dev/$Action" `
        -Headers @{ Authorization = "Bearer $adminValue" } -TimeoutSec 90 -MaximumRedirection 0
    $result | ConvertTo-Json -Depth 12
} catch {
    if ($_.Exception.Response) { Write-Output ('HTTP status: ' + [int]$_.Exception.Response.StatusCode) }
    throw 'Monitor request failed; raw output suppressed to protect credentials. Inspect host logs before retrying a test.'
} finally { $adminLine = $null; $adminValue = $null }
