$ErrorActionPreference = 'Stop'
$parseTokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot 'Prepare-Healthchecks.ps1'), [ref]$parseTokens, [ref]$parseErrors
)
if ($parseErrors.Count) { throw 'Healthchecks helper syntax failed.' }
$validator = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Test-HealthchecksPingUrl'
}, $true)
if (-not $validator) { throw 'Validator missing.' }
# Load only the validation function; no prompts, file writes, or network access.
. ([scriptblock]::Create($validator.Extent.Text))
$dummyUrl = 'https://hc-ping.com/00000000-0000-0000-0000-000000000000'
foreach ($value in @($dummyUrl, ($dummyUrl + '/'))) {
    if (-not (Test-HealthchecksPingUrl $value)) { throw 'Valid base URL was rejected.' }
}
foreach ($value in @('http://hc-ping.com/00000000-0000-0000-0000-000000000000',
    'https://healthchecks.io/checks/', ($dummyUrl + '/fail'), ($dummyUrl + '/start'),
    ($dummyUrl + '?test=1'), $dummyUrl.Replace('hc-ping.com', 'hc-ping.com.example.com'),
    $dummyUrl.Replace('hc-ping.com', 'user:password@hc-ping.com'), 'not-a-url')) {
    if (Test-HealthchecksPingUrl $value) { throw 'An unsafe or non-base URL was accepted.' }
}
Write-Output 'Healthchecks helper syntax and 10 URL validation cases passed. No secrets or network used.'
