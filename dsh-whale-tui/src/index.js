import { randomUUID } from "node:crypto";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { HELP_TEXT, parseArguments } from "./arguments.js";
import { WhaleTerminalUI, seedSnapshot } from "./terminal.js";

export const name = "whale-tui";
export const inject = [
  "agentDefaultModel",
  "agents",
  "sessions",
  "sessionPersistence",
  "approval",
  "userQuestions"
];

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function debug(message) {
  if (process.env.DSH_WHALE_TUI_DEBUG === "1") process.stderr.write(`[whale-tui] ${message}\n`);
}

function shorten(value, limit = 360) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function contentText(content, wanted = "text") {
  const parts = [];
  for (const block of content ?? []) {
    if (block?.type === wanted && typeof block.text === "string") parts.push(block.text);
    else if (block?.type === "image" && wanted === "text") parts.push(`[图片: ${block.name ?? block.mediaType ?? "image"}]`);
    else if (block?.type === "tool-result" && wanted === "text") parts.push(contentText(block.content, "text"));
  }
  return parts.join("");
}

function toolResultText(message) {
  const block = message?.content?.find((candidate) => candidate.type === "tool-result");
  return shorten(contentText(block?.content ?? [], "text"), 420);
}

function toolArguments(value) {
  try {
    return shorten(JSON.stringify(JSON.parse(value)), 260);
  } catch {
    return shorten(value, 260);
  }
}

function selectionFromConfig(config) {
  if (!config?.provider || !config?.model) return undefined;
  return {
    provider: config.provider,
    model: config.model,
    ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {})
  };
}

function modelLabel(selection) {
  if (!selection) return "未选择模型";
  return `${selection.provider} / ${selection.model}${selection.reasoningEffort ? ` / ${selection.reasoningEffort}` : ""}`;
}

function sessionTitle(events) {
  return [...events].reverse().find((event) => event.type === "session/title")?.data?.title;
}

function sessionDisplayTitle(events) {
  const title = sessionTitle(events);
  if (title) return title;
  const firstUserMessage = events.find((event) => event.type === "user/message" && event.data?.source?.kind === "user");
  const text = contentText(firstUserMessage?.data?.content, "text");
  return text ? shorten(text, 42) : "未命名会话";
}

function sessionTime(createdAt) {
  const delta = Math.max(0, Date.now() - Number(createdAt ?? 0));
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(createdAt));
}

function makeSelectionRef(agent, defaultModel, initialSelection) {
  let picked = initialSelection;
  const ref = {
    get current() {
      if (picked) return picked;
      return selectionFromConfig(agent.session.requestHeader()?.config) ?? defaultModel.currentSelection();
    },
    set current(next) {
      picked = next;
    },
    assembled: undefined
  };
  return ref;
}

function approvalValidation(value) {
  const normalized = value.trim().toLowerCase();
  if (["y", "yes", "允许", "是", "1"].includes(normalized)) return { value: "allowed-once" };
  if (["n", "no", "拒绝", "否", "2"].includes(normalized)) return { value: "rejected" };
  return { error: "请输入 y（仅本次允许）或 n（拒绝）" };
}

function questionValidation(question, value) {
  if (value === "-") return { value: { id: question.id, selected: [] } };
  const options = question.options ?? [];
  if (question.intent?.kind === "plan-review") {
    const normalized = value.toLowerCase();
    if (["y", "yes", "允许", "批准", "1"].includes(normalized)) {
      return { value: { id: question.id, selected: [question.intent.approve] } };
    }
    if (["n", "no", "拒绝", "否"].includes(normalized)) {
      const declined = options.find((option) => option.label !== question.intent.approve);
      return { value: { id: question.id, selected: declined ? [declined.label] : [] } };
    }
  }
  if (options.length === 0) return { value: { id: question.id, selected: [], custom: value } };

  const tokens = question.multiSelect ? value.split(",").map((item) => item.trim()).filter(Boolean) : [value.trim()];
  const selected = [];
  const custom = [];
  for (const token of tokens) {
    const numeric = Number.parseInt(token, 10);
    const match = Number.isInteger(numeric) && String(numeric) === token
      ? options[numeric - 1]
      : options.find((option) => option.label.toLowerCase() === token.toLowerCase());
    if (match) selected.push(match.label);
    else custom.push(token);
  }
  if (!question.multiSelect && selected.length + custom.length !== 1) {
    return { error: "请选择一个序号，或输入自定义回答" };
  }
  return {
    value: {
      id: question.id,
      selected: [...new Set(selected)],
      ...(custom.length > 0 ? { custom: custom.join(question.multiSelect ? ", " : "") } : {})
    }
  };
}

class WhaleTuiController {
  constructor(ctx, options, exit) {
    this.ctx = ctx;
    this.options = options;
    this.exit = exit;
    this.ui = new WhaleTerminalUI({ alternateScreen: options.alternateScreen });
    this.handle = undefined;
    this.agent = undefined;
    this.selectionRef = undefined;
    this.lastSeq = -1;
    this.exiting = false;
    this.disposed = false;
    this.completionTimer = undefined;
    this.initialSelection = options.provider && options.model ? {
      provider: options.provider,
      model: options.model,
      ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {})
    } : undefined;

    this.ui.setCallbacks({
      submit: (value) => this.submit(value),
      cancel: () => this.cancel(),
      exit: () => this.shutdown(0),
      sessions: () => this.openSessionPicker()
    });

    this.offSession = ctx.on("session/event", (session, event) => {
      if (session === this.agent?.session) this.acceptEvent(event);
    });
    this.offStatus = ctx.on("agent/status", ({ agent, status }) => {
      if (agent !== this.agent) return;
      windowClearTimeout(this.completionTimer);
      if (status === "running") {
        this.ui.setStatus("running");
      } else {
        this.ui.setStatus("complete");
        this.completionTimer = setTimeout(() => {
          if (this.agent?.status === "idle" && !this.ui.interaction) this.ui.setStatus("idle");
        }, 1300);
      }
    });
    this.offApproval = ctx.on("approval/request", async (request, next) => {
      if (request.agent !== this.agent) return next();
      return this.answerApproval(request);
    });
    this.offQuestions = ctx.userQuestions.registerProvider({
      ask: (request) => this.answerQuestions(request)
    });
  }

  async start() {
    await this.ctx.get("loader")?.await();
    debug(`start ${JSON.stringify(this.options)}`);
    if (this.options.check) {
      const selection = this.ctx.agentDefaultModel.currentSelection();
      const sessions = await this.ctx.sessionPersistence.list();
      process.stdout.write(`Whale TUI check: OK\nmodel: ${modelLabel(selection)}\npersisted sessions: ${sessions.length}\n`);
      this.exit(0);
      return;
    }
    if (this.options.snapshot) {
      seedSnapshot(this.ui);
      process.stdout.write(`${this.ui.snapshot(100, 30)}\n`);
      this.exit(0);
      return;
    }
    if (this.options.sessionsSnapshot) {
      this.ui.setMeta({ model: modelLabel(this.ctx.agentDefaultModel.currentSelection()) });
      void this.ui.pick({
        title: "选择会话",
        items: await this.sessionPickerItems(),
        emptyText: "没有匹配的持久化会话"
      });
      process.stdout.write(`${this.ui.snapshot(100, 30)}\n`);
      this.ui.closePicker(undefined);
      this.exit(0);
      return;
    }

    const resumeId = await this.resolveResumeId(this.options.resume);
    await this.activateSession(resumeId);
    debug("session ready");
    this.ui.open();
    debug("ui open");
    if (this.options.initialPrompt) {
      debug(`initial prompt ${JSON.stringify(this.options.initialPrompt)}`);
      await this.submit(this.options.initialPrompt);
    }
  }

  async resolveResumeId(requested) {
    if (!requested) return undefined;
    if (requested !== "latest") return SessionId(requested);
    const headers = await this.ctx.sessionPersistence.list();
    const latest = [...headers].sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))[0];
    if (!latest) throw new Error("没有可恢复的持久化会话");
    return latest.id;
  }

  async activateSession(resumeId) {
    if (this.agent?.status === "running") throw new Error("请先停止当前任务，再切换会话");
    if (this.handle) {
      await settleWithin(this.ctx.sessions.flush(this.agent.session), 4_000).catch(() => {});
      await settleWithin(this.handle.dispose(), 5_000).catch(() => {});
    }
    this.handle = undefined;
    this.agent = undefined;
    this.selectionRef = undefined;
    this.lastSeq = -1;
    windowClearTimeout(this.completionTimer);

    const defaultSelection = this.ctx.agentDefaultModel.currentSelection();
    const initial = this.initialSelection ?? defaultSelection;
    let installedRef;
    const setup = (agentCtx) => {
      const scopedAgent = agentCtx.agent;
      if (!scopedAgent) throw new Error("Whale TUI 无法取得 Agent 作用域");
      installedRef = makeSelectionRef(scopedAgent, this.ctx.agentDefaultModel, this.initialSelection);
      installModelSelection(agentCtx, installedRef);
    };
    const handle = resumeId
      ? await this.ctx.agents.resume({
          resumeSessionId: resumeId,
          agentOptions: { provider: defaultSelection.provider, model: defaultSelection.model },
          setup
        })
      : await this.ctx.agents.create({
          sessionId: SessionId(`session-${randomUUID()}`),
          meta: { cwd: process.cwd() },
          agentOptions: { provider: initial.provider, model: initial.model },
          setup
        });

    this.handle = handle;
    this.agent = handle.agent;
    this.selectionRef = installedRef;
    this.initialSelection = undefined;
    this.ui.clearEntries();
    this.replaySession();
    this.ui.setMeta({
      title: resumeId ? sessionDisplayTitle(this.agent.session.events) : "新会话",
      cwd: this.agent.session.header.cwd ?? process.cwd(),
      sessionId: this.agent.id,
      model: modelLabel(this.selectionRef.current)
    });
    this.ui.setStatus(this.agent.status === "running" ? "running" : "idle");
    if (resumeId) this.ui.addEntry({ kind: "notice", text: `已恢复会话 ${resumeId}` });
  }

  async sessionPickerItems() {
    const headers = [...await this.ctx.sessionPersistence.list()]
      .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
      .slice(0, 40);
    const items = await Promise.all(headers.map(async (header) => {
      let title;
      try {
        title = sessionDisplayTitle((await this.ctx.sessionPersistence.inspect(header.id)).events);
      } catch {}
      const current = header.id === this.agent?.id;
      return {
        value: header.id,
        label: `${current ? "● " : ""}${title ?? "未命名会话"}`,
        description: `${sessionTime(header.createdAt)}  ·  ${header.cwd ?? "未知工作区"}  ·  ${header.id}`
      };
    }));
    return items;
  }

  async openSessionPicker() {
    if (!this.agent) throw new Error("会话尚未就绪");
    if (this.agent.status === "running") throw new Error("请先停止当前任务，再切换会话");
    const items = await this.sessionPickerItems();
    const selected = await this.ui.pick({
      title: "选择会话",
      items,
      emptyText: "没有匹配的持久化会话"
    });
    if (!selected || selected === this.agent.id) return;
    await this.activateSession(SessionId(selected));
  }

  replaySession() {
    this.lastSeq = -1;
    for (const event of this.agent.session.events) this.acceptEvent(event);
  }

  acceptEvent(event) {
    if (event.seq <= this.lastSeq) return;
    this.lastSeq = event.seq;
    const data = event.data;
    if (event.type === "user/message") {
      const text = contentText(data.content, "text");
      if (text) this.ui.addEntry({
        id: `message-${data.id}`,
        kind: data.source?.kind === "user" ? "user" : "notice",
        label: data.source?.kind === "user" ? undefined : "上下文",
        channel: data.source?.kind === "user" ? "both" : "conversation",
        text
      });
    } else if (event.type === "turn/start") {
      this.ui.addEntry({ id: `turn-${data.turn}-start`, kind: "notice", label: "轮次", channel: "trajectory", text: `第 ${data.turn} 轮开始` });
    } else if (event.type === "step/start") {
      this.ui.addEntry({ id: `turn-${data.turn}-step-${data.step}`, kind: "notice", label: "步骤", channel: "trajectory", text: `第 ${data.turn} 轮 · 步骤 ${data.step}` });
    } else if (event.type === "step/end") {
      this.ui.addEntry({ id: `turn-${data.turn}-step-${data.step}-end`, kind: "success", label: "步骤", channel: "trajectory", text: `第 ${data.turn} 轮 · 步骤 ${data.step} 完成` });
    } else if (event.type === "assistant/chunk") {
      const chunk = data.chunk;
      if (chunk.type === "text-delta") {
        const id = `assistant-${data.turn}-${data.step}`;
        if (this.ui.entryIndex.has(id)) this.ui.appendEntry(id, chunk.text);
        else this.ui.addEntry({ id, kind: "assistant", channel: "both", text: chunk.text });
      } else if (chunk.type === "reasoning-delta") {
        const id = `reasoning-${data.turn}-${data.step}`;
        if (this.ui.entryIndex.has(id)) this.ui.appendEntry(id, chunk.text);
        else this.ui.addEntry({ id, kind: "reasoning", channel: "trajectory", text: chunk.text });
      }
    } else if (event.type === "assistant/message") {
      const text = contentText(data.message.content, "text");
      const reasoning = contentText(data.message.content, "reasoning");
      if (reasoning) this.ui.addEntry({ id: `reasoning-${data.turn}-${data.step}`, kind: "reasoning", channel: "trajectory", text: reasoning });
      if (text) this.ui.addEntry({ id: `assistant-${data.turn}-${data.step}`, kind: "assistant", channel: "both", text });
    } else if (event.type === "tool/call") {
      const args = toolArguments(data.arguments);
      this.ui.addEntry({
        id: `tool-${data.callId}`,
        kind: "tool",
        channel: "trajectory",
        text: `${data.name}${args ? `  ${args}` : ""}`
      });
    } else if (event.type === "tool/result") {
      const id = `tool-${data.message?.source?.callId ?? data.message?.content?.[0]?.toolCallId ?? "unknown"}`;
      const index = this.ui.entryIndex.get(id);
      const result = toolResultText(data.message);
      const suffix = `${data.error ? `  ✕ ${data.error.code}` : "  ✓"}${result ? `  ${result}` : ""}`;
      if (index === undefined) this.ui.addEntry({ id, kind: data.error ? "error" : "tool", channel: "trajectory", text: suffix.trim() });
      else this.ui.addEntry({ ...this.ui.entries[index], id, kind: data.error ? "error" : "tool", text: `${this.ui.entries[index].text}${suffix}` });
    } else if (event.type === "turn/end") {
      const outcome = data.reason.kind === "completed" ? "完成" : data.reason.kind === "aborted" ? "已停止" : data.reason.kind === "max-tokens" ? "达到 token 上限" : data.reason.kind === "blocked" ? "已阻止" : data.reason.kind;
      this.ui.addEntry({ id: `turn-${data.turn}-end`, kind: data.reason.kind === "error" ? "error" : "success", label: "轮次", channel: "trajectory", text: `第 ${data.turn} 轮 · ${outcome}` });
      if (data.reason.kind === "error") this.ui.addEntry({ kind: "error", text: `${data.reason.error.code}: ${data.reason.error.message}` });
      else if (data.reason.kind === "aborted") this.ui.addEntry({ kind: "notice", text: "当前任务已停止" });
      else if (data.reason.kind === "max-tokens") this.ui.addEntry({ kind: "error", text: "模型输出已达到 token 上限" });
    } else if (event.type === "session/title") {
      this.ui.setMeta({ title: data.title });
    } else if (event.type === "request/header") {
      this.ui.setMeta({ model: modelLabel(selectionFromConfig(data.header?.config)) });
      this.ui.addEntry({ id: `request-${event.seq}`, kind: "notice", label: "模型", channel: "trajectory", text: `${modelLabel(selectionFromConfig(data.header?.config))}  ·  ${data.reason}` });
    } else if (event.type === "todo/write") {
      const text = data.todos.map((todo) => `${todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "●" : "○"} ${todo.content}`).join("\n");
      this.ui.addEntry({ id: "todo-current", kind: "notice", label: "计划", text });
    }
  }

  async submit(value) {
    if (value.startsWith("/")) {
      const handled = await this.command(value);
      if (handled) return;
    }
    if (!this.agent) throw new Error("会话尚未就绪");
    const message = createUserMessage({
      content: [{ type: "text", text: value }],
      source: { kind: "user" }
    });
    if (this.agent.status === "running") this.agent.steer(message);
    else this.agent.followup(message);
  }

  async command(value) {
    const [command, ...args] = value.trim().split(/\s+/);
    if (command === "/help") {
      this.ui.addEntry({ kind: "notice", text: "命令：/new、/resume <id>、/sessions、/model [provider model effort]、/clear、/exit\n运行中直接输入会作为 steering；Esc 可停止。" });
      return true;
    }
    if (command === "/clear") {
      this.ui.clearEntries();
      return true;
    }
    if (command === "/exit" || command === "/quit") {
      await this.shutdown(0);
      return true;
    }
    if (command === "/new") {
      await this.activateSession(undefined);
      this.ui.addEntry({ kind: "success", text: "已新建会话" });
      return true;
    }
    if (command === "/resume") {
      if (!args[0]) throw new Error("用法：/resume <会话ID>");
      await this.activateSession(await this.resolveResumeId(args[0]));
      return true;
    }
    if (command === "/sessions") {
      await this.openSessionPicker();
      return true;
    }
    if (command === "/model") {
      if (args.length === 0) {
        this.ui.addEntry({ kind: "notice", label: "模型", text: modelLabel(this.selectionRef?.current) });
        return true;
      }
      if (args.length < 2) throw new Error("用法：/model <provider> <model> [reasoning]");
      this.selectionRef.current = {
        provider: args[0],
        model: args[1],
        ...(args[2] ? { reasoningEffort: args[2] } : {})
      };
      this.ui.setMeta({ model: modelLabel(this.selectionRef.current) });
      this.ui.addEntry({ kind: "success", text: `后续步骤将使用 ${modelLabel(this.selectionRef.current)}` });
      return true;
    }
    return false;
  }

  cancel() {
    if (!this.agent || this.agent.status !== "running") return;
    this.agent.cancel({ kind: "user" }, { keepInbox: true });
    this.ui.addEntry({ kind: "notice", text: "正在停止当前任务…" });
  }

  async answerApproval(request) {
    const id = `approval-${Date.now()}-${Math.random()}`;
    this.ui.addEntry({
      id,
      kind: "notice",
      label: "审批",
      text: `${request.toolName}${request.reason ? `\n${request.reason}` : ""}`
    });
    const outcome = await this.ui.ask({
      title: `审批：${request.toolName}`,
      hint: "输入 y 仅本次允许，n 拒绝，然后 Enter",
      validate: approvalValidation,
      signal: request.signal,
      abortValue: "cancelled"
    });
    this.ui.addEntry({ id, kind: outcome === "allowed-once" ? "success" : "notice", label: "审批", text: `${request.toolName}\n${outcome === "allowed-once" ? "已允许一次" : outcome === "rejected" ? "已拒绝" : "已取消"}` });
    return outcome;
  }

  async answerQuestions(request) {
    if (request.agent && request.agent !== this.agent) throw new Error("当前 TUI 只回答根会话的问题");
    const answers = [];
    for (const question of request.questions) {
      const choices = (question.options ?? []).map((option, index) => `${index + 1}. ${option.label}${option.description ? ` — ${option.description}` : ""}`).join("\n");
      const detail = [question.header, question.question, question.detail, choices].filter(Boolean).join("\n");
      this.ui.addEntry({ kind: "notice", label: question.intent?.kind === "plan-review" ? "审阅" : "问题", text: detail });
      const answer = await this.ui.ask({
        title: question.question,
        hint: question.options?.length
          ? `${question.multiSelect ? "可用逗号多选；" : ""}输入序号、自定义回答，或 - 跳过`
          : "输入回答，然后 Enter",
        validate: (value) => questionValidation(question, value),
        signal: request.signal
      });
      answers.push(answer);
    }
    return { answers };
  }

  async shutdown(code) {
    if (this.exiting) return;
    this.exiting = true;
    debug("shutdown requested");
    this.ui.close();
    try {
      if (this.agent?.status === "running") this.agent.cancel({ kind: "user" });
      debug("waiting for idle");
      if (this.agent) await settleWithin(this.agent.whenIdle(), 4_000).catch(() => {});
      debug("flushing session");
      if (this.agent) await settleWithin(this.ctx.sessions.flush(this.agent.session), 4_000).catch(() => {});
    } finally {
      debug("requesting app exit");
      this.exit(code);
      // dsh rc.6 can synchronously stall while disposing a live direct Agent
      // on Windows. The terminal and durability barriers are already settled.
      if (process.platform === "win32") process.exit(code);
    }
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    windowClearTimeout(this.completionTimer);
    this.ui.close();
  }
}

function windowClearTimeout(timer) {
  if (timer !== undefined) clearTimeout(timer);
}

async function settleWithin(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("操作超时")), milliseconds);
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function apply(ctx) {
  const exit = ctx.get("appExit");
  const cmdline = ctx.get("cmdlineArgs");
  if (!exit || !cmdline) throw new Error("whale-tui: 必须通过 dsh 启动器运行");

  let options;
  try {
    options = parseArguments(cmdline.get());
  } catch (error) {
    process.stderr.write(`Whale TUI: ${errorText(error)}\n\n${HELP_TEXT}\n`);
    exit(2);
    return;
  }
  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    exit(0);
    return;
  }

  const controller = new WhaleTuiController(ctx, options, exit);
  ctx.effect(() => {
    controller.start().catch((error) => {
      controller.ui.close();
      process.stderr.write(`Whale TUI: ${errorText(error)}\n`);
      exit(1);
    });
    return () => controller.dispose();
  }, "whale-tui: interactive terminal lifecycle");
}
