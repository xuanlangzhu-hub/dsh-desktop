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
    # npm 11.16 can stall while resolving the prerelease plugin peer graph; pin npm 10 for a complete, reproducible install.
    npx --yes npm@10.9.4 ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$modulesRoot = [System.IO.Path]::GetFullPath((Join-Path $dshRoot 'node_modules'))
$dshManifest = Join-Path $modulesRoot '@deepseek-ai\dsh\package.json'
$dshVersion = (Get-Content -LiteralPath $dshManifest -Raw | ConvertFrom-Json).version

switch ($dshVersion) {
    { $_ -in @('0.1.0-rc.6', '0.1.1-rc.1') } {
        $visionBridgeScript = Join-Path $PSScriptRoot 'apply-vision-bridge.ps1'
        & $visionBridgeScript -ModulesRoot $modulesRoot

        $visionBridgeTargets = Get-ChildItem -LiteralPath $modulesRoot -Recurse -File -Filter 'index.js' | Where-Object {
            $_.FullName -match '@deepseek-ai[\\/](dsh-host-apiproxy|dsh-llm-deepseek)[\\/]lib[\\/]index\.js$'
        }
        if (@($visionBridgeTargets).Count -lt 2) {
            throw "vision-bridge v2 syntax-check targets missing under $modulesRoot"
        }
        foreach ($target in $visionBridgeTargets) {
            & (Join-Path $nodeRoot 'node.exe') --check $target.FullName
            if ($LASTEXITCODE -ne 0) {
                throw "vision-bridge v2 produced invalid JavaScript: $($target.FullName)"
            }
        }
    }
    { $_ -in @('0.1.1-rc.2', '0.1.5-rc.1') } {
        Write-Output "Using the official Vision/Files pipeline in DSH $dshVersion."
    }
    default {
        throw "Unsupported DSH version $dshVersion; review image compatibility before preparing the runtime."
    }
}

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

$size = (Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | Measure-Object Length -Sum).Sum

[pscustomobject]@{
    Node = $actualNodeVersion
    Dsh = $dshVersion
    RuntimeMB = [math]::Round($size / 1MB, 2)
}
