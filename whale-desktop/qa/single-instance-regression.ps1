param(
    [string]$Executable
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class WhaleSingleInstanceNative {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

$desktopRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($Executable)) {
    $Executable = Join-Path $desktopRoot 'src-tauri\target\debug\whale-harness-desktop.exe'
}
$exePath = [System.IO.Path]::GetFullPath($Executable)
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $desktopRoot 'src-tauri\target'))
$nodePath = [System.IO.Path]::GetFullPath((Join-Path (Split-Path $exePath -Parent) 'runtime\node\node.exe'))

if (-not $exePath.StartsWith($targetRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe single-instance QA executable outside target root: $exePath"
}
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Build the desktop executable before single-instance QA: $exePath"
}

$baselineIds = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq $exePath -or $_.ExecutablePath -eq $nodePath
} | ForEach-Object ProcessId)
if ($baselineIds.Count -ne 0) {
    throw 'Close the isolated desktop test instance before running single-instance QA.'
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("whale-single-instance-qa-" + [guid]::NewGuid().ToString('N'))
$savedDshHome = $env:DSH_HOME
$savedBackend = $env:WHALE_HARNESS_BACKEND
$savedWorkspace = $env:WHALE_HARNESS_WORKSPACE

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $env:DSH_HOME = $tempRoot
    $env:WHALE_HARNESS_BACKEND = 'windows'
    $env:WHALE_HARNESS_WORKSPACE = Split-Path $desktopRoot -Parent

    $first = Start-Process -FilePath $exePath -PassThru
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        $apps = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exePath })
        $nodes = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $nodePath })
        if ($apps.Count -eq 1 -and $nodes.Count -eq 1) { break }
        Start-Sleep -Milliseconds 250
    }
    if ($first.HasExited) {
        throw "First desktop instance exited early with code $($first.ExitCode)."
    }

    $first.Refresh()
    for ($attempt = 0; $attempt -lt 40 -and $first.MainWindowHandle -eq [IntPtr]::Zero; $attempt++) {
        Start-Sleep -Milliseconds 100
        $first.Refresh()
    }
    $mainWindow = $first.MainWindowHandle
    if ($mainWindow -eq [IntPtr]::Zero) {
        throw 'First desktop instance never exposed a main window handle.'
    }

    if (-not [WhaleSingleInstanceNative]::PostMessage($mainWindow, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
        throw 'Could not send WM_CLOSE to the first desktop window.'
    }
    for ($attempt = 0; $attempt -lt 40 -and [WhaleSingleInstanceNative]::IsWindowVisible($mainWindow); $attempt++) {
        Start-Sleep -Milliseconds 100
    }
    if ([WhaleSingleInstanceNative]::IsWindowVisible($mainWindow)) {
        throw 'Closing the main window did not hide it to the tray.'
    }

    $second = Start-Process -FilePath $exePath -PassThru
    $secondExited = $second.WaitForExit(5000)
    for ($attempt = 0; $attempt -lt 40 -and -not [WhaleSingleInstanceNative]::IsWindowVisible($mainWindow); $attempt++) {
        Start-Sleep -Milliseconds 100
    }
    $wokeExistingWindow = [WhaleSingleInstanceNative]::IsWindowVisible($mainWindow)

    $apps = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exePath })
    $nodes = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $nodePath })
    if (-not $secondExited -or -not $wokeExistingWindow -or $apps.Count -ne 1 -or $nodes.Count -ne 1) {
        $facts = "secondExited=$secondExited wokeExistingWindow=$wokeExistingWindow appCount=$($apps.Count) nodeCount=$($nodes.Count)"
        throw "Desktop single-instance regression failed: $facts"
    }
    if ($apps[0].ProcessId -ne $first.Id) {
        throw 'Second launch replaced the original desktop process instead of waking it.'
    }

    Write-Output "Desktop single-instance regression checks passed (pid $($first.Id))."
}
finally {
    $owned = @(Get-CimInstance Win32_Process | Where-Object {
        ($_.ExecutablePath -eq $exePath -or $_.ExecutablePath -eq $nodePath) -and $_.ProcessId -notin $baselineIds
    })
    $owned | Sort-Object { if ($_.ExecutablePath -eq $exePath) { 0 } else { 1 } } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

    $env:DSH_HOME = $savedDshHome
    $env:WHALE_HARNESS_BACKEND = $savedBackend
    $env:WHALE_HARNESS_WORKSPACE = $savedWorkspace

    $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
    $tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolvedTemp.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Split-Path $resolvedTemp -Leaf).StartsWith('whale-single-instance-qa-', [System.StringComparison]::Ordinal)) {
        throw "Unsafe single-instance QA cleanup target: $resolvedTemp"
    }
    if (Test-Path -LiteralPath $resolvedTemp) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
