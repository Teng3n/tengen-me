$ErrorActionPreference = 'Stop'
$extensionRoot = $PSScriptRoot
$artifactRoot = Join-Path (Split-Path $extensionRoot -Parent) 'dist'
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$version = (Get-Content -Raw -LiteralPath (Join-Path $extensionRoot 'manifest.json') | ConvertFrom-Json).version
$archivePath = Join-Path $artifactRoot "firefox-queue-helper-$version.zip"
if (Test-Path -LiteralPath $archivePath) { throw 'Archive already exists. Use a new version/name instead of overwriting.' }
$files = @('manifest.json','policy.js','direct-policy.js','direct-background.js','control.html','control.css','control.js','test.html','README.md') | ForEach-Object { Join-Path $extensionRoot $_ }
Compress-Archive -LiteralPath $files -DestinationPath $archivePath
Write-Output $archivePath
