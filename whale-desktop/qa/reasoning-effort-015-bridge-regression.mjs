import assert from "node:assert/strict";
import {
  REASONING_BRIDGE_MARKER,
  patchReasoningClient,
} from "../scripts/apply-reasoning-effort-015-bridge.mjs";

const fixture = `
var inject = ["slots", "modelDirectories", "connection", "locale"];
function apply(ctx) {
  const modelDirectories = ctx.get("modelDirectories");
  if (modelDirectories === void 0) return;
  ctx.slots.inject(SLOT, () => {
    return () => {};
  });
}

\t\treturn module.exports;
`;

const first = patchReasoningClient(fixture, "fixture.js");
assert.equal(first.changed, true);
assert.match(first.content, new RegExp(REASONING_BRIDGE_MARKER.replaceAll(".", "\\.")));
assert.match(first.content, /"remote\.session"/);
assert.match(first.content, /function applyReady\(ctx\)/);
assert.match(first.content, /ctx\.inject\(\["modelDirectories"\], \(scope\) => applyReady\(scope\)\)/);

const second = patchReasoningClient(first.content, "fixture.js");
assert.equal(second.changed, false);
assert.equal(second.content, first.content);

assert.throws(
  () => patchReasoningClient("function apply(ctx) {}", "drifted.js"),
  /unsupported dsh-reasoning-effort client shape/,
);

process.stdout.write("PASS reasoning-effort DSH 0.1.5 bridge regression\n");
