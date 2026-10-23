import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
const template = readFileSync("core/installer-bootstrap.js", "utf8");
const selection = { fingerprint: "fixture", coreIds: ["fakeDeafen", "twin"], choices: { "xray:fakeDeafen": true, "equicord:FakeDM": false, "feature:quickReply": true } };
const script = template.replace("/*XRAY_SELECTION*/null", JSON.stringify(selection));
function harness(initial = {}, failWrite = "") {
  const values = new Map(Object.entries(initial)); let writes = 0, failures = 0;
  const localStorage = { getItem(key) { return values.get(key) ?? null; }, removeItem(key) { values.delete(key); }, setItem(key, value) {
    if (key === failWrite && failures++ === 0) throw new Error("storage unavailable");
    writes++; values.set(key, value);
  } };
  const window = {}; window.top = window;
  const context = { window, localStorage, console: { warn() {} } };
  return { values, context, run: () => runInNewContext(script, context), writes: () => writes };
}
test("installer choices merge settings once before plugin startup", () => {
  const h = harness({ "xray.settings": JSON.stringify({ plugins: { fakeDeafen: { options: { shortcut: false } }, twin: { enabled: true } }, theme: false }), "EquicordSettings": JSON.stringify(JSON.stringify({ plugins: { FakeDM: { enabled: true, savedOption: 1 } }, language: "en" })) });
  h.run();
  const core = JSON.parse(h.values.get("xray.settings"));
  assert.equal(core.plugins.fakeDeafen.enabled, true); assert.equal(core.plugins.fakeDeafen.options.shortcut, false);
  assert.equal(core.plugins.twin.enabled, false); assert.equal(core.plugins.twin.handedToEquicord, true);
  assert.equal(core.features.quickReply, true); assert.equal(core.pickedPlugins, true); assert.equal(core.theme, false);
  const eq = JSON.parse(h.values.get("EquicordSettings"));
  assert.equal(eq.plugins.FakeDM.enabled, false); assert.equal(eq.plugins.FakeDM.savedOption, 1); assert.equal(eq.language, "en");
  const writes = h.writes(); h.run(); assert.equal(h.writes(), writes);
});
test("installer bootstrap rolls back partial writes and tolerates blocked storage", () => {
  const initial = { "xray.settings": '{"plugins":{},"theme":false}', "EquicordSettings": '{"plugins":{}}' };
  const h = harness(initial, "EquicordSettings"); h.run();
  assert.deepEqual(Object.fromEntries(h.values), initial);
  const blocked = harness(); blocked.context.localStorage.getItem = () => { throw new Error("denied"); };
  assert.doesNotThrow(blocked.run);
  const malformed = harness({ "xray.settings": "{broken" }); malformed.run();
  assert.equal(malformed.values.get("xray.settings"), "{broken"); assert.equal(malformed.values.has("xray.installerSelection"), false);
});
