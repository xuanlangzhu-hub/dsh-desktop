import assert from "node:assert/strict";

import { parseArguments } from "../src/arguments.js";
import {
  WhaleTerminalUI,
  clipWidth,
  seedSnapshot,
  stringWidth,
  stripAnsi,
  wrapText,
} from "../src/terminal.js";

const parsed = parseArguments([
  "--resume",
  "latest",
  "--provider",
  "deepseek",
  "--model",
  "deepseek-chat",
  "--reasoning",
  "high",
  "继续上次任务",
]);

assert.equal(parsed.resume, "latest");
assert.equal(parsed.provider, "deepseek");
assert.equal(parsed.model, "deepseek-chat");
assert.equal(parsed.reasoningEffort, "high");
assert.equal(parsed.initialPrompt, "继续上次任务");
assert.equal(parseArguments(["--sessions-snapshot"]).sessionsSnapshot, true);
assert.throws(() => parseArguments(["--provider", "deepseek"]), /必须一起使用/);
assert.throws(() => parseArguments(["--unknown"]), /未知选项/);

assert.equal(stripAnsi("\u001b[34m鲸鱼\u001b[0m"), "鲸鱼");
assert.equal(stringWidth("abc"), 3);
assert.equal(stringWidth("鲸鱼"), 4);
assert.equal(stringWidth("A鲸"), 3);
assert.equal(stringWidth(clipWidth("Whale 鲸鱼", 8)), 8);
assert.deepEqual(wrapText("一二三四五", 6), ["一二三", "四五"]);

const output = {
  isTTY: false,
  columns: 100,
  rows: 30,
  write() {},
};
const input = {
  isTTY: false,
  on() {},
  off() {},
  resume() {},
  pause() {},
};
const ui = new WhaleTerminalUI({ stdin: input, stdout: output, color: false, alternateScreen: false });
seedSnapshot(ui);
const snapshot = ui.snapshot(100, 30);
const lines = snapshot.split("\n");

assert.equal(lines.length, 30);
assert.match(lines[0], /WHALE TUI/);
assert.match(lines[0], /等待确认/);
assert.match(lines[1], /deepseek-official \/ deepseek-v4-flash/);
assert.match(snapshot, /TUI 已经直接接入 Harness Agent/);
assert.doesNotMatch(snapshot, /我先读取项目结构/);
assert.match(snapshot, /Enter 发送/);

for (const width of [44, 52, 60, 80, 100]) {
  for (const view of ["conversation", "trajectory"]) {
    ui.setView(view);
    for (const line of ui.snapshot(width, 18).split("\n")) {
      assert.ok(stringWidth(line) <= width, `${view} line exceeded ${width} columns`);
    }
  }
}

ui.setView("trajectory");
const trajectory = ui.snapshot(100, 30);
assert.match(trajectory, /我先读取项目结构/);
assert.match(trajectory, /read  dsh-whale-tui\/src\/index\.js/);
assert.match(trajectory, /TUI 已经直接接入 Harness Agent/);

const picked = ui.pick({
  title: "选择会话",
  items: [
    { value: "first", label: "第一个会话", description: "F:\\one" },
    { value: "second", label: "第二个会话", description: "F:\\two" },
  ],
});
assert.match(ui.snapshot(100, 30), /选择会话/);
for (const width of [44, 52, 80]) {
  for (const line of ui.snapshot(width, 18).split("\n")) assert.ok(stringWidth(line) <= width);
}
ui.handleData("\x1b[B\r");
assert.equal(await picked, "second");

let submitted = "";
let sessionsOpened = false;
let rawMode = false;
const ttyInput = {
  isTTY: true,
  setEncoding() {},
  setRawMode(value) { rawMode = value; },
  on() {},
  off() {},
  resume() {},
};
const ttyOutput = {
  isTTY: true,
  columns: 80,
  rows: 24,
  write() {},
  on() {},
  off() {},
};
const interactive = new WhaleTerminalUI({ stdin: ttyInput, stdout: ttyOutput, color: false, alternateScreen: false });
interactive.setCallbacks({
  submit: async (value) => { submitted = value; },
  sessions: async () => { sessionsOpened = true; },
});
interactive.open();
interactive.handleData("\t");
assert.equal(interactive.view, "trajectory");
interactive.handleData("\x12");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(sessionsOpened, true);
interactive.handleData("/exit\r");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(submitted, "/exit");
assert.equal(rawMode, true);
interactive.close();
assert.equal(rawMode, false);

console.log("Whale TUI unit checks passed.");
