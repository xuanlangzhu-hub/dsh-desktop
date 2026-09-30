$ErrorActionPreference = 'Stop'
$themeRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
    throw 'The Windows .NET Framework C# compiler is required to build the icon helper.'
}
$assetDirectory = Join-Path $themeRoot 'assets'
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null
$source = Join-Path $themeRoot 'src\windows\WhaleDesktopIcon.cs'
$output = Join-Path $assetDirectory 'whale-icon-helper.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /r:System.Drawing.dll /r:System.Windows.Forms.dll "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw 'Icon helper compilation failed.' }
Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $themeRoot) 'DeepSeek-Harness.ico') -Destination (Join-Path $assetDirectory 'DeepSeek-Harness.ico') -Force
& $output --self-test (Join-Path $assetDirectory 'DeepSeek-Harness.ico')
if ($LASTEXITCODE -ne 0) { throw 'Icon helper regression check failed.' }
