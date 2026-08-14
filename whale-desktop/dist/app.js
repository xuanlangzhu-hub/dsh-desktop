const statusElement = document.querySelector("#status");
const progressElement = document.querySelector("#progress-track");
const errorPanel = document.querySelector("#error-panel");
const errorDetail = document.querySelector("#error-detail");
const retryButton = document.querySelector("#retry-button");

function setStatus(message) {
  statusElement.textContent = message || "正在准备本地服务…";
  errorPanel.hidden = true;
  progressElement.hidden = false;
}

function fail(message) {
  statusElement.textContent = "没有连接到 Harness";
  errorDetail.textContent = message || "服务暂时无法启动，请检查日志后重试。";
  errorPanel.hidden = false;
  progressElement.hidden = true;
}

window.whaleDesktop = { setStatus, fail };

async function invoke(command) {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) throw new Error("Tauri bridge unavailable");
  return tauri.core.invoke(command);
}

async function refreshStatus() {
  try {
    const state = await invoke("desktop_status");
    if (state.phase === "failed") fail(state.detail);
    else setStatus(state.detail);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

retryButton.addEventListener("pointerdown", () => retryButton.classList.add("pressed"));
retryButton.addEventListener("pointerup", () => retryButton.classList.remove("pressed"));
retryButton.addEventListener("pointercancel", () => retryButton.classList.remove("pressed"));
retryButton.addEventListener("click", async () => {
  retryButton.disabled = true;
  setStatus("正在重新启动本地服务…");
  try {
    await invoke("restart_backend");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    retryButton.disabled = false;
  }
});

void refreshStatus();
