const ESC = "\x1b[";
const ANSI_PATTERN = /\x1b\[[0-?]*[ -\/]*[@-~]/g;

export function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

function isWide(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

export function stringWidth(value) {
  let width = 0;
  for (const char of stripAnsi(value)) {
    const point = char.codePointAt(0);
    if (point === 0x0a || point === 0x0d) continue;
    if ((point >= 0 && point < 0x20) || (point >= 0x7f && point < 0xa0)) continue;
    if ((point >= 0x300 && point <= 0x36f) || (point >= 0xfe00 && point <= 0xfe0f)) continue;
    width += isWide(point) ? 2 : 1;
  }
  return width;
}

export function clipWidth(value, maxWidth, suffix = "") {
  if (maxWidth <= 0) return "";
  if (stringWidth(value) <= maxWidth) return value;
  const suffixWidth = stringWidth(suffix);
  let result = "";
  let width = 0;
  for (const char of String(value)) {
    const next = stringWidth(char);
    if (width + next + suffixWidth > maxWidth) break;
    result += char;
    width += next;
  }
  return result + suffix;
}

export function wrapText(value, maxWidth) {
  const width = Math.max(1, maxWidth);
  const output = [];
  for (const paragraph of String(value ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (paragraph === "") {
      output.push("");
      continue;
    }
    let line = "";
    let lineWidth = 0;
    for (const char of paragraph) {
      const charWidth = stringWidth(char);
      if (line !== "" && lineWidth + charWidth > width) {
        output.push(line);
        line = "";
        lineWidth = 0;
      }
      line += char;
      lineWidth += charWidth;
    }
    output.push(line);
  }
  return output.length > 0 ? output : [""];
}

function previousIndex(value, index) {
  if (index <= 0) return 0;
  const chars = [...value.slice(0, index)];
  const last = chars.at(-1);
  return Math.max(0, index - (last?.length ?? 1));
}

function nextIndex(value, index) {
  if (index >= value.length) return value.length;
  const next = [...value.slice(index)][0];
  return Math.min(value.length, index + (next?.length ?? 1));
}

function paint(enabled, code, value) {
  return enabled ? `\x1b[${code}m${value}\x1b[0m` : value;
}

function padLine(value, width) {
  return value + " ".repeat(Math.max(0, width - stringWidth(value)));
}

const ENTRY_STYLE = Object.freeze({
  user: { label: "你", color: "38;2;20;104;168", bold: true },
  assistant: { label: "鲸鱼", color: "38;2;21;48;71", bold: true },
  reasoning: { label: "思考", color: "38;2;111;135;154", dim: true },
  tool: { label: "工具", color: "38;2;169;106;34", bold: true },
  notice: { label: "提示", color: "38;2;20;104;168" },
  success: { label: "完成", color: "38;2;43;129;100" },
  error: { label: "错误", color: "38;2;177;71;84", bold: true }
});

const STATUS_COPY = Object.freeze({
  idle: "空闲",
  running: "运行中",
  waiting: "等待确认",
  complete: "已完成",
  error: "发生错误"
});

function defaultChannel(kind) {
  return kind === "reasoning" || kind === "tool" ? "trajectory" : "conversation";
}

export class WhaleTerminalUI {
  constructor({ stdin = process.stdin, stdout = process.stdout, alternateScreen = true, color } = {}) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.alternateScreen = alternateScreen;
    this.color = color ?? !process.env.NO_COLOR;
    this.opened = false;
    this.closed = false;
    this.renderQueued = false;
    this.entries = [];
    this.entryIndex = new Map();
    this.view = "conversation";
    this.picker = undefined;
    this.input = "";
    this.cursor = 0;
    this.inputHistory = [];
    this.historyIndex = 0;
    this.scrollOffset = 0;
    this.status = { kind: "idle", detail: "" };
    this.meta = {
      title: "新会话",
      cwd: process.cwd(),
      sessionId: "",
      model: ""
    };
    this.interaction = undefined;
    this.interactionQueue = [];
    this.callbacks = {
      submit: async () => {},
      cancel: () => {},
      exit: () => {},
      sessions: async () => {}
    };
    this._onData = (chunk) => this.handleData(String(chunk));
    this._onResize = () => this.scheduleRender();
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setMeta(patch) {
    this.meta = { ...this.meta, ...patch };
    this.scheduleRender();
  }

  setStatus(kind, detail = "") {
    this.status = { kind, detail };
    this.scheduleRender();
  }

  setView(view) {
    if (view !== "conversation" && view !== "trajectory") throw new Error(`未知视图: ${view}`);
    this.view = view;
    this.scrollOffset = 0;
    this.scheduleRender();
  }

  toggleView() {
    if (this.picker) return;
    this.setView(this.view === "conversation" ? "trajectory" : "conversation");
  }

  clearEntries() {
    this.entries = [];
    this.entryIndex.clear();
    this.scrollOffset = 0;
    this.scheduleRender();
  }

  addEntry(entry) {
    const normalized = {
      id: entry.id ?? `entry-${Date.now()}-${Math.random()}`,
      kind: entry.kind ?? "notice",
      label: entry.label,
      channel: entry.channel ?? defaultChannel(entry.kind ?? "notice"),
      text: String(entry.text ?? "")
    };
    const existing = this.entryIndex.get(normalized.id);
    if (existing !== undefined) {
      this.entries[existing] = { ...this.entries[existing], ...normalized };
    } else {
      this.entryIndex.set(normalized.id, this.entries.length);
      this.entries.push(normalized);
      if (this.entries.length > 600) this.compactEntries();
    }
    this.scrollOffset = 0;
    this.scheduleRender();
    return normalized.id;
  }

  appendEntry(id, text) {
    const index = this.entryIndex.get(id);
    if (index === undefined) {
      this.addEntry({ id, kind: "assistant", text });
      return;
    }
    this.entries[index] = {
      ...this.entries[index],
      text: this.entries[index].text + text
    };
    this.scrollOffset = 0;
    this.scheduleRender();
  }

  compactEntries() {
    this.entries = this.entries.slice(-450);
    this.entryIndex.clear();
    this.entries.forEach((entry, index) => this.entryIndex.set(entry.id, index));
  }

  pick({ title, items, emptyText = "没有可选项目" }) {
    if (this.picker) return Promise.reject(new Error("已有选择器正在显示"));
    if (this.interaction) return Promise.reject(new Error("请先完成当前问题"));
    return new Promise((resolve) => {
      this.picker = {
        title,
        items: items.map((item) => ({
          value: item.value,
          label: String(item.label ?? item.value),
          description: String(item.description ?? "")
        })),
        emptyText,
        query: "",
        selected: 0,
        resolve
      };
      this.input = "";
      this.cursor = 0;
      this.scrollOffset = 0;
      this.scheduleRender();
    });
  }

  closePicker(value) {
    const picker = this.picker;
    if (!picker) return;
    this.picker = undefined;
    picker.resolve(value);
    this.scheduleRender();
  }

  open() {
    if (this.opened) return;
    if (!this.stdin.isTTY || !this.stdout.isTTY || typeof this.stdin.setRawMode !== "function") {
      throw new Error("Whale TUI 需要交互式终端；可用 --check 验证安装");
    }
    this.opened = true;
    this.stdin.setEncoding("utf8");
    this.stdin.setRawMode(true);
    this.stdin.resume();
    this.stdin.on("data", this._onData);
    this.stdout.on("resize", this._onResize);
    if (this.alternateScreen) this.stdout.write(`${ESC}?1049h`);
    this.stdout.write(`${ESC}?2004h${ESC}?25l`);
    this.render();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stdin.off("data", this._onData);
    this.stdout.off("resize", this._onResize);
    if (this.stdin.isTTY && typeof this.stdin.setRawMode === "function") {
      try { this.stdin.setRawMode(false); } catch {}
    }
    if (this.opened) {
      this.stdout.write(`${ESC}?2004l${ESC}?25h`);
      if (this.alternateScreen) this.stdout.write(`${ESC}?1049l`);
      else this.stdout.write("\n");
    }
    this.closePicker(undefined);
    this.finishInteractions(new Error("Whale TUI 已关闭"));
  }

  scheduleRender() {
    if (!this.opened || this.closed || this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (!this.closed) this.render();
    });
  }

  render() {
    const width = Math.max(44, this.stdout.columns || 100);
    const height = Math.max(16, this.stdout.rows || 30);
    const { lines, cursorRow, cursorColumn } = this.buildFrame(width, height, this.color);
    const screen = lines.map((line) => padLine(line, width)).join("\n");
    this.stdout.write(`${ESC}?25l${ESC}H${screen}${ESC}J${ESC}${cursorRow};${cursorColumn}H${ESC}?25h`);
  }

  snapshot(width = 100, height = 30) {
    return this.buildFrame(width, height, false).lines.join("\n");
  }

  buildFrame(width, height, color = false) {
    const safeWidth = Math.max(44, width);
    const safeHeight = Math.max(16, height);
    const divider = paint(color, "38;2;177;207;229", "─".repeat(safeWidth));
    const brandBadge = paint(color, "1;37;48;2;20;104;168", " 鲸 ");
    const brand = `${brandBadge} ${paint(color, "1;38;2;21;48;71", "WHALE TUI")}`;
    const conversationTab = paint(color, this.view === "conversation" ? "1;4;38;2;20;104;168" : "38;2;111;135;154", "对话");
    const trajectoryTab = paint(color, this.view === "trajectory" ? "1;4;38;2;20;104;168" : "38;2;111;135;154", "轨迹");
    const tabs = `${conversationTab}  ${trajectoryTab}`;
    const statusText = STATUS_COPY[this.status.kind] ?? this.status.kind;
    const statusCode = this.status.kind === "waiting"
      ? "38;2;169;106;34"
      : this.status.kind === "complete"
        ? "38;2;43;129;100"
        : this.status.kind === "error"
          ? "38;2;177;71;84"
          : "38;2;20;104;168";
    const rightPlain = `● ${statusText}`;
    const leftBasePlain = " 鲸  WHALE TUI  对话  轨迹";
    const titleBudget = Math.max(0, safeWidth - stringWidth(leftBasePlain) - stringWidth(rightPlain) - 3);
    const title = titleBudget >= 4
      ? clipWidth(this.picker?.title || this.meta.title || "新会话", titleBudget, "…")
      : "";
    const leftPlain = `${leftBasePlain}${title ? `  ${title}` : ""}`;
    const gap = " ".repeat(Math.max(1, safeWidth - stringWidth(leftPlain) - stringWidth(rightPlain)));
    const header = `${brand}  ${tabs}${title ? `  ${paint(color, "1;38;2;21;48;71", title)}` : ""}${gap}${paint(color, statusCode, rightPlain)}`;
    const model = this.meta.model || "未选择模型";
    const session = this.meta.sessionId ? `会话 ${this.meta.sessionId}` : "";
    const meta = clipWidth([this.meta.cwd, model, session].filter(Boolean).join("  ·  "), safeWidth, "…");
    const metaLine = paint(color, "38;2;98;121;140", meta);

    const footerHeight = 3;
    const transcriptHeight = Math.max(7, safeHeight - 3 - footerHeight);
    let viewport;
    if (this.picker) {
      viewport = this.renderPicker(safeWidth, transcriptHeight, color);
      while (viewport.length < transcriptHeight) viewport.push("");
    } else {
      const transcript = this.renderTranscript(safeWidth, color);
      const maxOffset = Math.max(0, transcript.length - transcriptHeight);
      this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
      const end = Math.max(0, transcript.length - this.scrollOffset);
      const start = Math.max(0, end - transcriptHeight);
      viewport = transcript.slice(start, end);
      while (viewport.length < transcriptHeight) viewport.unshift("");
    }

    const promptWidth = safeWidth - 3;
    const visible = this.picker
      ? { text: clipWidth(this.picker.query, promptWidth, "…"), cursorWidth: stringWidth(this.picker.query) }
      : this.visibleInput(promptWidth);
    const promptSymbol = this.picker ? "⌕" : this.interaction ? "?" : "›";
    const inputLine = `${paint(color, this.interaction ? "38;2;169;106;34" : "38;2;20;104;168", promptSymbol)} ${visible.text}`;
    let hint;
    if (this.picker) {
      hint = "输入筛选  ·  ↑↓ 选择  ·  Enter 打开  ·  Esc 返回";
    } else if (this.interaction) {
      const error = this.interaction.error ? ` · ${this.interaction.error}` : "";
      hint = `${this.interaction.title} · ${this.interaction.hint}${error}`;
    } else if (this.status.kind === "running") {
      hint = "Enter steering  ·  Esc 停止  ·  Tab 对话/轨迹  ·  PageUp 滚动";
    } else {
      hint = "Enter 发送  ·  Tab 对话/轨迹  ·  Ctrl+R 会话  ·  Ctrl+C 退出";
    }
    const hintLine = paint(color, this.interaction?.error ? "38;2;177;71;84" : "38;2;111;135;154", clipWidth(hint, safeWidth, "…"));
    const lines = [header, metaLine, divider, ...viewport, divider, inputLine, hintLine];
    const cursorRow = safeHeight - 1;
    const cursorColumn = Math.min(safeWidth, 3 + visible.cursorWidth);
    return { lines: lines.slice(0, safeHeight), cursorRow, cursorColumn };
  }

  renderTranscript(width, color) {
    const lines = [];
    const prefixWidth = 7;
    const bodyWidth = Math.max(16, width - prefixWidth);
    for (const entry of this.entries) {
      if (entry.channel !== "both" && entry.channel !== this.view) continue;
      const style = ENTRY_STYLE[entry.kind] ?? ENTRY_STYLE.notice;
      const label = clipWidth(entry.label || style.label, prefixWidth - 2, "…");
      const bodyLines = wrapText(entry.text, bodyWidth);
      bodyLines.forEach((line, index) => {
        const prefix = index === 0 ? `${label}${" ".repeat(Math.max(1, prefixWidth - stringWidth(label)))}` : " ".repeat(prefixWidth);
        const labelCode = `${style.bold ? "1;" : ""}${style.dim ? "2;" : ""}${style.color}`;
        const bodyCode = style.dim ? "2;38;2;98;121;140" : style.color;
        lines.push(`${paint(color, labelCode, prefix)}${paint(color, bodyCode, line)}`);
      });
      lines.push("");
    }
    return lines;
  }

  pickerItems() {
    if (!this.picker) return [];
    const query = this.picker.query.trim().toLowerCase();
    if (!query) return this.picker.items;
    return this.picker.items.filter((item) => `${item.label}\n${item.description}\n${item.value}`.toLowerCase().includes(query));
  }

  renderPicker(width, height, color) {
    const picker = this.picker;
    if (!picker) return [];
    const items = this.pickerItems();
    picker.selected = Math.max(0, Math.min(picker.selected, Math.max(0, items.length - 1)));
    const lines = [paint(color, "1;38;2;21;48;71", `${picker.title}  ·  ${items.length} 项`), ""];
    if (items.length === 0) {
      lines.push(paint(color, "38;2;111;135;154", picker.emptyText));
      return lines.slice(0, height);
    }
    const rowsPerItem = 2;
    const capacity = Math.max(1, Math.floor((height - 2) / rowsPerItem));
    const start = Math.max(0, Math.min(picker.selected - Math.floor(capacity / 2), items.length - capacity));
    for (const [offset, item] of items.slice(start, start + capacity).entries()) {
      const index = start + offset;
      const active = index === picker.selected;
      const marker = active ? "›" : " ";
      const label = clipWidth(`${marker} ${item.label}`, width, "…");
      const description = clipWidth(`   ${item.description}`, width, "…");
      lines.push(paint(color, active ? "1;38;2;20;104;168" : "38;2;21;48;71", label));
      lines.push(paint(color, "38;2;111;135;154", description));
    }
    return lines.slice(0, height);
  }

  visibleInput(maxWidth) {
    const displayValue = this.input.replace(/\r?\n/g, "↵");
    const displayBefore = this.input.slice(0, this.cursor).replace(/\r?\n/g, "↵");
    let start = 0;
    while (stringWidth(displayBefore.slice(start)) > Math.max(1, maxWidth - 1)) {
      start = nextIndex(displayBefore, start);
    }
    const text = clipWidth(displayValue.slice(start), maxWidth, "…");
    return {
      text,
      cursorWidth: stringWidth(displayBefore.slice(start))
    };
  }

  handleData(data) {
    if (this.picker) {
      this.handlePickerData(data);
      return;
    }
    if (data.startsWith("\x1b[200~") && data.endsWith("\x1b[201~")) {
      const pasted = data.slice(6, -6).replace(/\r\n?/g, "\n");
      this.insertText(pasted);
      return;
    }
    for (let index = 0; index < data.length;) {
      const rest = data.slice(index);
      const sequence = ["\x1b[5~", "\x1b[6~", "\x1b[3~", "\x1b[A", "\x1b[B", "\x1b[C", "\x1b[D", "\x1b[H", "\x1b[F"]
        .find((candidate) => rest.startsWith(candidate));
      if (sequence) {
        this.handleSequence(sequence);
        index += sequence.length;
        continue;
      }
      const char = data[index];
      if (char === "\x03") {
        if (this.status.kind === "running" || this.status.kind === "waiting") this.callbacks.cancel();
        else this.callbacks.exit();
      } else if (char === "\x1b") {
        if (this.status.kind === "running" || this.status.kind === "waiting") this.callbacks.cancel();
        else {
          this.input = "";
          this.cursor = 0;
          this.scheduleRender();
        }
      } else if (char === "\r") {
        this.submitInput();
      } else if (char === "\n") {
        this.insertText("\n");
      } else if (char === "\x7f" || char === "\b") {
        const previous = previousIndex(this.input, this.cursor);
        this.input = this.input.slice(0, previous) + this.input.slice(this.cursor);
        this.cursor = previous;
        this.scheduleRender();
      } else if (char === "\x15") {
        this.input = "";
        this.cursor = 0;
        this.scheduleRender();
      } else if (char === "\t") {
        this.toggleView();
      } else if (char === "\x12") {
        Promise.resolve(this.callbacks.sessions()).catch((error) => {
          this.addEntry({ kind: "error", text: error instanceof Error ? error.message : String(error) });
        });
      } else if (char === "\x0c") {
        this.render();
      } else if (char >= " " && char !== "\x7f") {
        const point = data.codePointAt(index);
        const text = String.fromCodePoint(point);
        this.insertText(text);
        index += text.length;
        continue;
      }
      index += 1;
    }
  }

  handlePickerData(data) {
    for (let index = 0; index < data.length;) {
      const rest = data.slice(index);
      const sequence = ["\x1b[5~", "\x1b[6~", "\x1b[A", "\x1b[B", "\x1b[H", "\x1b[F"]
        .find((candidate) => rest.startsWith(candidate));
      if (sequence) {
        const items = this.pickerItems();
        if (sequence === "\x1b[A") this.picker.selected = Math.max(0, this.picker.selected - 1);
        else if (sequence === "\x1b[B") this.picker.selected = Math.min(Math.max(0, items.length - 1), this.picker.selected + 1);
        else if (sequence === "\x1b[5~") this.picker.selected = Math.max(0, this.picker.selected - 5);
        else if (sequence === "\x1b[6~") this.picker.selected = Math.min(Math.max(0, items.length - 1), this.picker.selected + 5);
        else if (sequence === "\x1b[H") this.picker.selected = 0;
        else if (sequence === "\x1b[F") this.picker.selected = Math.max(0, items.length - 1);
        index += sequence.length;
        this.scheduleRender();
        continue;
      }
      const char = data[index];
      if (char === "\r") {
        const items = this.pickerItems();
        this.closePicker(items[this.picker.selected]?.value);
      } else if (char === "\x1b" || char === "\x03") {
        this.closePicker(undefined);
      } else if (char === "\x7f" || char === "\b") {
        const chars = [...this.picker.query];
        chars.pop();
        this.picker.query = chars.join("");
        this.picker.selected = 0;
        this.scheduleRender();
      } else if (char === "\x15") {
        this.picker.query = "";
        this.picker.selected = 0;
        this.scheduleRender();
      } else if (char >= " " && char !== "\x7f") {
        const point = data.codePointAt(index);
        const text = String.fromCodePoint(point);
        this.picker.query += text;
        this.picker.selected = 0;
        this.scheduleRender();
        index += text.length;
        continue;
      }
      index += 1;
      if (!this.picker) return;
    }
  }

  handleSequence(sequence) {
    if (sequence === "\x1b[D") this.cursor = previousIndex(this.input, this.cursor);
    else if (sequence === "\x1b[C") this.cursor = nextIndex(this.input, this.cursor);
    else if (sequence === "\x1b[H") this.cursor = 0;
    else if (sequence === "\x1b[F") this.cursor = this.input.length;
    else if (sequence === "\x1b[3~") {
      const next = nextIndex(this.input, this.cursor);
      this.input = this.input.slice(0, this.cursor) + this.input.slice(next);
    } else if (sequence === "\x1b[5~") this.scrollOffset += 8;
    else if (sequence === "\x1b[6~") this.scrollOffset = Math.max(0, this.scrollOffset - 8);
    else if (sequence === "\x1b[A") this.recallHistory(-1);
    else if (sequence === "\x1b[B") this.recallHistory(1);
    this.scheduleRender();
  }

  recallHistory(direction) {
    if (this.interaction || this.inputHistory.length === 0) return;
    this.historyIndex = Math.max(0, Math.min(this.inputHistory.length, this.historyIndex + direction));
    this.input = this.historyIndex === this.inputHistory.length ? "" : this.inputHistory[this.historyIndex];
    this.cursor = this.input.length;
  }

  insertText(text) {
    this.input = this.input.slice(0, this.cursor) + text + this.input.slice(this.cursor);
    this.cursor += text.length;
    this.scheduleRender();
  }

  submitInput() {
    const value = this.input.trim();
    this.input = "";
    this.cursor = 0;
    if (value === "") {
      this.scheduleRender();
      return;
    }
    if (this.interaction) {
      let result;
      try {
        result = this.interaction.validate(value);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      if (result?.error) {
        this.interaction.error = result.error;
        this.scheduleRender();
        return;
      }
      this.resolveInteraction(result?.value);
      return;
    }
    this.inputHistory.push(value);
    this.inputHistory = this.inputHistory.slice(-80);
    this.historyIndex = this.inputHistory.length;
    Promise.resolve(this.callbacks.submit(value)).catch((error) => {
      this.addEntry({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    });
  }

  ask(spec) {
    return new Promise((resolve, reject) => {
      const item = { ...spec, resolve, reject, abort: undefined };
      if (spec.signal?.aborted) {
        if ("abortValue" in spec) resolve(spec.abortValue);
        else reject(spec.signal.reason ?? new Error("交互已取消"));
        return;
      }
      if (spec.signal) {
        item.abort = () => {
          if (this.interaction === item) {
            this.interaction = undefined;
            this.restoreStatusAfterInteraction(item);
            this.pumpInteractions();
          } else {
            this.interactionQueue = this.interactionQueue.filter((candidate) => candidate !== item);
          }
          if ("abortValue" in item) resolve(item.abortValue);
          else reject(spec.signal.reason ?? new Error("交互已取消"));
        };
        spec.signal.addEventListener("abort", item.abort, { once: true });
      }
      this.interactionQueue.push(item);
      this.pumpInteractions();
    });
  }

  pumpInteractions() {
    if (this.interaction || this.interactionQueue.length === 0) {
      this.scheduleRender();
      return;
    }
    const next = this.interactionQueue.shift();
    next.previousStatus = this.status;
    this.interaction = next;
    this.input = "";
    this.cursor = 0;
    this.setStatus("waiting");
  }

  resolveInteraction(value) {
    const current = this.interaction;
    if (!current) return;
    this.interaction = undefined;
    if (current.signal && current.abort) current.signal.removeEventListener("abort", current.abort);
    this.restoreStatusAfterInteraction(current);
    current.resolve(value);
    this.pumpInteractions();
  }

  restoreStatusAfterInteraction(item) {
    this.status = item.previousStatus?.kind === "waiting" ? { kind: "running", detail: "" } : (item.previousStatus ?? { kind: "idle", detail: "" });
    this.scheduleRender();
  }

  finishInteractions(error) {
    const all = [this.interaction, ...this.interactionQueue].filter(Boolean);
    this.interaction = undefined;
    this.interactionQueue = [];
    for (const item of all) {
      if (item.signal && item.abort) item.signal.removeEventListener("abort", item.abort);
      item.reject(error);
    }
  }
}

export function seedSnapshot(ui) {
  ui.setMeta({
    title: "Whale Mist TUI 预览",
    cwd: "F:\\deepseekharness",
    sessionId: "session-preview",
    model: "deepseek-official / deepseek-v4-flash"
  });
  ui.addEntry({ kind: "user", channel: "both", text: "检查这个项目，并告诉我接下来最值得处理的部分。" });
  ui.addEntry({ kind: "reasoning", text: "我先读取项目结构，再检查可运行的测试和现有插件边界。" });
  ui.addEntry({ kind: "tool", text: "read  dsh-whale-tui/src/index.js" });
  ui.addEntry({ kind: "assistant", channel: "both", text: "TUI 已经直接接入 Harness Agent。下一步可以完善会话选择器和独立轨迹视图。" });
  ui.setStatus("waiting");
}
