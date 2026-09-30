param(
    [switch]$Apply,
    [switch]$Restore,
    [switch]$RefreshCache,
    [string]$ShortcutPath,
    [string]$IconPath,
    [string]$BackupPath
)

$ErrorActionPreference = 'Stop'
if ($Apply -and $Restore) {
    throw 'Choose either -Apply or -Restore.'
}

$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$brandingDir = Join-Path $env:LOCALAPPDATA 'Whale Appearance'
if (-not $ShortcutPath) {
    $ShortcutPath = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\DeepSeek Harness.lnk'
    if (-not (Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) {
        $ShortcutPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk'
    }
}
if (-not $IconPath) {
    $IconPath = Join-Path $brandingDir 'DeepSeek-Harness.ico'
}
if (-not $BackupPath) {
    $backupName = if ($ShortcutPath -like '*\Start Menu\*') { 'DeepSeek Harness.original-start-menu.lnk' } else { 'DeepSeek Harness.original-pinned.lnk' }
    $BackupPath = Join-Path $brandingDir $backupName
}

$shortcutPath = [System.IO.Path]::GetFullPath($ShortcutPath)
$iconPath = [System.IO.Path]::GetFullPath($IconPath)
$backupPath = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
    throw "Official Desktop shortcut not found: $shortcutPath"
}
if (-not (Test-Path -LiteralPath $iconPath -PathType Leaf)) {
    $sourceIcon = Join-Path $workspaceRoot 'DeepSeek-Harness.ico'
    if (-not $Apply -or -not (Test-Path -LiteralPath $sourceIcon -PathType Leaf)) {
        throw "Whale icon not found: $iconPath"
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $iconPath) -Force | Out-Null
    Copy-Item -LiteralPath $sourceIcon -Destination $iconPath
}

$installed = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like 'DeepSeek Harness*' -and $_.InstallLocation } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.InstallLocation 'DeepSeek Harness.exe') -PathType Leaf } |
    Select-Object -First 1
if (-not $installed) {
    throw 'The official DeepSeek Harness installation was not found.'
}
$expectedExe = [System.IO.Path]::GetFullPath((Join-Path $installed.InstallLocation 'DeepSeek Harness.exe'))
$wsh = New-Object -ComObject WScript.Shell
$shell = New-Object -ComObject Shell.Application

function Read-Shortcut {
    param([string]$Path)
    $link = $wsh.CreateShortcut($Path)
    $folder = $shell.Namespace((Split-Path -Parent $Path))
    $item = $folder.ParseName((Split-Path -Leaf $Path))
    [pscustomobject]@{
        Target = [System.IO.Path]::GetFullPath($link.TargetPath)
        Icon = $link.IconLocation
        AppUserModelId = $item.ExtendedProperty('System.AppUserModel.ID')
    }
}

$before = Read-Shortcut $shortcutPath
if (-not [string]::Equals($before.Target, $expectedExe, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Shortcut points somewhere else: $($before.Target)"
}
if ($before.AppUserModelId -ne 'com.deepseek.dsh') {
    throw "Unexpected AppUserModelID: $($before.AppUserModelId)"
}

if ($Restore) {
    if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
        throw "Shortcut backup not found: $backupPath"
    }
    $saved = Read-Shortcut $backupPath
    if ($saved.Target -ne $expectedExe -or $saved.AppUserModelId -ne 'com.deepseek.dsh') {
        throw 'Shortcut backup does not match the official application.'
    }
    Copy-Item -LiteralPath $backupPath -Destination $shortcutPath -Force
} elseif ($Apply) {
    $desiredIcon = "$iconPath,0"
    if ([string]::Equals($before.Icon, $desiredIcon, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Output 'The official Desktop shortcut already uses the Whale icon.'
    } else {
        if (Test-Path -LiteralPath $backupPath) {
            $saved = Read-Shortcut $backupPath
            if ($saved.Target -ne $expectedExe -or $saved.AppUserModelId -ne 'com.deepseek.dsh') {
                throw "Existing shortcut backup does not match the official application: $backupPath"
            }
        } else {
            $originalIcon = "$expectedExe,0"
            if (-not [string]::Equals($before.Icon, $originalIcon, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Original shortcut backup is missing; restore it to -BackupPath before applying: $backupPath"
            }
            New-Item -ItemType Directory -Path (Split-Path -Parent $backupPath) -Force | Out-Null
            Copy-Item -LiteralPath $shortcutPath -Destination $backupPath
        }
        $link = $wsh.CreateShortcut($shortcutPath)
        $link.IconLocation = $desiredIcon
        $link.Save()
        $after = Read-Shortcut $shortcutPath
        if ($after.Target -ne $expectedExe -or $after.AppUserModelId -ne 'com.deepseek.dsh' -or
            -not [string]::Equals($after.Icon, $desiredIcon, [System.StringComparison]::OrdinalIgnoreCase)) {
            Copy-Item -LiteralPath $backupPath -Destination $shortcutPath -Force
            throw 'Shortcut validation failed; the backup was restored.'
        }
    }
}

if ($RefreshCache) {
    & ie4uinit.exe -show
}
$result = Read-Shortcut $shortcutPath
[pscustomobject]@{
    Shortcut = $shortcutPath
    Target = $result.Target
    Icon = $result.Icon
    AppUserModelId = $result.AppUserModelId
    Backup = if ($Apply) { $backupPath } else { $null }
}
