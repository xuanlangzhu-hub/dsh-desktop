$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot 'runtime'
$nodeRoot = Join-Path $runtimeRoot 'node'
$dshRoot = Join-Path $runtimeRoot 'dsh'
$expectedNodeVersion = (Get-Content -LiteralPath (Join-Path $nodeRoot 'VERSION') -Raw).Trim()

if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'Whale Harness Desktop currently supports Windows x64 only.'
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$actualNodeVersion = (& $nodeCommand.Source --version).Trim()
if ($actualNodeVersion -ne $expectedNodeVersion) {
    throw "Node version mismatch: expected $expectedNodeVersion, found $actualNodeVersion"
}

New-Item -ItemType Directory -Path $nodeRoot -Force | Out-Null
Copy-Item -LiteralPath $nodeCommand.Source -Destination (Join-Path $nodeRoot 'node.exe') -Force

Push-Location $dshRoot
try {
    npm ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$modulesRoot = [System.IO.Path]::GetFullPath((Join-Path $dshRoot 'node_modules'))
$pruneTargets = @(
    'node-pty\prebuilds\darwin-arm64',
    'node-pty\prebuilds\darwin-x64',
    'node-pty\prebuilds\win32-arm64',
    'node-pty\third_party\conpty\1.23.251008001\win10-arm64'
) | ForEach-Object { [System.IO.Path]::GetFullPath((Join-Path $modulesRoot $_)) }

foreach ($target in $pruneTargets) {
    if (-not $target.StartsWith($modulesRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe prune target: $target"
    }
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

$dshManifest = Join-Path $modulesRoot '@deepseek-ai\dsh\package.json'
$dshVersion = (Get-Content -LiteralPath $dshManifest -Raw | ConvertFrom-Json).version
$size = (Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | Measure-Object Length -Sum).Sum

[pscustomobject]@{
    Node = $actualNodeVersion
    Dsh = $dshVersion
    RuntimeMB = [math]::Round($size / 1MB, 2)
}
