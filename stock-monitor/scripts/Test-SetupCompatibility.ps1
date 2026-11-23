# Offline compatibility test: no real keys, network requests, settings writes, or deployment.
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'Prepare-Notifications.ps1'
$parseTokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath, [ref]$parseTokens, [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) { throw 'Setup script syntax is not compatible.' }
$tokenFunction = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'New-AdminToken'
}, $true)
if ($null -eq $tokenFunction) { throw 'Token generator not found.' }
# Run only the isolated generator, never the interactive setup script.
$generateToken = $tokenFunction.Body.GetScriptBlock()
$firstToken = & $generateToken
$secondToken = & $generateToken
if ($firstToken -cnotmatch '^[0-9A-F]{64}$' -or $secondToken -cnotmatch '^[0-9A-F]{64}$') {
    throw 'Expected a 32-byte hexadecimal token.'
}
if ($firstToken -ceq $secondToken) { throw 'Generated tokens unexpectedly matched.' }
$dummySecret = ConvertTo-SecureString 'offline-test-only' -AsPlainText -Force
if ([System.Net.NetworkCredential]::new('', $dummySecret).Password -ne 'offline-test-only') {
    throw 'Private input conversion failed.'
}
$firstToken = $null
$secondToken = $null
Write-Output "Setup syntax, secure token generation, and private input conversion passed on PowerShell $($PSVersionTable.PSVersion)."
