param(
    [string]$WslDistro = "Ubuntu2",
    [string]$WslWorkspace = "/home/hp/projects/deepseekharness"
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# cmd.exe cannot use a UNC path as its working directory. In particular, a
# shortcut generated through \\wsl.localhost would make Windows enter WSL to
# read a batch file which then starts a Windows app that enters WSL again. That
# round-trip can stall Explorer and create a burst of console/WSL processes.
# Keep every Windows launcher and shortcut on a local Windows drive; the WSL
# project path is passed separately through WHALE_WSL_WORKSPACE by the launcher.
if ($workspace.StartsWith('\\')) {
    throw "Refusing to create Windows shortcuts from a UNC/WSL path: $workspace. Run this script from the Windows checkout (for example F:\deepseekharness)."
}

$icon = Join-Path $workspace "DeepSeek-Harness.ico"
$desktopExe = Join-Path $workspace "release\Whale Harness Desktop Portable\Whale Harness Desktop.exe"
$shell = New-Object -ComObject WScript.Shell
$wslLaunchers = @(Get-ChildItem -LiteralPath $workspace -File -Filter "*Whale Harness Desktop (WSL).cmd")
$windowsLaunchers = @(Get-ChildItem -LiteralPath $workspace -File -Filter "*Whale Harness Desktop.cmd")

if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) {
    throw "Shortcut icon was not found: $icon"
}

if ($wslLaunchers.Count -ne 1) {
    throw "Expected one WSL desktop launcher, found $($wslLaunchers.Count)."
}

if ($windowsLaunchers.Count -ne 1) {
    throw "Expected one Windows desktop launcher, found $($windowsLaunchers.Count)."
}

function New-WhaleDesktopShortcut {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (-not (Test-Path -LiteralPath $desktopExe -PathType Leaf)) {
        throw "Whale Desktop executable was not found: $desktopExe"
    }

    $shortcutPath = Join-Path $workspace "$Name.lnk"
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $desktopExe
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $workspace
    $shortcut.IconLocation = "$icon,0"
    $shortcut.Description = $Description
    $shortcut.WindowStyle = 1
    $shortcut.Save()

    Write-Host "Created $shortcutPath"
}

New-WhaleDesktopShortcut -Name "Whale Harness Desktop" -Arguments "--backend=wsl --wsl-distro=$WslDistro --wsl-workspace=$WslWorkspace" -Description "Whale Harness Desktop - WSL2 backend"
New-WhaleDesktopShortcut -Name "Whale Harness Desktop (Windows)" -Arguments "--backend=windows" -Description "Whale Harness Desktop - Windows backend fallback"
