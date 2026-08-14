export const HELP_TEXT = `
Whale TUI — DeepSeek Harness 的终端界面

用法:
  dsh --profile tui [选项] [初始消息]

选项:
  --resume <会话ID>       恢复一个持久化会话（可用 latest）
  --provider <名称>       覆盖初始模型提供方
  --model <模型>          覆盖初始模型
  --reasoning <强度>      设置推理强度
  --no-alt-screen         不使用终端备用屏幕
  --check                 只检查运行环境后退出
  --snapshot              输出静态界面预览后退出
  --sessions-snapshot     输出真实会话选择器预览后退出
  -h, --help              显示帮助

界面快捷键:
  Enter                   发送；运行中发送会成为 steering
  Esc / Ctrl+C            停止当前任务；空闲时 Ctrl+C 退出
  PageUp / PageDown       滚动会话
  Tab                     切换对话 / 轨迹
  Ctrl+R                  打开会话选择器
  Ctrl+U                  清空输入

命令:
  /help                   显示界面命令
  /new                    新建会话
  /resume <会话ID>        切换到持久化会话
  /sessions               打开会话选择器
  /model [提供方 模型 [强度]]
  /clear                  清空当前终端显示
  /exit                   保存并退出
`.trim();

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} 需要一个值`);
  }
  return value;
}

export function parseArguments(argv) {
  const options = {
    resume: undefined,
    provider: undefined,
    model: undefined,
    reasoningEffort: undefined,
    alternateScreen: true,
    check: false,
    snapshot: false,
    sessionsSnapshot: false,
    help: false,
    initialPrompt: undefined
  };
  const prompt = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--resume") {
      options.resume = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--provider") {
      options.provider = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--model") {
      options.model = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--reasoning") {
      options.reasoningEffort = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--no-alt-screen") {
      options.alternateScreen = false;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--snapshot") {
      options.snapshot = true;
    } else if (arg === "--sessions-snapshot") {
      options.sessionsSnapshot = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`未知选项: ${arg}`);
    } else {
      prompt.push(arg);
    }
  }

  if (prompt.length > 0) options.initialPrompt = prompt.join(" ");
  if ((options.provider && !options.model) || (!options.provider && options.model)) {
    throw new Error("--provider 与 --model 必须一起使用");
  }
  return options;
}
