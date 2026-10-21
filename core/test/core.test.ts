// Exercises the webpack hook against a trimmed copy of webpack 5's JSONP loader,
// the patcher, Fake Deafen and Clean Links. Run with `npm test`.
import { cleanContent, cleanUrl } from "../src/plugins/cleanLinks";
import { filters, find, findByCode, hookWebpack, waitFor, webpackStats } from "../src/webpack";
import { patch } from "../src/patcher";
import fakeDeafen, { fakeVoice } from "../src/plugins/fakeDeafen";
import { rank, score } from "../src/ui/search";
import { mapProse, matchCase, parseRules } from "../src/plugins/text";
import { splitText } from "../src/plugins/chatText";
import { lensStyle, originalImage, searchUrls } from "../src/plugins/media";
import { anonymousName } from "../src/plugins/utility";
import { localTime } from "../src/plugins/people";
import { hexColor, sharperImage, textOn } from "../src/plugins/look";
import { permissionNames } from "../src/plugins/servers";
import { nameColor } from "../src/plugins/decorations";
import { convertUnits, decodeBase64 } from "../src/plugins/tools";

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
// Discord runs several of these on the same chunk array, so the test runs two.
const chunksSeen: Record<string, number[]> = { main: [], wasm: [] };
const runtimes: Record<string, { require: (id: string) => any; cache: Record<string, any> }> = {};
function runtime(name: "main" | "wasm") {
  const modules: Record<string, Function> = {};
  const cache: Record<string, any> = {};
  function require(id: string) {
    if (cache[id]) return cache[id].exports;
    const module = (cache[id] = { exports: {} });
    modules[id].call(module.exports, module, module.exports, require);
    return module.exports;
  }
  require.m = modules;
  require.c = cache;
  runtimes[name] = { require, cache };
  if (name === "main") {
    // Modules bundled into the runtime's own script, like Discord's main one:
    // one ran before xray saw this runtime, one hasn't run yet.
    modules["1"] = (module: any) => { module.exports = { getName: () => "MediaEngineStore", addChangeListener() {}, getMediaEngine: () => "engine" }; };
    modules["2"] = (module: any) => { module.exports = { builtIn: "later" }; };
    require("1");
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
check("the main runtime was seen", stats.runtimes === 1, stats);
check("pushed and built-in modules are all known", stats.loaded === 3 && stats.factories === 5, stats);
check("a built-in module that ran before xray saw it is found", find(filters.byStoreName("MediaEngineStore"))?.getMediaEngine() === "engine");
runtimes.main.require("2");
check("a built-in module that runs later is recorded", find(filters.byProps("builtIn"))?.builtIn === "later");
check("chunk array still holds both chunks", w.webpackChunkdiscord_app.length === 2, w.webpackChunkdiscord_app.length);
check("both runtimes received the later chunk", chunksSeen.main.includes(2) && chunksSeen.wasm.includes(2), chunksSeen);
check("find byProps", typeof find(filters.byProps("sendMessage", "editMessage"))?.sendMessage === "function");
check("waitFor resolved a store exported under a mangled key", waited?.getName?.() === "UserStore");
check("findByCode loads an unloaded module", findByCode("needle-xyz")?.() === "needle-xyz");
check("it loads through the main runtime", "30" in runtimes.main.cache && !("30" in runtimes.wasm.cache));
check("factory toString still shows Discord's source", String(w.webpackChunkdiscord_app[1][1][30]).includes("needle-xyz"));

// A second runtime runs its own copy of a module the main one already ran.
runtimes.wasm.require("10");
const twoRuntimes = webpackStats();
check("both copies are kept", twoRuntimes.runtimes === 2 && twoRuntimes.loaded === 6, twoRuntimes);
check("find returns the main runtime's copy", find(filters.byProps("sendMessage", "editMessage")) === runtimes.main.cache["10"].exports);

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
// Only what Fake Deafen uses; server mute/deafen stay off, so no Discord actions are needed.
fakeDeafen.start({
  patch: (t: object, k: PropertyKey, hooks: any) => { stops.push(patch(t, k, hooks)); },
  onStop: (fn: () => void) => { stops.push(fn); },
  intercept() {},
  onAction() {},
  options: { serverDeafen: false, serverMute: false },
  log() {},
} as any);
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

// ---- search ranking ----
const entries = [
  { title: "general", keywords: "Pixel Garage" },
  { title: "general-chat", keywords: "Rust Devs" },
  { title: "off-topic", keywords: "Pixel Garage" },
  { title: "Mara", boost: 5 },
  { title: "marathon-runners" },
];
const titles = (q: string) => rank(q, entries, 5).map((e) => e.title);
check("exact match ranks first", titles("general")[0] === "general", titles("general"));
check("prefix beats middle-of-word", titles("gen")[0] === "general", titles("gen"));
check("word start matches", titles("topic").includes("off-topic"), titles("topic"));
check("keywords match, weaker than titles", titles("pixel").join() === "general,off-topic", titles("pixel"));
check("letters in order still match", titles("gnrl").includes("general"), titles("gnrl"));
check("boost lifts a recent DM", titles("mara")[0] === "Mara", titles("mara"));
check("no match, no result", titles("zzz").length === 0);
check("accents are ignored", score("cafe", "Café") === 100);

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

// ---- text plugins ----
const upper = (t: string) => mapProse(t, (p) => p.toUpperCase());
check("prose is rewritten", upper("hi there") === "HI THERE");
check("code, links, mentions and emoji are left alone", upper("a `b` https://x.com/y <@123> :smile: c") === "A `b` https://x.com/y <@123> :smile: C", upper("a `b` https://x.com/y <@123> :smile: c"));
check("fenced code is left alone", upper("x\n```js\nlet a\n```\ny") === "X\n```js\nlet a\n```\nY");
const [brb] = parseRules(["brb => be right back"], true);
check("whole-word rules skip parts of words", "brb, abrbx".replace(brb.find, (w) => matchCase(w, brb.replace)) === "be right back, abrbx");
check("a capitalized word keeps its capital", "Brb".replace(brb.find, (w) => matchCase(w, brb.replace)) === "Be right back");
const [colour] = parseRules(["/colou?r/ => hue"], false);
check("regex rules work", "color colour".replace(colour.find, colour.replace) === "hue hue");
check("broken regex rules are skipped", parseRules(["/(/ => x"], false).length === 0);
const long = Array.from({ length: 50 }, (_, i) => `line ${i} ${"x".repeat(60)}`).join("\n");
const parts = splitText(long, 2000);
check("long text splits under the limit", parts.length === 2 && parts.every((p) => p.length <= 2000), parts.map((p) => p.length));
check("splitting keeps every line", parts.join("\n") === long);

// ---- ported plugins ----
check("anonymous names keep the extension", /^[a-z0-9]{8}\.png$/.test(anonymousName("IMG_2041.PNG", "random", 0)), anonymousName("IMG_2041.PNG", "random", 0));
check("anonymous names keep the spoiler prefix", anonymousName("SPOILER_x.jpg", "random", 0).startsWith("SPOILER_"));
check("date names number extra files", anonymousName("a.txt", "date", 1, new Date(2026, 0, 2, 3, 4, 5)) === "2026-01-02_030405_2.txt", anonymousName("a.txt", "date", 1, new Date(2026, 0, 2, 3, 4, 5)));
check("no fake extension from a dotted name", anonymousName("my.file name", "date", 0, new Date(2026, 0, 2, 3, 4, 5)) === "2026-01-02_030405");
const lens = lensStyle({ left: 0, top: 0, width: 100, height: 100 }, 50, 50, 200, 100);
check("the lens centres the point under the cursor", lens.size[0] === 200 && lens.position[0] === -50 && lens.position[1] === -50, lens);
check("search uses the original image", originalImage("https://media.discordapp.net/attachments/1/2/a.png?ex=1&width=300&height=200") === "https://media.discordapp.net/attachments/1/2/a.png?ex=1");
check("every engine opens five searches", searchUrls("all", "https://x/a.png").length === 5);
check("a timezone gives a local time", localTime("Asia/Tokyo") !== null && localTime("Not/AZone") === null);

// ---- wave 3 ----
check("short hex colors expand", hexColor("abc") === "#aabbcc" && hexColor("#7C5CFF") === "#7c5cff" && hexColor("nope") === null);
check("dark text on light accents, light on dark", textOn("#f2f3f5") === "#0b0b0d" && textOn("#202060") === "#ffffff");
const proxied = "https://media.discordapp.net/attachments/1/2/a.png?ex=1&is=2&hm=3&width=400&height=300&format=webp";
check("lossless keeps the size", sharperImage(proxied, "lossless").includes("width=400") && sharperImage(proxied, "lossless").includes("quality=lossless"));
check("original drops resizing and keeps the signature", sharperImage(proxied, "original") === "https://cdn.discordapp.com/attachments/1/2/a.png?ex=1&is=2&hm=3");
check("other images are left alone", sharperImage("https://cdn.discordapp.com/avatars/1/a.png", "original") === "https://cdn.discordapp.com/avatars/1/a.png");
check("administrator means everything", permissionNames(1n << 3n).length === 1);
check("permission bits name the right things", permissionNames((1n << 11n) | (1n << 1n)).join() === "Kick Members,Send Messages", permissionNames((1n << 11n) | (1n << 1n)));
check("name colors are steady per person", nameColor("123", 70) === nameColor("123", 70) && nameColor("123", 70) !== nameColor("124", 70));

// ---- wave 4 ----
check("units convert both ways", convertUnits("ran 5 km and lifted 100 lb").join() === "5 km = 3.11 mi,100 lb = 45.36 kg", convertUnits("ran 5 km and lifted 100 lb"));
check("temperatures convert", convertUnits("it's 30°C").join() === "30 °C = 86 °F" || convertUnits("it's 30°C")[0]?.endsWith("86 °F"), convertUnits("it's 30°C"));
check("plain numbers aren't units", convertUnits("I have 5 apples").length === 0);
check("Base64 text decodes", decodeBase64("look: aGVsbG8gd29ybGQgZnJvbSB4cmF5").join() === "hello world from xray");
check("non-text Base64 is skipped", decodeBase64("AAAAAAAAAAAAAAAAAAAAAAAA").length === 0);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
