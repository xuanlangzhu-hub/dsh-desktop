#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager, State, WebviewWindow};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const READY_ATTEMPTS: usize = 240;
const READY_INTERVAL: Duration = Duration::from_millis(500);
const PREFERRED_PORT: u16 = 3210;
const PORT_CANDIDATE_ATTEMPTS: usize = 32;
const DESKTOP_PROFILE: &str = "whale-desktop";
const WSL_PROFILE: &str = "whale-desktop-wsl";
const PROFILE_THEME_DEPENDENCY: &str = "link:./.whale-desktop/dsh-whale-mist";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Backend {
    Windows,
    Wsl,
}

impl Backend {
    fn from_environment() -> Result<Self, String> {
        let value = env::var("WHALE_HARNESS_BACKEND").ok();
        match value.as_deref().map(str::trim) {
            None | Some("") | Some("windows") => Ok(Self::Windows),
            Some("wsl") => Ok(Self::Wsl),
            Some(other) => Err(format!(
                "未知的 WHALE_HARNESS_BACKEND 值：{other}（可选 windows|wsl，未设置时保持 Windows 模式）"
            )),
        }
    }
}

#[derive(Debug)]
struct WslDistribution {
    name: String,
    version: u32,
    is_default: bool,
}

fn parse_wsl_distribution_line(line: &str) -> Option<WslDistribution> {
    let line = line.trim_end();
    if line.is_empty() {
        return None;
    }
    let is_default = line.trim_start().starts_with('*');
    let trimmed = line.trim_start().trim_start_matches('*').trim();
    let tokens = trimmed.split_whitespace().collect::<Vec<_>>();
    if tokens.len() < 3 {
        return None;
    }
    let version = tokens.last().and_then(|token| token.parse::<u32>().ok())?;
    let state = tokens[tokens.len() - 2];
    if !["Running", "Stopped", "Installing", "Uninstalling"].contains(&state) {
        return None;
    }
    let name = tokens[..tokens.len() - 2].join(" ");
    Some(WslDistribution {
        name,
        version,
        is_default,
    })
}

fn wsl_distributions() -> Result<Vec<WslDistribution>, String> {
    let mut command = Command::new("wsl.exe");
    command.args(["--list", "--verbose"]).env("WSL_UTF8", "1");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().map_err(|error| {
        format!("无法调用 wsl.exe：{error}（WSL 未安装或不可用，Windows 模式不受影响）")
    })?;
    if !output.status.success() {
        return Err(format!(
            "wsl.exe 检查失败：{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut distributions = Vec::new();
    for raw in text.lines() {
        if let Some(distribution) = parse_wsl_distribution_line(raw) {
            distributions.push(distribution);
        }
    }
    Ok(distributions)
}

fn resolve_wsl_distro(configured: Option<&str>) -> Result<String, String> {
    let distributions = wsl_distributions()?;
    if distributions.is_empty() {
        return Err("没有检测到任何 WSL 发行版；实验后端需要 WSL2，Windows 模式不受影响".into());
    }
    let target = if let Some(name) = configured {
        distributions
            .iter()
            .find(|distribution| distribution.name == name)
            .ok_or_else(|| {
                let available = distributions
                    .iter()
                    .map(|distribution| distribution.name.as_str())
                    .collect::<Vec<_>>()
                    .join("、");
                format!("WHALE_HARNESS_WSL_DISTRO 指定的发行版 {name} 不存在；可用：{available}")
            })?
    } else {
        distributions
            .iter()
            .find(|distribution| distribution.is_default)
            .ok_or_else(|| {
                "没有默认 WSL 发行版；请先用 wsl --set-default 设置一个 WSL2 发行版".to_string()
            })?
    };
    if target.version != 2 {
        return Err(format!(
            "WSL 发行版 {} 是 WSL{}，实验后端要求 WSL2；Windows 模式不受影响",
            target.name, target.version
        ));
    }
    Ok(target.name.clone())
}

fn windows_to_wsl_path(path: &Path) -> Result<String, String> {
    let text = path.as_os_str().to_string_lossy();
    let bytes = text.as_bytes();
    if bytes.len() < 3
        || !bytes[0].is_ascii_alphabetic()
        || bytes[1] != b':'
        || !(bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return Err(format!(
            "无法把 Windows 工作区路径转换为 WSL 路径：{}（仅支持驱动器路径，例如 F:\\project）",
            path.display()
        ));
    }
    let drive = (bytes[0] as char).to_ascii_lowercase();
    let rest = text[3..].replace('\\', "/");
    if rest.is_empty() {
        Ok(format!("/mnt/{drive}"))
    } else {
        Ok(format!("/mnt/{drive}/{rest}"))
    }
}

fn ensure_wsl_runtime_ready(distro: &str) -> Result<(), String> {
    let mut command = Command::new("wsl.exe");
    command
        .args([
            "-d",
            distro,
            "--",
            "bash",
            "-lc",
            r#"test -x "$HOME/.local/share/whale-harness/runtime/bin/start-web.sh" \
                -a -x "$HOME/.local/share/whale-harness/runtime/bin/stop-web.sh" \
                -a -x "$HOME/.local/share/whale-harness/runtime/node/bin/node" \
                -a -f "$HOME/.local/share/whale-harness/runtime/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js" \
                -a -f "$HOME/.dsh/profiles/whale-desktop-wsl/package.json""#,
        ])
        .env("WSL_UTF8", "1");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let status = command
        .status()
        .map_err(|error| format!("无法在 WSL 发行版 {distro} 中检查运行时：{error}"))?;
    if !status.success() {
        return Err(format!(
            "WSL 后端运行时未准备完成（发行版 {distro}）。请先在 Windows 上运行 whale-desktop\\scripts\\prepare-wsl-runtime.ps1；Windows 模式不受影响"
        ));
    }
    Ok(())
}

fn stop_wsl_backend(distro: &str) {
    let mut command = Command::new("wsl.exe");
    command
        .args([
            "-d",
            distro,
            "--",
            "bash",
            "-lc",
            r#"exec "$HOME/.local/share/whale-harness/runtime/bin/stop-web.sh""#,
        ])
        .env("WSL_UTF8", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let _ = command.status();
}

#[derive(Clone)]
struct RuntimePaths {
    node: PathBuf,
    dsh_entry: PathBuf,
    theme: PathBuf,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatus {
    phase: String,
    detail: String,
    url: Option<String>,
}

impl Default for DesktopStatus {
    fn default() -> Self {
        Self {
            phase: "starting".into(),
            detail: "正在准备本地服务…".into(),
            url: None,
        }
    }
}

#[derive(Default)]
struct BackendRuntime {
    child: Option<Child>,
    generation: u64,
    status: DesktopStatus,
    wsl_distro: Option<String>,
}

#[derive(Clone, Default)]
struct DesktopState(Arc<Mutex<BackendRuntime>>);

fn workspace_dir() -> PathBuf {
    if let Some(path) = env::var_os("WHALE_HARNESS_WORKSPACE").map(PathBuf::from)
        && path.is_dir()
    {
        return path;
    }
    let source_workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .map(Path::to_path_buf);
    if let Some(path) = source_workspace
        && path.is_dir()
    {
        return path;
    }
    env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .or_else(|| env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from(r"C:\"))
}

fn choose_port<C, A>(mut next_candidate: C, mut available: A) -> Result<u16, String>
where
    C: FnMut() -> Result<u16, String>,
    A: FnMut(u16) -> Result<bool, String>,
{
    for _ in 0..PORT_CANDIDATE_ATTEMPTS {
        let port = next_candidate()?;
        if available(port)? {
            return Ok(port);
        }
    }
    Err(format!(
        "尝试 {PORT_CANDIDATE_ATTEMPTS} 个候选端口后仍未找到 Windows 与后端都可用的端口"
    ))
}

fn reserve_windows_port_candidate(prefer_default: bool) -> Result<u16, String> {
    if prefer_default {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", PREFERRED_PORT)) {
            drop(listener);
            return Ok(PREFERRED_PORT);
        }
    }
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("无法分配本地端口：{error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("无法读取本地端口：{error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn reserve_port() -> Result<u16, String> {
    let mut first = true;
    choose_port(
        || {
            let prefer_default = first;
            first = false;
            reserve_windows_port_candidate(prefer_default)
        },
        |_| Ok(true),
    )
}

fn wsl_port_available(distro: &str, port: u16) -> Result<bool, String> {
    let mut command = Command::new("wsl.exe");
    command
        .args([
            "-d",
            distro,
            "--",
            "bash",
            "-lc",
            r#"exec "$HOME/.local/share/whale-harness/runtime/node/bin/node" -e "const net=require('node:net');const port=Number(process.env.WHALE_WSL_PORT_CHECK);const server=net.createServer();server.once('error',(error)=>process.exit(error.code==='EADDRINUSE'||error.code==='EACCES'?10:11));server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close(()=>process.exit(0)));""#,
        ])
        .env("WSL_UTF8", "1")
        .env("WSLENV", "WHALE_WSL_PORT_CHECK")
        .env("WHALE_WSL_PORT_CHECK", port.to_string());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|error| format!("无法在 WSL 发行版 {distro} 中检查端口 {port}：{error}"))?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(10) => Ok(false),
        code => Err(format!(
            "WSL 发行版 {distro} 检查端口 {port} 失败（状态 {:?}）：{}{}",
            code,
            String::from_utf8_lossy(&output.stdout).trim(),
            String::from_utf8_lossy(&output.stderr).trim()
        )),
    }
}

fn reserve_wsl_port(distro: &str) -> Result<u16, String> {
    let mut first = true;
    choose_port(
        || {
            let prefer_default = first;
            first = false;
            reserve_windows_port_candidate(prefer_default)
        },
        |port| wsl_port_available(distro, port),
    )
}

fn process_path(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path
}

fn runtime_from_root(root: PathBuf, fallback_theme: Option<&Path>) -> Option<RuntimePaths> {
    let bundled_theme = root.join("theme").join("dsh-whale-mist");
    let theme = if bundled_theme.is_dir() {
        bundled_theme
    } else {
        fallback_theme?.to_path_buf()
    };
    let runtime = RuntimePaths {
        node: process_path(root.join("node").join("node.exe")),
        dsh_entry: process_path(
            root.join("dsh")
                .join("node_modules")
                .join("@deepseek-ai")
                .join("dsh")
                .join("lib")
                .join("bin.js"),
        ),
        theme: process_path(theme),
    };
    (runtime.node.is_file() && runtime.dsh_entry.is_file() && runtime.theme.is_dir())
        .then_some(runtime)
}

fn resolve_runtime(app: &AppHandle) -> Result<RuntimePaths, String> {
    let mut candidates = Vec::new();
    let source_theme = workspace_dir().join("dsh-whale-mist");
    let source_runtime = workspace_dir().join("whale-desktop").join("runtime");
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("runtime"));
    }
    if let Ok(executable) = env::current_exe()
        && let Some(parent) = executable.parent()
    {
        candidates.push(parent.join("runtime"));
    }
    candidates.push(source_runtime.clone());
    candidates.dedup();
    for candidate in &candidates {
        let fallback_theme = (candidate == &source_runtime).then_some(source_theme.as_path());
        if let Some(runtime) = runtime_from_root(candidate.clone(), fallback_theme) {
            return Ok(runtime);
        }
    }
    Err(format!(
        "没有找到内置 Harness 运行时。已检查：{}",
        candidates
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join("；")
    ))
}

fn dsh_home_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("DSH_HOME").map(PathBuf::from) {
        return Ok(path);
    }
    app.path()
        .home_dir()
        .map(|path| path.join(".dsh"))
        .map_err(|error| format!("无法定位 Harness 用户目录：{error}"))
}

fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|error| format!("无法创建主题目录 {}：{error}", target.display()))?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("无法读取主题目录 {}：{error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("无法读取主题文件：{error}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取主题文件类型：{error}"))?;
        if file_type.is_dir() {
            copy_directory(&source_path, &target_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &target_path).map_err(|error| {
                format!(
                    "无法更新主题文件 {} → {}：{error}",
                    source_path.display(),
                    target_path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn write_if_missing(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    fs::write(path, content).map_err(|error| format!("无法创建 {}：{error}", path.display()))
}

fn package_version_from_manifest(content: &str, expected_name: &str) -> Result<String, String> {
    let manifest = serde_json::from_str::<serde_json::Value>(content)
        .map_err(|error| format!("主题 package.json 无效：{error}"))?;
    let package_name = manifest
        .get("name")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "主题 package.json 缺少 name".to_string())?;
    if package_name != expected_name {
        return Err(format!(
            "主题包名称不匹配：期望 {expected_name}，实际 {package_name}"
        ));
    }
    manifest
        .get("version")
        .and_then(serde_json::Value::as_str)
        .filter(|version| !version.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "主题 package.json 缺少 version".to_string())
}

fn read_package_version(manifest_path: &Path, expected_name: &str) -> Result<String, String> {
    let content = fs::read_to_string(manifest_path)
        .map_err(|error| format!("无法读取 {}：{error}", manifest_path.display()))?;
    package_version_from_manifest(&content, expected_name)
}

fn prepare_profile_directory(profile_dir: &Path, runtime_theme: &Path) -> Result<(), String> {
    let managed_theme = profile_dir.join(".whale-desktop").join("dsh-whale-mist");
    copy_directory(runtime_theme, &managed_theme)?;
    read_package_version(&managed_theme.join("package.json"), "dsh-whale-mist")?;

    let theme_target = profile_dir.join("node_modules").join("dsh-whale-mist");
    let target_metadata = fs::symlink_metadata(&theme_target).ok();
    let target_is_link = target_metadata
        .as_ref()
        .is_some_and(|metadata| metadata.file_type().is_symlink());
    let target_is_managed_link = target_is_link
        && fs::canonicalize(&theme_target).ok() == fs::canonicalize(&managed_theme).ok();
    if target_is_link && !target_is_managed_link {
        fs::remove_dir(&theme_target)
            .map_err(|error| format!("无法迁移旧主题链接 {}：{error}", theme_target.display()))?;
    }
    if !target_is_managed_link {
        copy_directory(&managed_theme, &theme_target)?;
    }

    let manifest_path = profile_dir.join("package.json");
    let mut manifest = if manifest_path.exists() {
        serde_json::from_str::<serde_json::Value>(
            &fs::read_to_string(&manifest_path)
                .map_err(|error| format!("无法读取桌面 Profile：{error}"))?,
        )
        .map_err(|error| format!("桌面 Profile 配置无效：{error}"))?
    } else {
        serde_json::json!({})
    };
    if !manifest.is_object() {
        manifest = serde_json::json!({});
    }
    let root = manifest.as_object_mut().expect("manifest was normalized");
    root.entry("name")
        .or_insert_with(|| serde_json::json!("dsh-profile-whale-desktop"));
    root.insert("private".into(), serde_json::json!(true));

    let dependencies = root
        .entry("dependencies")
        .or_insert_with(|| serde_json::json!({}));
    if !dependencies.is_object() {
        *dependencies = serde_json::json!({});
    }
    dependencies
        .as_object_mut()
        .expect("dependencies was normalized")
        .insert(
            "dsh-whale-mist".into(),
            serde_json::json!(PROFILE_THEME_DEPENDENCY),
        );

    let dsh = root.entry("dsh").or_insert_with(|| serde_json::json!({}));
    if !dsh.is_object() {
        *dsh = serde_json::json!({});
    }
    let dsh = dsh.as_object_mut().expect("dsh was normalized");
    let profile = dsh
        .entry("profile")
        .or_insert_with(|| serde_json::json!({}));
    if !profile.is_object() {
        *profile = serde_json::json!({});
    }
    let profile = profile.as_object_mut().expect("profile was normalized");
    let required = [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-whale-mist",
    ];
    let existing = profile
        .get("bundles")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let mut bundles = required
        .iter()
        .map(|name| name.to_string())
        .collect::<Vec<_>>();
    for bundle in existing {
        if !bundles.contains(&bundle) {
            bundles.push(bundle);
        }
    }
    profile.insert("bundles".into(), serde_json::json!(bundles));

    let serialized = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("无法生成桌面 Profile：{error}"))?;
    fs::write(&manifest_path, format!("{serialized}\n"))
        .map_err(|error| format!("无法保存桌面 Profile：{error}"))?;
    write_if_missing(
        &profile_dir.join("cordis.patch.yml"),
        "# Whale Desktop user overrides. This file is preserved across updates.\n[]\n",
    )?;
    write_if_missing(
        &profile_dir.join("pnpm-workspace.yaml"),
        "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n",
    )?;
    Ok(())
}

fn prepare_desktop_profile(app: &AppHandle, runtime: &RuntimePaths) -> Result<(), String> {
    let profile_dir = dsh_home_dir(app)?.join("profiles").join(DESKTOP_PROFILE);
    prepare_profile_directory(&profile_dir, &runtime.theme)
}

fn log_files(app: &AppHandle) -> Result<(File, File, PathBuf), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("无法定位日志目录：{error}"))?;
    fs::create_dir_all(&log_dir).map_err(|error| format!("无法创建日志目录：{error}"))?;
    let stdout_path = log_dir.join("dsh-web.stdout.log");
    let stderr_path = log_dir.join("dsh-web.stderr.log");
    let stdout = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&stdout_path)
        .map_err(|error| format!("无法创建标准输出日志：{error}"))?;
    let stderr = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&stderr_path)
        .map_err(|error| format!("无法创建错误日志：{error}"))?;
    Ok((stdout, stderr, stderr_path))
}

fn update_status(
    state: &DesktopState,
    phase: &str,
    detail: impl Into<String>,
    url: Option<String>,
) {
    if let Ok(mut runtime) = state.0.lock() {
        runtime.status = DesktopStatus {
            phase: phase.into(),
            detail: detail.into(),
            url,
        };
    }
}

fn eval_status(window: &WebviewWindow, method: &str, message: &str) {
    let encoded = serde_json::to_string(message).unwrap_or_else(|_| "\"状态更新失败\"".into());
    let _ = window.eval(&format!("window.whaleDesktop?.{method}({encoded})"));
}

fn harness_ready(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(700)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(900)));
    let request = format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.starts_with("HTTP/1.1 200") && response.contains("<title>DeepSeek Harness</title>")
}

fn spawn_harness(app: &AppHandle, port: u16) -> Result<(Child, PathBuf), String> {
    let runtime = resolve_runtime(app)?;
    prepare_desktop_profile(app, &runtime)?;
    let (stdout, stderr, stderr_path) = log_files(app)?;
    let port_text = port.to_string();
    let mut command = Command::new(&runtime.node);
    command
        .arg(&runtime.dsh_entry)
        .args([
            "--profile",
            DESKTOP_PROFILE,
            "--host",
            "127.0.0.1",
            "--port",
            &port_text,
        ])
        .current_dir(workspace_dir())
        .env("NO_COLOR", "1")
        .env("WHALE_HARNESS_DESKTOP", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    if let Some(node_dir) = runtime.node.parent() {
        let mut search_paths = vec![node_dir.to_path_buf()];
        search_paths.extend(env::split_paths(&env::var_os("PATH").unwrap_or_default()));
        if let Ok(path) = env::join_paths(search_paths) {
            command.env("PATH", path);
        }
    }
    let launch_log = stderr_path.with_file_name("dsh-web.launch.log");
    let _ = fs::write(
        launch_log,
        format!(
            "node={}\nentry={}\nprofile={}\nworkspace={}\nport={}\ncommand={command:?}\n",
            runtime.node.display(),
            runtime.dsh_entry.display(),
            DESKTOP_PROFILE,
            workspace_dir().display(),
            port
        ),
    );
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let child = command
        .spawn()
        .map_err(|error| format!("无法启动内置 DeepSeek Harness：{error}"))?;
    Ok((child, stderr_path))
}

fn spawn_wsl_harness(app: &AppHandle, distro: &str, port: u16) -> Result<(Child, PathBuf), String> {
    // Runtime readiness is validated once in launch_backend before port
    // probing, so a missing WSL runtime fails with a readable preparation
    // error instead of a confusing node/port-probe status.
    let workspace = workspace_dir();
    let workspace_wsl = windows_to_wsl_path(&workspace)?;
    let (stdout, stderr, stderr_path) = log_files(app)?;
    let port_text = port.to_string();

    // WSLENV is the only way to hand these values through wsl.exe into the
    // Linux launcher; they are re-read by scripts/wsl/start-web.js.
    let mut command = Command::new("wsl.exe");
    command
        .args([
            "-d",
            distro,
            "--",
            "bash",
            "-lc",
            r#"exec "$HOME/.local/share/whale-harness/runtime/bin/start-web.sh""#,
        ])
        .env("WSL_UTF8", "1")
        .env(
            "WSLENV",
            "WHALE_WSL_PORT:WHALE_WSL_HOST:WHALE_WSL_PROFILE:WHALE_WSL_WORKSPACE",
        )
        .env("WHALE_WSL_PORT", &port_text)
        .env("WHALE_WSL_HOST", "127.0.0.1")
        .env("WHALE_WSL_PROFILE", WSL_PROFILE)
        .env("WHALE_WSL_WORKSPACE", &workspace_wsl)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let launch_log = stderr_path.with_file_name("dsh-web.launch.log");
    let _ = fs::write(
        &launch_log,
        format!(
            "backend=wsl\ndistro={distro}\nprofile={WSL_PROFILE}\nworkspace={}\nworkspaceWsl={workspace_wsl}\nport={port}\nnote=workspace lives on a Windows drive; Linux projects are faster under ~/projects\ncommand={command:?}\n",
            workspace.display()
        ),
    );
    let child = command
        .spawn()
        .map_err(|error| format!("无法通过 WSL 发行版 {distro} 启动 DeepSeek Harness：{error}"))?;
    Ok((child, stderr_path))
}

fn stop_backend(state: &DesktopState) {
    let (child, wsl_distro) = {
        let Ok(mut runtime) = state.0.lock() else {
            return;
        };
        runtime.generation = runtime.generation.wrapping_add(1);
        (runtime.child.take(), runtime.wsl_distro.take())
    };
    // For the WSL backend, stop the Linux process group recorded by the
    // pidfile before terminating the wsl.exe client that launched it.
    if let Some(distro) = wsl_distro {
        stop_wsl_backend(&distro);
    }
    let Some(mut child) = child else {
        return;
    };
    #[cfg(windows)]
    {
        let mut taskkill = Command::new("taskkill.exe");
        taskkill
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);
        let _ = taskkill.status();
    }
    #[cfg(not(windows))]
    let _ = child.kill();
    let _ = child.wait();
}

fn launch_backend(app: &AppHandle, state: &DesktopState) -> Result<(), String> {
    let backend = Backend::from_environment()?;
    stop_backend(state);
    let resolved_wsl_distro = if backend == Backend::Wsl {
        let configured = env::var("WHALE_HARNESS_WSL_DISTRO")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        Some(resolve_wsl_distro(configured.as_deref())?)
    } else {
        None
    };
    if let Some(distro) = resolved_wsl_distro.as_deref() {
        ensure_wsl_runtime_ready(distro)?;
    }
    let port = if let Some(distro) = resolved_wsl_distro.as_deref() {
        reserve_wsl_port(distro)?
    } else {
        reserve_port()?
    };
    let url = format!("http://127.0.0.1:{port}");
    let (child, stderr_path, wsl_distro, starting_detail) = match backend {
        Backend::Windows => {
            let (child, stderr_path) = spawn_harness(app, port)?;
            (child, stderr_path, None, "正在启动内置 DeepSeek Harness…")
        }
        Backend::Wsl => {
            let distro = resolved_wsl_distro
                .as_deref()
                .ok_or_else(|| "WSL 发行版解析状态丢失".to_string())?;
            let (child, stderr_path) = spawn_wsl_harness(app, distro, port)?;
            (
                child,
                stderr_path,
                Some(distro.to_string()),
                "正在启动 WSL 后端…（工作区位于 Windows 磁盘，速度可能较慢）",
            )
        }
    };
    let generation = {
        let mut runtime = state.0.lock().map_err(|_| "后台状态已损坏".to_string())?;
        runtime.generation = runtime.generation.wrapping_add(1);
        runtime.child = Some(child);
        runtime.wsl_distro = wsl_distro;
        runtime.status = DesktopStatus {
            phase: "starting".into(),
            detail: starting_detail.into(),
            url: Some(url.clone()),
        };
        runtime.generation
    };
    if let Some(window) = app.get_webview_window("main") {
        eval_status(&window, "setStatus", starting_detail);
    }

    let app = app.clone();
    let state = state.clone();
    thread::spawn(move || {
        for attempt in 0..READY_ATTEMPTS {
            thread::sleep(READY_INTERVAL);
            let exited = {
                let Ok(mut runtime) = state.0.lock() else {
                    return;
                };
                if runtime.generation != generation {
                    return;
                }
                runtime
                    .child
                    .as_mut()
                    .and_then(|child| child.try_wait().ok().flatten())
            };
            if let Some(status) = exited {
                let message = format!(
                    "Harness 服务提前退出（{status}）。日志：{}",
                    stderr_path.display()
                );
                update_status(&state, "failed", &message, Some(url.clone()));
                if let Some(window) = app.get_webview_window("main") {
                    eval_status(&window, "fail", &message);
                }
                return;
            }
            if harness_ready(port) {
                update_status(&state, "ready", "正在打开官方 WebUI…", Some(url.clone()));
                if let Some(window) = app.get_webview_window("main") {
                    eval_status(&window, "setStatus", "正在打开官方 WebUI…");
                    let encoded =
                        serde_json::to_string(&url).unwrap_or_else(|_| "\"about:blank\"".into());
                    let _ = window.eval(&format!("window.location.replace({encoded})"));
                }
                return;
            }
            if attempt == 20 {
                update_status(
                    &state,
                    "starting",
                    "首次启动正在加载依赖，请稍候…",
                    Some(url.clone()),
                );
                if let Some(window) = app.get_webview_window("main") {
                    eval_status(&window, "setStatus", "首次启动正在加载依赖，请稍候…");
                }
            }
        }
        let message = format!("等待 Harness 启动超时。日志：{}", stderr_path.display());
        update_status(&state, "failed", &message, Some(url));
        if let Some(window) = app.get_webview_window("main") {
            eval_status(&window, "fail", &message);
        }
    });
    Ok(())
}

#[tauri::command]
fn desktop_status(state: State<'_, DesktopState>) -> DesktopStatus {
    state
        .0
        .lock()
        .map(|runtime| runtime.status.clone())
        .unwrap_or_else(|_| DesktopStatus {
            phase: "failed".into(),
            detail: "无法读取桌面服务状态".into(),
            url: None,
        })
}

#[tauri::command]
fn restart_backend(app: AppHandle, state: State<'_, DesktopState>) -> Result<(), String> {
    launch_backend(&app, &state)
}

fn main() {
    let state = DesktopState::default();
    let shutdown_state = state.clone();
    let app = tauri::Builder::default()
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![desktop_status, restart_backend])
        .setup(move |app| {
            if let Err(error) = launch_backend(app.handle(), &state) {
                update_status(&state, "failed", &error, None);
                if let Some(window) = app.get_webview_window("main") {
                    eval_status(&window, "fail", &error);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Whale Harness Desktop");

    app.run(move |_app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            stop_backend(&shutdown_state);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        choose_port, package_version_from_manifest, parse_wsl_distribution_line,
        prepare_profile_directory, windows_to_wsl_path,
    };
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "whale-profile-test-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn wsl_port_selection_skips_a_guest_occupied_preferred_port() {
        let mut candidates = [3210, 3721].into_iter();
        let mut checked = Vec::new();
        let selected = choose_port(
            || Ok(candidates.next().expect("test candidate")),
            |port| {
                checked.push(port);
                Ok(port != 3210)
            },
        )
        .unwrap();

        assert_eq!(selected, 3721);
        assert_eq!(checked, vec![3210, 3721]);
    }

    #[test]
    fn reads_theme_version_from_its_package_manifest() {
        let manifest = r#"{
            "name": "dsh-whale-mist",
            "version": "0.2.0"
        }"#;

        assert_eq!(
            package_version_from_manifest(manifest, "dsh-whale-mist").unwrap(),
            "0.2.0"
        );
    }

    #[test]
    fn rejects_a_different_package_manifest() {
        let manifest = r#"{
            "name": "some-other-theme",
            "version": "9.9.9"
        }"#;

        assert!(package_version_from_manifest(manifest, "dsh-whale-mist").is_err());
    }

    #[test]
    fn profile_uses_a_local_theme_link_and_preserves_user_plugins() {
        let temp = TestDirectory::new();
        let runtime_theme = temp.0.join("runtime-theme");
        let profile_dir = temp.0.join("profile");
        fs::create_dir_all(&runtime_theme).unwrap();
        fs::create_dir_all(&profile_dir).unwrap();
        fs::write(
            runtime_theme.join("package.json"),
            r#"{"name":"dsh-whale-mist","version":"0.2.0"}"#,
        )
        .unwrap();
        fs::write(
            profile_dir.join("package.json"),
            r#"{
                "dependencies": {
                    "dsh-archived-sessions": "github:Zephyr-vibe/dsh-archived-sessions",
                    "dsh-whale-mist": "link:F:/old/theme"
                },
                "dsh": {"profile": {"bundles": ["dsh-archived-sessions"]}}
            }"#,
        )
        .unwrap();

        prepare_profile_directory(&profile_dir, &runtime_theme).unwrap();

        let manifest: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(profile_dir.join("package.json")).unwrap())
                .unwrap();
        assert_eq!(
            manifest["dependencies"]["dsh-whale-mist"].as_str(),
            Some("link:./.whale-desktop/dsh-whale-mist")
        );
        assert_eq!(
            manifest["dependencies"]["dsh-archived-sessions"].as_str(),
            Some("github:Zephyr-vibe/dsh-archived-sessions")
        );
        assert!(
            profile_dir
                .join(".whale-desktop")
                .join("dsh-whale-mist")
                .join("package.json")
                .is_file()
        );
        assert!(
            manifest["dsh"]["profile"]["bundles"]
                .as_array()
                .unwrap()
                .iter()
                .any(|bundle| bundle == "dsh-archived-sessions")
        );
    }

    #[test]
    fn converts_windows_drive_paths_to_wsl_mounts() {
        assert_eq!(
            windows_to_wsl_path(Path::new(r"F:\deepseekharness")).unwrap(),
            "/mnt/f/deepseekharness"
        );
        assert_eq!(
            windows_to_wsl_path(Path::new(r"C:\Users\Example\.dsh")).unwrap(),
            "/mnt/c/Users/Example/.dsh"
        );
        assert_eq!(windows_to_wsl_path(Path::new(r"E:\")).unwrap(), "/mnt/e");
        assert!(windows_to_wsl_path(Path::new(r"\\server\share")).is_err());
        assert!(windows_to_wsl_path(Path::new("relative")).is_err());
    }

    #[test]
    fn parses_wsl_distribution_lines() {
        let parsed = parse_wsl_distribution_line("* Ubuntu2    Running         2").unwrap();
        assert_eq!(parsed.name, "Ubuntu2");
        assert_eq!(parsed.version, 2);
        assert!(parsed.is_default);

        let parsed = parse_wsl_distribution_line("  Ubuntu    Stopped         1").unwrap();
        assert_eq!(parsed.name, "Ubuntu");
        assert_eq!(parsed.version, 1);
        assert!(!parsed.is_default);

        assert!(parse_wsl_distribution_line("  NAME STATE VERSION").is_none());
        assert!(parse_wsl_distribution_line("").is_none());
    }
}
