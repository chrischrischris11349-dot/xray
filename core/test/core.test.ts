// Exercises the webpack hook against a trimmed copy of webpack 5's JSONP loader,
// the patcher, Fake Deafen and Clean Links. Run with `npm test`.
import { cleanContent, cleanUrl } from "../src/plugins/cleanLinks";
import { filters, find, findByCode, hookWebpack, waitFor, webpackStats } from "../src/webpack";
import { patch } from "../src/patcher";
import fakeDeafen, { fakeVoice } from "../src/plugins/fakeDeafen";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : " -> " + JSON.stringify(detail)}`);
}

// ---- webpack hook ----
hookWebpack();
const w = globalThis as any;

// Discord's first chunk arrives before the runtime boots.
(w.webpackChunkdiscord_app = w.webpackChunkdiscord_app || []).push([
  [1],
  {
    10: (module: any) => { module.exports = { sendMessage() {}, editMessage() {} }; },
  },
]);

let waited: any;
waitFor(filters.byStoreName("UserStore"), (store) => { waited = store; });

// A trimmed copy of webpack 5's runtime: module table, require, JSONP callback.
// Discord runs two of these on the same chunk array, so the test does too.
const chunksSeen: Record<string, number[]> = { main: [], wasm: [] };
function runtime(name: "main" | "wasm") {
  const modules: Record<string, Function> = {};
  const cache: Record<string, any> = {};
  function require(id: string) {
    if (cache[id]) return cache[id].exports;
    const module = (cache[id] = { exports: {} });
    modules[id].call(module.exports, module, module.exports, require);
    return module.exports;
  }
  const installed: Record<string, number> = {};
  const jsonp = (parent: Function, data: any[]) => {
    const [ids, more, rt] = data;
    if (ids.some((id: any) => installed[id] !== 0)) {
      chunksSeen[name].push(...ids);
      for (const id in more) modules[id] = more[id];
      if (rt && name === "main") rt(require);
    }
    if (parent) parent(data);
    for (const id of ids) installed[id] = 0;
  };
  const global = (w.webpackChunkdiscord_app = w.webpackChunkdiscord_app || []);
  global.forEach(jsonp.bind(null, 0 as any));
  global.push = jsonp.bind(null, global.push.bind(global));
}
runtime("main");
runtime("wasm");

// A later chunk, pushed after the runtime took over, with an entry that runs modules.
w.webpackChunkdiscord_app.push([
  [2],
  {
    20: (module: any) => {
      module.exports = { Z: { getName: () => "UserStore", addChangeListener() {}, getCurrentUser: () => ({ id: "1" }) } };
    },
    30: (module: any) => { module.exports = function special() { return "needle-xyz"; }; },
  },
  (req: any) => { req(10); req(20); },
]);

const stats = webpackStats();
check("require captured", stats.require, stats);
check("two modules loaded, three factories seen", stats.loaded === 2 && stats.factories === 3, stats);
check("chunk array still holds both chunks", w.webpackChunkdiscord_app.length === 2, w.webpackChunkdiscord_app.length);
check("both runtimes received the later chunk", chunksSeen.main.includes(2) && chunksSeen.wasm.includes(2), chunksSeen);
check("find byProps", typeof find(filters.byProps("sendMessage", "editMessage"))?.sendMessage === "function");
check("waitFor resolved a store exported under a mangled key", waited?.getName?.() === "UserStore");
check("findByCode loads an unloaded module", findByCode("needle-xyz")?.() === "needle-xyz");
check("factory toString still shows Discord's source", String(w.webpackChunkdiscord_app[1][1][30]).includes("needle-xyz"));

// ---- patcher ----
const target = { add(a: number, b: number) { return a + b; } };
const originalAdd = target.add;
const undoBefore = patch(target, "add", { before: (_s, args) => { args[0] = 10; } });
const undoAfter = patch(target, "add", { after: (_s, _a, r) => r * 2 });
check("before + after stack", target.add(1, 2) === 24, target.add(1, 2));
undoBefore();
check("undo removes only its patch", target.add(1, 2) === 6, target.add(1, 2));
undoAfter();
check("last undo restores the original", target.add === originalAdd && target.add(1, 2) === 3);
patch(target, "add", { before() { throw new Error("boom"); } });
check("a throwing patch doesn't break the call", target.add(1, 2) === 3);

// ---- Fake Deafen (WebSocket is the stub from run.mjs) ----
const stops: (() => void)[] = [];
fakeDeafen.start({ patch: (t, k, hooks) => { stops.push(patch(t, k, hooks)); }, onStop: (fn) => { stops.push(fn); }, log() {} });
type Sock = WebSocket & { sent: string[] };
const gateway = new WebSocket("wss://gateway-us-east1-b.discord.gg/?encoding=json&v=9") as Sock;
const other = new WebSocket("wss://example.com/socket") as Sock;
const voice = (mute: boolean) => JSON.stringify({ op: 4, d: { guild_id: "1", channel_id: "2", self_mute: mute, self_deaf: false } });
const sentState = (ws: Sock, i: number) => JSON.parse(ws.sent[i]).d;

gateway.send(voice(false));
check("voice update passes through while not faking", sentState(gateway, 0).self_deaf === false);
fakeVoice.set(true);
check("turning on resends the state as deafened", gateway.sent.length === 2 && sentState(gateway, 1).self_deaf === true && sentState(gateway, 1).self_mute === true, gateway.sent);
gateway.send(voice(false));
check("later updates are rewritten while faking", sentState(gateway, 2).self_deaf === true && sentState(gateway, 2).self_mute === true);
gateway.send(JSON.stringify({ op: 1, d: 42 }));
check("other gateway messages are untouched", gateway.sent[3] === JSON.stringify({ op: 1, d: 42 }));
other.send(voice(false));
check("non-gateway sockets are untouched", sentState(other, 0).self_deaf === false);
fakeVoice.set(false);
check("turning off resends the real state", sentState(gateway, 4).self_deaf === false && sentState(gateway, 4).self_mute === false, gateway.sent[4]);
stops.reverse().forEach((stop) => stop());
gateway.send(voice(false));
check("stopping the plugin unpatches send", gateway.sent.length === 6);

// ---- Clean Links ----
const cases: [string, string][] = [
  ["https://example.com/a?utm_source=x&id=5", "https://example.com/a?id=5"],
  ["https://youtu.be/abc?si=TRACK&t=42", "https://youtu.be/abc?t=42"],
  ["https://example.com/watch?t=42&si=keep", "https://example.com/watch?t=42&si=keep"],
  ["https://x.com/user/status/1?s=20&t=abc", "https://x.com/user/status/1"],
  ["https://www.amazon.co.uk/dp/B0?ref_=x&psc=1", "https://www.amazon.co.uk/dp/B0?psc=1"],
  ["https://example.com/plain", "https://example.com/plain"],
];
for (const [input, want] of cases) check(`cleanUrl ${input}`, cleanUrl(input) === want, cleanUrl(input));
check("trailing punctuation kept", cleanContent("see https://a.com/?fbclid=1.") === "see https://a.com/.", cleanContent("see https://a.com/?fbclid=1."));
check("code blocks untouched", cleanContent("`https://a.com/?fbclid=1` and https://a.com/?fbclid=1") === "`https://a.com/?fbclid=1` and https://a.com/", cleanContent("`https://a.com/?fbclid=1` and https://a.com/?fbclid=1"));

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
