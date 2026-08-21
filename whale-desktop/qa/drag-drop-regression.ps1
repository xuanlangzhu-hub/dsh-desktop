$ErrorActionPreference = 'Stop'

$desktopRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$configPath = Join-Path $desktopRoot 'src-tauri\tauri.conf.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$mainWindow = @($config.app.windows) | Where-Object { $_.label -eq 'main' } | Select-Object -First 1

if ($null -eq $mainWindow) {
    throw 'Tauri main window is missing.'
}

if ($mainWindow.dragDropEnabled -ne $false) {
    throw @'
Windows HTML5 image drag-and-drop is disabled: app.windows[main].dragDropEnabled must be false.
Tauri intercepts native file drops when this option is omitted or true, so the official Harness
ComposerAttachments document-level dragenter/dragover/drop listeners never receive the files.
'@
}

Write-Output 'Desktop drag-drop configuration regression checks passed.'
