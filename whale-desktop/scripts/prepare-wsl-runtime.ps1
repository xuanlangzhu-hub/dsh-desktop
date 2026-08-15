param(
    [string]$Distro = ""
)

$ErrorActionPreference = 'Stop'
$env:WSL_UTF8 = '1'

# Windows entry point for the WSL2 backend preparation. It only validates WSL
# and forwards the work to scripts/wsl/prepare-runtime.sh, which runs entirely
# inside the Linux user's home directory.
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
if ($workspaceRoot -notmatch '^[A-Za-z]:') {
    throw "Unsupported workspace path for WSL translation: $workspaceRoot"
}

function ConvertTo-WslPath {
    param([Parameter(Mandatory = $true)][string]$WindowsPath)
    $full = [System.IO.Path]::GetFullPath($WindowsPath)
    $drive = $full.Substring(0, 1).ToLowerInvariant()
    $rest = $full.Substring(2).Replace('\', '/')
    return "/mnt/$drive$rest"
}

$wslScript = (ConvertTo-WslPath $workspaceRoot) + '/whale-desktop/scripts/wsl/prepare-runtime.sh'

$wsl = Get-Command wsl.exe -ErrorAction Stop

# Validate WSL2 and the requested distribution (read-only checks).
$distroList = & $wsl.Source --list --verbose 2>$null
if ($LASTEXITCODE -ne 0 -or -not $distroList) {
    throw 'WSL is not available. Install WSL2 first; the Windows backend stays unaffected.'
}
$entries = @($distroList | ForEach-Object {
    $line = $_.ToString()
    if ($line -match '^\s*\*?\s*(\S+)\s+(Running|Stopped|Installing|Uninstalling)\s+(\d+)') {
        [PSCustomObject]@{
            Name = $Matches[1]
            State = $Matches[2]
            Version = [int]$Matches[3]
            IsDefault = $line.TrimStart().StartsWith('*')
        }
    }
})
if (-not $entries) {
    throw 'Could not parse `wsl --list --verbose` output.'
}
if ($Distro) {
    $target = $entries | Where-Object Name -eq $Distro | Select-Object -First 1
    if (-not $target) {
        $available = ($entries.Name -join ', ')
        throw "WSL distribution '$Distro' was not found. Available: $available"
    }
    if ($target.Version -ne 2) {
        throw "WSL distribution '$Distro' is WSL$($target.Version), but the experimental backend requires WSL2."
    }
    $distroArgs = @('-d', $Distro)
}
else {
    $target = $entries | Where-Object IsDefault | Select-Object -First 1
    if (-not $target) {
        throw 'No default WSL distribution found.'
    }
    if ($target.Version -ne 2) {
        throw "Default WSL distribution '$($target.Name)' is WSL$($target.Version), but the experimental backend requires WSL2."
    }
    $distroArgs = @()
    $Distro = $target.Name
}

$sourceDshHome = ConvertTo-WslPath (Join-Path $env:USERPROFILE '.dsh')
$sourceProfile = "$sourceDshHome/profiles/whale-desktop"
$sourcePreset = "$sourceDshHome/.agent-presets/anchored-standard"

Write-Host "Preparing WSL2 backend on '$Distro'..."
Write-Host "  source profile : $sourceProfile"
Write-Host "  runtime        : ~/.local/share/whale-harness/runtime"
Write-Host "  WSL profile    : ~/.dsh/profiles/whale-desktop-wsl"

$innerCommand = "WHALE_WSL_SOURCE_DSH_HOME='$sourceDshHome' WHALE_WSL_SOURCE_PROFILE='$sourceProfile' WHALE_WSL_SOURCE_PRESET='$sourcePreset' bash $wslScript"
& $wsl.Source @distroArgs -- bash -lc $innerCommand
if ($LASTEXITCODE -ne 0) {
    throw "WSL runtime preparation failed with exit code $LASTEXITCODE (no Windows files were modified)."
}

$verifyCommand = "test -x `$HOME/.local/share/whale-harness/runtime/bin/start-web.sh -a -x `$HOME/.local/share/whale-harness/runtime/bin/stop-web.sh -a -x `$HOME/.local/share/whale-harness/runtime/node/bin/node -a -f `$HOME/.dsh/profiles/whale-desktop-wsl/package.json && echo VERIFY-OK"
$verification = & $wsl.Source @distroArgs -- bash -lc $verifyCommand
if ($LASTEXITCODE -ne 0 -or "$verification" -notmatch 'VERIFY-OK') {
    throw 'WSL runtime verification failed after preparation.'
}

Write-Host "WSL2 backend prepared successfully on '$Distro'."
Write-Host 'Start it later with: 启动 Whale Harness Desktop (WSL).cmd'
