$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot 'release'))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $releaseRoot 'Whale Harness Desktop Portable'))
$expectedPrefix = $workspaceRoot + [System.IO.Path]::DirectorySeparatorChar

if (-not $outputRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe portable output path: $outputRoot"
}

$releaseExe = Join-Path $projectRoot 'src-tauri\target\release\whale-harness-desktop.exe'
$runtimeSource = Join-Path $projectRoot 'runtime'
$themeSource = Join-Path $workspaceRoot 'dsh-whale-mist'

if (-not (Test-Path -LiteralPath $releaseExe -PathType Leaf)) {
    throw "Release executable not found: $releaseExe"
}
if (-not (Test-Path -LiteralPath (Join-Path $runtimeSource 'node\node.exe') -PathType Leaf)) {
    throw "Bundled Node runtime is incomplete: $runtimeSource"
}
if (-not (Test-Path -LiteralPath (Join-Path $themeSource 'src\client.js') -PathType Leaf)) {
    throw "Whale Mist source is incomplete: $themeSource"
}

if (Test-Path -LiteralPath $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot | Out-Null

Copy-Item -LiteralPath $releaseExe -Destination (Join-Path $outputRoot 'Whale Harness Desktop.exe')
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'DeepSeek-Harness.ico') -Destination $outputRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $outputRoot

& robocopy.exe $runtimeSource (Join-Path $outputRoot 'runtime') /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /MT:16 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
    throw "Failed to copy the bundled runtime (robocopy exit $LASTEXITCODE)"
}

$themeTarget = Join-Path $outputRoot 'runtime\theme\dsh-whale-mist'
New-Item -ItemType Directory -Path $themeTarget -Force | Out-Null
& robocopy.exe $themeSource $themeTarget /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /MT:8 /XD qa /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
    throw "Failed to copy Whale Mist (robocopy exit $LASTEXITCODE)"
}

$tauriConfig = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$installerName = '{0}_{1}_x64-setup.exe' -f $tauriConfig.productName, $tauriConfig.version
$installerSource = Join-Path $projectRoot (Join-Path 'src-tauri\target\release\bundle\nsis' $installerName)
$installerOutputName = 'Whale Harness Desktop ' + ([char]0x5B89) + ([char]0x88C5) + ([char]0x5305) + '.exe'
if (Test-Path -LiteralPath $installerSource -PathType Leaf) {
    Copy-Item -LiteralPath $installerSource -Destination (Join-Path $releaseRoot $installerOutputName) -Force
}

$size = (Get-ChildItem -LiteralPath $outputRoot -Recurse -File | Measure-Object Length -Sum).Sum
[pscustomobject]@{
    Output = $outputRoot
    SizeMB = [math]::Round($size / 1MB, 2)
    Executable = Join-Path $outputRoot 'Whale Harness Desktop.exe'
}
