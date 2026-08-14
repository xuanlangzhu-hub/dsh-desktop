$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$icon = Join-Path $workspace "DeepSeek-Harness.ico"
$shell = New-Object -ComObject WScript.Shell

function New-WhaleShortcut {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Launcher
    )

    $shortcut = $shell.CreateShortcut((Join-Path $workspace "$Name.lnk"))
    $shortcut.TargetPath = $env:ComSpec
    $shortcut.Arguments = "/d /c `"`"$Launcher`"`""
    $shortcut.WorkingDirectory = $workspace
    $shortcut.IconLocation = "$icon,0"
    $shortcut.Description = $Name
    $shortcut.WindowStyle = 1
    $shortcut.Save()
}

New-WhaleShortcut `
    -Name "DeepSeek Harness TUI" `
    -Launcher (Join-Path $workspace "启动 DeepSeek Harness TUI.cmd")

New-WhaleShortcut `
    -Name "DeepSeek Harness TUI - 继续上次" `
    -Launcher (Join-Path $workspace "继续上次 DeepSeek Harness TUI.cmd")

Write-Host "Whale TUI shortcuts created."
