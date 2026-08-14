$ErrorActionPreference = 'Stop'

$patchScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\scripts\apply-vision-bridge.ps1'))
if (-not (Test-Path -LiteralPath $patchScript -PathType Leaf)) {
    throw "Patch script not found: $patchScript"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("whale-vision-bridge-qa-" + [guid]::NewGuid().ToString('N'))
$utf8 = [System.Text.UTF8Encoding]::new($false)

$apiProxyFixture = @'
function exerciseApiProxy() {
	if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) return err(request, {
		code: "attachment-error",
		message: `Model "${current.model}" does not support image input.`,
		details: { reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" }
	});
	if ([...found.agent.inbox.nextTurn, ...found.agent.inbox.nextStep].some((message) => contentHasImage(message.content)) || messagesHaveImage(found.agent.session.deriveMessages())) {
		const info = await ctx.llm.resolveModelInfo(resolved.provider, resolved.model);
		if (info.inputModalities !== void 0 && !info.inputModalities.includes("image")) return err(request, {
			code: "model-unavailable",
			message: `Model "${resolved.model}" does not accept image input, but this session already contains images; select an image-capable model.`,
			details: { provider, model }
		});
	}
}
'@

$deepSeekFixture = @'
function contentHasImage(blocks) {
	return blocks.some((block) => block.type === "image");
}
function flattenText(blocks) {
	return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function assertTextOnly(blocks) {
	if (contentHasImage(blocks)) throw new LlmError("The DeepSeek chat-completions adapter does not support image content.", "UNSUPPORTED_CONTENT");
}
function serializeAssistant(message) {
	return { role: "assistant", content: flattenText(message.content) };
}
function serializeMessages(messages) {
	const wire = [];
	for (const message of messages) {
		assertTextOnly(message.content);
		if (message.role === "system") {
			wire.push({
				role: "system",
				content: flattenText(message.content)
			});
			continue;
		}
		if (message.role === "assistant") {
			wire.push(serializeAssistant(message));
			continue;
		}
		const toolResults = message.content.filter((block) => block.type === "tool-result");
		const text = flattenText(message.content);
		wire.push({ role: "user", content: text, toolResults });
	}
	return wire;
}
'@

function Write-Fixture([string]$modulesRoot, [string]$apiProxyContent = $apiProxyFixture) {
    $apiProxyPath = Join-Path $modulesRoot '@deepseek-ai\dsh-host-apiproxy\lib\index.js'
    $deepSeekPath = Join-Path $modulesRoot '@deepseek-ai\dsh-llm-deepseek\lib\index.js'
    New-Item -ItemType Directory -Path (Split-Path $apiProxyPath) -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path $deepSeekPath) -Force | Out-Null
    [System.IO.File]::WriteAllText($apiProxyPath, $apiProxyContent.Replace("`r`n", "`n"), $utf8)
    [System.IO.File]::WriteAllText($deepSeekPath, $deepSeekFixture.Replace("`r`n", "`n"), $utf8)
    return @($apiProxyPath, $deepSeekPath)
}

function Get-Sha256Hex([string]$path) {
    $stream = [System.IO.File]::OpenRead($path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
    }
    finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

try {
    $modulesRoot = Join-Path $tempRoot 'valid\node_modules'
    $files = @(Write-Fixture $modulesRoot)
    $nestedModulesRoot = Join-Path $modulesRoot 'fixture-parent\node_modules'
    $files += @(Write-Fixture $nestedModulesRoot)

    & $patchScript -ModulesRoot $modulesRoot | Out-Host
    foreach ($file in $files) {
        $content = Get-Content -LiteralPath $file -Raw
        if (-not $content.Contains('[vision-bridge-v2]')) {
            throw "Patched marker missing: $file"
        }
        & node.exe --check $file
        if ($LASTEXITCODE -ne 0) {
            throw "node --check failed: $file"
        }
    }

    $firstHashes = $files | ForEach-Object { Get-Sha256Hex $_ }
    & $patchScript -ModulesRoot $modulesRoot | Out-Host
    $secondHashes = $files | ForEach-Object { Get-Sha256Hex $_ }
    if ((Compare-Object $firstHashes $secondHashes).Count -ne 0) {
        throw 'The second patch run changed already-patched files.'
    }

    $driftRoot = Join-Path $tempRoot 'drift\node_modules'
    $driftedApiProxy = $apiProxyFixture.Replace('MODEL_DOES_NOT_SUPPORT_IMAGES', 'UPSTREAM_MARKER_CHANGED')
    $driftFiles = Write-Fixture $driftRoot $driftedApiProxy
    $beforeFailure = $driftFiles | ForEach-Object { Get-Sha256Hex $_ }
    $failedAsExpected = $false
    try {
        & $patchScript -ModulesRoot $driftRoot | Out-Host
    }
    catch {
        $failedAsExpected = $true
    }
    if (-not $failedAsExpected) {
        throw 'A drifted upstream marker did not fail the patch.'
    }
    $afterFailure = $driftFiles | ForEach-Object { Get-Sha256Hex $_ }
    if ((Compare-Object $beforeFailure $afterFailure).Count -ne 0) {
        throw 'Patch failure left a partially modified runtime.'
    }

    Write-Output 'vision-bridge v2 regression checks passed.'
}
finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
    $safeTempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($safeTempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
