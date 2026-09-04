import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import {
  FOCUS_PATCH_MARKER,
  patchNotificationClient,
} from "../scripts/apply-notification-desktop-bridge.mjs";

const fixture = `
const first = shouldShow(permission, current.backgroundOnly, document.hidden, id, state.current);
const second = shouldShow(permission, current.backgroundOnly, document.hidden, id, state.current);
`;
const firstPass = patchNotificationClient(fixture, "fixture/client.js");
assert.equal(firstPass.changed, true);
assert.match(firstPass.content, new RegExp(FOCUS_PATCH_MARKER));
assert.equal((firstPass.content.match(/document\.hidden \|\| !document\.hasFocus\(\)/g) ?? []).length, 2);

const secondPass = patchNotificationClient(firstPass.content, "fixture/client.js");
assert.equal(secondPass.changed, false);
assert.equal(secondPass.content, firstPass.content);
assert.throws(
  () => patchNotificationClient("const changedUpstream = true;", "fixture/client.js"),
  /unsupported dsh-notification client shape/,
);

class FakeStorage {
  #values = new Map();

  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.get(String(key)) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
}

const bootstrapTemplate = readFileSync(
  new URL("../src-tauri/src/notification-settings-bridge.js", import.meta.url),
  "utf8",
);
const initial = {
  "dsh-notification.v4": JSON.stringify({ enabled: true, backgroundOnly: false }),
};
const script = bootstrapTemplate.replace(
  "__WHALE_INITIAL_NOTIFICATION_SETTINGS__",
  JSON.stringify(initial),
);
const localStorage = new FakeStorage();
localStorage.setItem("dsh-notification.v3", JSON.stringify({ enabled: false }));
const messages = [];
const window = {
  localStorage,
  chrome: { webview: { postMessage: (message) => messages.push(message) } },
};
runInNewContext(script, { console, Storage: FakeStorage, localStorage, window });

assert.equal(localStorage.getItem("dsh-notification.v4"), initial["dsh-notification.v4"]);
assert.ok(messages.some((message) => message.includes('"key":"dsh-notification.v3"')));
localStorage.setItem("dsh-notification.v5", JSON.stringify({ enabled: true }));
assert.ok(messages.some((message) => message.includes('"key":"dsh-notification.v5"')));
const capturedCount = messages.length;
localStorage.setItem("unrelated-setting", "ignored");
assert.equal(messages.length, capturedCount);

process.stdout.write("notification desktop bridge regression: OK\n");
