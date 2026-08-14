param([string]$ModulesRoot)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ModulesRoot)) {
    $projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $ModulesRoot = Join-Path $projectRoot 'runtime\dsh\node_modules'
}
$ModulesRoot = [System.IO.Path]::GetFullPath($ModulesRoot)
if (-not (Test-Path -LiteralPath $ModulesRoot -PathType Container)) {
    throw "node_modules root not found: $ModulesRoot"
}

$v2Marker = '[vision-bridge-v2]'
$utf8 = [System.Text.UTF8Encoding]::new($false)

$promptGateMarker = '[vision-bridge-v2] image admission relaxed'
$promptGateReplacement = '// [vision-bridge-v2] image admission relaxed: image blocks flow into the session for client previews; the deepseek adapter bridges them to text notes at serialization time.'
$promptGatePattern = 'if \(modelInfo\.inputModalities !== void 0 && !modelInfo\.inputModalities\.includes\("image"\)\) return err\(request, \{[\s\S]*?details: \{ reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" \}\s*\}\);'

$selectGateMarker = '[vision-bridge-v2] relaxed model-switch guard'
$selectGateReplacement = '// [vision-bridge-v2] relaxed model-switch guard: sessions may keep image blocks; the deepseek adapter bridges them to text notes.'
$selectGatePattern = 'if \(\[\.\.\.found\.agent\.inbox\.nextTurn[\s\S]*?select an image-capable model\.`[\s\S]*?\);\r?\n\s*\}'

$adapterFunctionMarker = '[vision-bridge-v2] Bridge image blocks'
$adapterFunctionReplacement = @'
/** [vision-bridge-v2] Bridge image blocks into text references (this wire route is text-only). */
function bridgeImageBlocks(blocks) {
	if (!contentHasImage(blocks)) return blocks;
	const home = process.env.DSH_HOME ?? (process.env.USERPROFILE ?? process.env.HOME ?? "") + "/.dsh";
	return blocks.map((block) => {
		if (block.type !== "image") return block;
		const ref = block.attachment ?? {};
		const id = typeof ref.attachmentId === "string" ? ref.attachmentId : "unknown";
		const sha = id.startsWith("sha256:") ? id.slice(7) : "";
		const file = sha.length === 64 ? `${home}/attachments/v1/objects/${sha.slice(0, 2)}/${sha}` : "";
		const name = typeof ref.name === "string" && ref.name !== "" ? ref.name : "";
		let note = `[\u7528\u6237\u53d1\u9001\u4e86\u4e00\u5f20\u56fe\u7247\uff08attachmentId: ${id}`;
		if (name !== "") note += `\uff0c\u6587\u4ef6\u540d: ${name}`;
		if (file !== "") note += `\uff0c\u672c\u5730\u6587\u4ef6: ${file}`;
		note += "\uff09\u3002\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u76f4\u63a5\u67e5\u770b\u56fe\u7247\uff0c\u5982\u9700\u770b\u56fe\u8bf7\u4f7f\u7528 claude-vision-skill\uff08vision.js\uff09\u8bc6\u56fe\u540e\u518d\u56de\u590d\u3002]";
		return { type: "text", text: note };
	});
}
'@
$adapterFunctionPattern = 'function assertTextOnly\(blocks\) \{\s*if \(contentHasImage\(blocks\)\) throw new LlmError\("The DeepSeek chat-completions adapter does not support image content\."\s*,\s*"UNSUPPORTED_CONTENT"\);\s*\}'

$adapterLoopMarker = '[vision-bridge-v2] serialize image blocks through text bridge'
$adapterLoopReplacement = @'
	for (const message of messages) {
		// [vision-bridge-v2] serialize image blocks through text bridge.
		const content = bridgeImageBlocks(message.content);
		if (message.role === "system") {
			wire.push({
				role: "system",
				content: flattenText(content)
			});
			continue;
		}
		if (message.role === "assistant") {
			wire.push(serializeAssistant({
				...message,
				content
			}));
			continue;
		}
		const toolResults = content.filter((block) => block.type === "tool-result");
		const text = flattenText(content);
'@
$adapterLoopPattern = 'for \(const message of messages\) \{\s*assertTextOnly\(message\.content\);\s*if \(message\.role === "system"\) \{\s*wire\.push\(\{\s*role: "system",\s*content: flattenText\(message\.content\)\s*\}\);\s*continue;\s*\}\s*if \(message\.role === "assistant"\) \{\s*wire\.push\(serializeAssistant\(message\)\);\s*continue;\s*\}\s*const toolResults = message\.content\.filter\(\(block\) => block\.type === "tool-result"\);\s*const text = flattenText\(message\.content\);'

function Replace-ExactlyOnce([string]$content, [string]$pattern, [string]$replacement, [string]$label) {
    $matches = [regex]::Matches($content, $pattern)
    if ($matches.Count -ne 1) {
        throw "vision-bridge v2 marker not found or ambiguous for $label (matches: $($matches.Count))"
    }
    return [regex]::Replace(
        $content,
        $pattern,
        [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement },
        1
    )
}

function New-ApiProxyPatch([string]$path, [string]$content) {
    $hasPromptMarker = $content.Contains($promptGateMarker)
    $hasSelectMarker = $content.Contains($selectGateMarker)
    if ($hasPromptMarker -and $hasSelectMarker) {
        return [pscustomobject]@{ Path = $path; Content = $content; Changed = $false }
    }
    if ($content.Contains($v2Marker)) {
        throw "vision-bridge v2 partial marker set in $path"
    }
    $patched = Replace-ExactlyOnce $content $promptGatePattern $promptGateReplacement 'dsh-host-apiproxy session.prompt gate'
    $patched = Replace-ExactlyOnce $patched $selectGatePattern $selectGateReplacement 'dsh-host-apiproxy session.selectModel gate'
    return [pscustomobject]@{ Path = $path; Content = $patched; Changed = $true }
}

function New-DeepSeekPatch([string]$path, [string]$content) {
    $hasFunctionMarker = $content.Contains($adapterFunctionMarker)
    $hasLoopBridge = $content.Contains('const content = bridgeImageBlocks(message.content);')
    if ($hasFunctionMarker -and $hasLoopBridge) {
        return [pscustomobject]@{ Path = $path; Content = $content; Changed = $false }
    }
    if ($content.Contains($v2Marker) -or $content.Contains($adapterLoopMarker)) {
        throw "vision-bridge v2 partial marker set in $path"
    }
    $patched = Replace-ExactlyOnce $content $adapterFunctionPattern $adapterFunctionReplacement 'dsh-llm-deepseek assertTextOnly'
    $patched = Replace-ExactlyOnce $patched $adapterLoopPattern $adapterLoopReplacement 'dsh-llm-deepseek serializeMessages loop'
    return [pscustomobject]@{ Path = $path; Content = $patched; Changed = $true }
}

function Write-AtomicUtf8([string]$path, [string]$content) {
    $temporaryPath = "$path.vision-bridge-v2.$PID.tmp"
    $backupPath = "$path.vision-bridge-v2.$PID.backup.tmp"
    try {
        [System.IO.File]::WriteAllText($temporaryPath, $content, $utf8)
        [System.IO.File]::Replace($temporaryPath, $path, $backupPath)
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
        if (Test-Path -LiteralPath $backupPath) {
            Remove-Item -LiteralPath $backupPath -Force
        }
    }
}

$indexFiles = @(Get-ChildItem -LiteralPath $ModulesRoot -Recurse -File -Filter 'index.js')
$plans = [System.Collections.Generic.List[object]]::new()
$packageSpecs = @(
    [pscustomobject]@{ Name = 'dsh-host-apiproxy'; Planner = ${function:New-ApiProxyPatch} },
    [pscustomobject]@{ Name = 'dsh-llm-deepseek'; Planner = ${function:New-DeepSeekPatch} }
)

foreach ($spec in $packageSpecs) {
    $suffix = [System.IO.Path]::DirectorySeparatorChar + "@deepseek-ai$([System.IO.Path]::DirectorySeparatorChar)$($spec.Name)$([System.IO.Path]::DirectorySeparatorChar)lib$([System.IO.Path]::DirectorySeparatorChar)index.js"
    $targets = @($indexFiles | Where-Object { $_.FullName.EndsWith($suffix, [System.StringComparison]::OrdinalIgnoreCase) })
    if ($targets.Count -eq 0) {
        throw "vision-bridge v2 target package not found: $($spec.Name) under $ModulesRoot"
    }
    foreach ($target in $targets) {
        $content = [System.IO.File]::ReadAllText($target.FullName)
        $plans.Add((& $spec.Planner $target.FullName $content))
    }
}

foreach ($plan in $plans) {
    if ($plan.Changed) {
        Write-AtomicUtf8 $plan.Path $plan.Content
        Write-Output "PATCHED $($plan.Path)"
    }
    else {
        Write-Output "SKIP already patched $($plan.Path)"
    }
}

$changedCount = @($plans | Where-Object Changed).Count
Write-Output "vision-bridge v2 ready ($changedCount changed, $($plans.Count - $changedCount) unchanged)."
