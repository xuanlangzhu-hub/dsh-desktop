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
const DESKTOP_PROFILE: &str = "whale-desktop";

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

fn reserve_port() -> Result<u16, String> {
    if let Ok(listener) = TcpListener::bind(("127.0.0.1", PREFERRED_PORT)) {
        drop(listener);
        return Ok(PREFERRED_PORT);
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

fn prepare_desktop_profile(app: &AppHandle, runtime: &RuntimePaths) -> Result<(), String> {
    let profile_dir = dsh_home_dir(app)?.join("profiles").join(DESKTOP_PROFILE);
    let theme_target = profile_dir.join("node_modules").join("dsh-whale-mist");
    copy_directory(&runtime.theme, &theme_target)?;

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
        .insert("dsh-whale-mist".into(), serde_json::json!("0.3.0"));

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

fn stop_backend(state: &DesktopState) {
    let child = {
        let Ok(mut runtime) = state.0.lock() else {
            return;
        };
        runtime.generation = runtime.generation.wrapping_add(1);
        runtime.child.take()
    };
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
    stop_backend(state);
    let port = reserve_port()?;
    let url = format!("http://127.0.0.1:{port}");
    let (child, stderr_path) = spawn_harness(app, port)?;
    let generation = {
        let mut runtime = state.0.lock().map_err(|_| "后台状态已损坏".to_string())?;
        runtime.generation = runtime.generation.wrapping_add(1);
        runtime.child = Some(child);
        runtime.status = DesktopStatus {
            phase: "starting".into(),
            detail: "正在启动内置 DeepSeek Harness…".into(),
            url: Some(url.clone()),
        };
        runtime.generation
    };
    if let Some(window) = app.get_webview_window("main") {
        eval_status(&window, "setStatus", "正在启动内置 DeepSeek Harness…");
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
