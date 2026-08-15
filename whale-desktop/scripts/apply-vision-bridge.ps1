param([string]$ModulesRoot)

$ErrorActionPreference = 'Stop'

# Windows-compatible entry point. The patch itself lives in the cross-platform
# Node implementation next to this file, so the same logic serves the Windows
# `prepare-runtime.ps1` pipeline and the WSL2 runtime preparation.
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$patchScript = Join-Path $PSScriptRoot 'apply-vision-bridge.mjs'

if ([string]::IsNullOrWhiteSpace($ModulesRoot)) {
    $ModulesRoot = Join-Path $projectRoot 'runtime\dsh\node_modules'
}
$ModulesRoot = [System.IO.Path]::GetFullPath($ModulesRoot)

$nodeCandidates = @(
    (Join-Path $projectRoot 'runtime\node\node.exe'),
    (Get-Command node.exe -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if (-not $nodeCandidates) {
    throw 'vision-bridge v2: no Node.js binary found; run prepare-runtime.ps1 first or put node.exe on PATH'
}
$nodeExe = @($nodeCandidates)[0]

& $nodeExe $patchScript --modules-root $ModulesRoot
if ($LASTEXITCODE -ne 0) {
    throw "vision-bridge v2 failed with exit code $LASTEXITCODE"
}
