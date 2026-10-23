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
import { parseTable, toneTags } from "../src/plugins/reading";
import { accent, contrast, ink, mist } from "../src/theme/tokens";
import { ageBetween, mergeProfile, profileSections, renderProfile, type ProfileData, type ProfileSection } from "../src/ui/profile";
import { parseHTML } from "linkedom";
import { LocalMessageEdits } from "../src/plugins/localMessageEdit";
import { renderChatMessage, messageDate } from "../src/ui/chatMessage";
import { palettes } from "../src/theme/palettes";
import { clampBubble } from "../src/ui/bubblePosition";
import { countLoadedMessages } from "../src/ui/messageCounts";
import { notificationContent } from "../src/shell/notifications";
import { parseLocalReport } from "../src/ui/intelligence";

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
// Saved options from older builds must never reactivate moderation behavior.
fakeDeafen.start({
  patch: (t: object, k: PropertyKey, hooks: any) => { stops.push(patch(t, k, hooks)); },
  onStop: (fn: () => void) => { stops.push(fn); },
  intercept() { throw new Error("Fake Deafen must not intercept incoming moderation state"); },
  onAction() { throw new Error("Fake Deafen must not install moderation recovery hooks"); },
  options: { serverDeafen: true, serverMute: true, looksDeafened: false, looksMuted: false },
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
check("server moderation options are removed", !("serverMute" in fakeDeafen.options!) && !("serverDeafen" in fakeDeafen.options!));
check("stopping clears active state and connection", !fakeVoice.available && !fakeVoice.active && !fakeVoice.inVoice);

const isolatedStops: (() => void)[] = [];
fakeDeafen.start({
  patch: (t: object, k: PropertyKey, hooks: any) => isolatedStops.push(patch(t, k, hooks)),
  onStop: (fn: () => void) => isolatedStops.push(fn),
  options: {},
} as any); // No stores, moderation actions, dispatcher, or other plugins are required.
fakeVoice.set(true);
check("can arm before joining voice without sending", fakeVoice.active && gateway.sent.length === 6);
const dm = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json") as Sock;
const originalDm = { guild_id: null, channel_id: "dm", self_mute: false, self_deaf: false, self_video: true, flags: 2 };
dm.send(JSON.stringify({ op: 4, d: originalDm }, null, 2));
check("formatted gateway JSON and DM voice work", sentState(dm, 0).self_deaf && sentState(dm, 0).self_video && sentState(dm, 0).flags === 2 && fakeVoice.inVoice);
const leave = JSON.stringify({ op: 4, d: { ...originalDm, channel_id: null } });
dm.send(leave);
check("leave is unchanged and clears voice status", dm.sent[1] === leave && !fakeVoice.inVoice);
fakeVoice.set(false);
check("turning off after leave cannot rejoin", dm.sent.length === 2);
const reconnected = new WebSocket("wss://gateway-us-west2-b.discord.gg/?encoding=json") as Sock;
reconnected.send(JSON.stringify({ op: 4, d: { ...originalDm, guild_id: "server", channel_id: "new", self_mute: true } }));
fakeVoice.set(true);
fakeVoice.set(false);
check("reconnect restores the newest real state including actual self mute", sentState(reconnected, 2).self_mute && !sentState(reconnected, 2).self_deaf && sentState(reconnected, 2).channel_id === "new" && dm.sent.length === 2);
const invalid = [JSON.stringify({ op: 4, d: { channel_id: "bad" } }), '{"op":4,broken', JSON.stringify({ op: 40, d: originalDm }), JSON.stringify({ op: 4, d: null })];
invalid.forEach(value => reconnected.send(value));
check("malformed and other opcode packets pass unchanged", invalid.every((value, i) => reconnected.sent[3 + i] === value));
fakeVoice.set(true);
isolatedStops.reverse().forEach(stop => stop());
check("stopping while active restores the actual self state", !sentState(reconnected, reconnected.sent.length - 1).self_deaf && sentState(reconnected, reconnected.sent.length - 1).self_mute);
check("standalone stop restores the socket method", !fakeVoice.available && !fakeVoice.active);

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

// ---- wave 5 ----
const table = parseTable("scores:\n| name | pts |\n|---|---|\n| ana | 3 |\n| bo | 5 |\nthanks");
check("markdown tables parse", JSON.stringify(table) === JSON.stringify([["name", "pts"], ["ana", "3"], ["bo", "5"]]), table);
check("pipes without a divider aren't a table", parseTable("a | b\nc | d") === null);
check("tone tags are spelled out", toneTags("ok fine /j lol /srs").join() === "/j joking,/srs serious", toneTags("ok fine /j lol /srs"));
check("paths aren't tone tags", toneTags("see and/or https://x.com/j").length === 0);

// ---- design tokens: every text color is readable on every surface it can sit on ----
for (const [surfaceName, surface] of Object.entries(mist)) {
  for (const [inkName, color] of Object.entries(ink)) {
    const ratio = contrast(color, surface);
    check(`${inkName} on ${surfaceName} is at least 4.5:1`, ratio >= 4.5, ratio.toFixed(2));
  }
  check(`oak text on ${surfaceName} is at least 4.5:1`, contrast(accent.oak, surface) >= 4.5, contrast(accent.oak, surface).toFixed(2));
}
check("text on an oak button is at least 7:1", contrast(accent.onOak, accent.oak) >= 7, contrast(accent.onOak, accent.oak).toFixed(2));

// ---- extended profile ----
const NOW = new Date("2026-10-21T12:00:00Z");
function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    id: "123456789012345678", name: "Ana", username: "ana", bot: false, avatar: null, banner: null, accentColor: null,
    pronouns: null, bio: null, presence: "unknown", customStatus: null, badges: [], createdAt: new Date("2020-03-12T00:00:00Z"),
    joinedServerAt: null, boostingSince: null, friendsSince: null, roles: [], serverName: null,
    mutualServers: { state: "loading" }, mutualFriends: { state: "loading" }, connections: { state: "loading" },
    ...overrides,
  };
}
const ids = (sections: ProfileSection[]) => sections.map((s) => s.id).join();
const section = <K extends ProfileSection["id"]>(sections: ProfileSection[], id: K) => sections.find((s) => s.id === id) as Extract<ProfileSection, { id: K }> | undefined;

const sparse = profileSections(profile(), NOW);
check("a bare profile shows dates, mutuals and connections only", ids(sparse) === "dates,servers,friends,connections", ids(sparse));
check("a bare profile never invents a bio", !section(sparse, "about"));
check("mutuals say they're loading while the request runs", section(sparse, "servers")?.note === "Loading…" && section(sparse, "friends")?.note === "Loading…");
check("account age is always shown", section(sparse, "dates")?.facts.some(([label]) => label === "Account created") === true);

const failed = profileSections(mergeProfile(profile(), null), NOW);
check("a failed profile request says so instead of showing nothing", (section(failed, "servers")?.note ?? "").startsWith("Couldn"), section(failed, "servers"));
const malformed = mergeProfile(profile(), { mutual_guilds: "nope", connected_accounts: [{ type: 3 }] });
check("malformed mutuals fail, malformed connections are dropped", malformed.mutualServers.state === "failed" && malformed.connections.state === "ready" && (malformed.connections as any).value.length === 0);

const merged = mergeProfile(profile({ serverName: "Burg Bites", joinedServerAt: new Date("2025-01-05T00:00:00Z") }), {
  user_profile: { bio: "  makes burgers  ", pronouns: "she/her", accent_color: 0xd29a57 },
  mutual_guilds: Array.from({ length: 15 }, (_, i) => ({ id: String(i), nick: i === 0 ? "ana b" : null })),
  mutual_friends: [{ global_name: "Bo" }, { username: "cy" }, {}],
  connected_accounts: [{ type: "github", name: "ana-dev", verified: true }],
});
const full = profileSections(merged, NOW);
check("a full profile shows every section in order", ids(full) === "about,dates,servers,friends,connections", ids(full));
check("bios are trimmed", section(full, "about")?.text === "makes burgers");
check("pronouns and accent come from the profile", merged.pronouns === "she/her" && merged.accentColor === "#d29a57");
check("long mutual lists are cut with a count", section(full, "servers")?.servers.length === 12 && section(full, "servers")?.note === "and 3 more" && section(full, "servers")?.title === "Mutual servers · 15", section(full, "servers")?.note);
check("unknown servers are named honestly, not made up", section(full, "servers")?.servers[1]?.name === "A server you're in");
check("friends without a name are skipped", section(full, "friends")?.names.join() === "Bo,cy", section(full, "friends")?.names);
check("joined date names the server", section(full, "dates")?.facts.some(([label]) => label === "Joined Burg Bites") === true, section(full, "dates")?.facts);
const detailData = mergeProfile(profile({ relationship: "Friend", premiumSince: new Date("2025-01-01"), serverNickname: "old nickname", badges: ["Old badge"] }), {
  premium_since: null, legacy_username: "old-name#1234", mutual_friends_count: 6,
  guild_member: { nick: null }, mutual_guilds: [], badges: [],
});
const detailFacts = Object.fromEntries(section(profileSections(detailData, NOW), "dates")!.facts);
check("profile reports confirmed relationship and mutual count without needing the names", detailFacts.Relationship === "Friend" && detailFacts["Mutual friends"] === "6");
check("profile distinguishes confirmed zero mutual servers from unavailable data", detailFacts["Mutual servers"] === "0" && Object.fromEntries(section(sparse, "dates")!.facts)["Mutual servers"] === "Loading…");
check("profile shows legacy names and clears stale premium, nicknames and badges", detailFacts["Legacy username"] === "old-name#1234" && detailFacts["Premium since"] === "Unavailable" && detailFacts["Server nickname"] === "Unavailable" && detailData.badges.length === 0);
const none = profileSections(mergeProfile(profile(), { mutual_guilds: [], mutual_friends: [], connected_accounts: [] }), NOW);
check("no mutuals says so plainly", section(none, "servers")?.note === "No servers in common." && section(none, "friends")?.note === "No friends in common.");
check("no connections leaves the section out", !section(none, "connections"));
check("ages read naturally", ageBetween(new Date("2026-10-21T08:00:00Z"), NOW) === "today" && ageBetween(new Date("2024-08-01T00:00:00Z"), NOW) === "2 years, 2 months ago", ageBetween(new Date("2024-08-01T00:00:00Z"), NOW));

// Rendering, in a small DOM (linkedom) instead of the browser.
const realDocument = (globalThis as any).document;
(globalThis as any).document = parseHTML("<!doctype html><html><body></body></html>").document;
try {
  const noop = { close() {}, copyId() {} };
  const bare = renderProfile(profile(), noop, NOW);
  check("no banner falls back to the mist banner", !!bare.querySelector(".pf-banner.mist"));
  check("no avatar falls back to an initial", bare.querySelector(".pf-avatar.pf-initial")?.textContent === "A");
  check("the sheet is a labelled modal dialog", bare.getAttribute("role") === "dialog" && bare.getAttribute("aria-modal") === "true" && !!bare.querySelector(`#${bare.getAttribute("aria-labelledby")}`));
  check("status is spelled out, not color alone", bare.querySelector(".pf-status")?.textContent === "Status unknown");
  check("no Message button without a way to message", !Array.from(bare.querySelectorAll("button")).some((b: any) => b.textContent === "Message"));

  const hostile = renderProfile(profile({ bio: '<img src=x onerror="alert(1)">', name: "<b>x</b>" }), noop, NOW);
  check("bios and names stay text, never HTML", !hostile.querySelector(".pf-bio img") && hostile.querySelector(".pf-bio")?.textContent === '<img src=x onerror="alert(1)">' && !hostile.querySelector(".pf-name b"));

  const rich = renderProfile({ ...merged, presence: "online", roles: [{ name: "Cook", color: "#d29a57" }, { name: "Member", color: null }], bot: true }, { ...noop, message() {} }, NOW);
  check("roles render with their names", Array.from(rich.querySelectorAll(".pf-role")).map((r: any) => r.textContent).join() === "Cook,Member");
  check("bots are tagged", rich.querySelector(".pf-tag")?.textContent === "Bot");
  check("online status reads Online", rich.querySelector(".pf-status.online")?.textContent === "Online");
  check("connections show their service", Array.from(rich.querySelectorAll(".pf-item-sub")).some((n: any) => n.textContent === "GitHub"));
  check("a Message button is offered when there's a way to message", Array.from(rich.querySelectorAll("button")).some((b: any) => b.textContent === "Message"));
  let openedServer = "", openedFriend = "";
  const navigable = renderProfile({ ...merged, mutualFriendUsers: [{ id: "300760994454437890", name: "Bo", avatar: null, knownServers: ["Burg Bites"] }] }, {
    ...noop, openServer: id => { openedServer = id; }, openFriend: friend => { openedFriend = friend.id; },
  }, NOW);
  const serverButtons = navigable.querySelectorAll('[aria-label^="Open "]:not([aria-label^="Open profile"])');
  (serverButtons[14] as HTMLButtonElement).click();
  (navigable.querySelector('[aria-label="Open profile for Bo"]') as HTMLButtonElement).click();
  check("all shared servers remain navigable beyond the first twelve", serverButtons.length === 15 && openedServer === "14");
  check("mutual friends open their profiles and show only known server membership", openedFriend === "300760994454437890" && navigable.textContent?.includes("Known in: Burg Bites") === true);
  const odd = renderProfile(mergeProfile(profile(), { mutual_guilds: [], mutual_friends: [], connected_accounts: [] }), noop, NOW);
  const blocks = Array.from(odd.querySelectorAll(".pf-block")) as any[];
  check("an odd last block spans the row instead of leaving a hole", blocks.length === 3 && blocks[2].classList.contains("wide") && !blocks[0].classList.contains("wide"), blocks.map((b) => b.className));
} finally {
  (globalThis as any).document = realDocument;
}

const localEdits = new LocalMessageEdits();
const originalMessage = { id: "one", channel_id: "channel", content: "original", author: { id: "someone-else" } };
localEdits.save(originalMessage, "local edit");
check("local edits apply to another user's message", localEdits.apply({ ...originalMessage }).content === "local edit");
check("local edits leave the source message untouched", originalMessage.content === "original");
check("local edits are scoped to their channel", localEdits.apply({ ...originalMessage, channel_id: "other" }).content === "original");
localEdits.apply({ ...originalMessage, content: "server update" });
localEdits.save({ ...originalMessage, content: "local edit" }, "second edit");
check("reset restores the latest real content after repeated local edits", localEdits.reset(originalMessage)?.content === "server update");
localEdits.save(originalMessage, "temporary");
check("stopping restores and clears all local edits", localEdits.clear()[0].content === "original" && !localEdits.get(originalMessage));

{
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = parseHTML("<html><body></body></html>").document;
  try {
    const bubble = renderChatMessage({ timestamp: "2026-10-22T12:00:00Z", attachments: [
      { filename: "photo.gif", url: "https://cdn.discordapp.com/attachments/one/photo.gif", content_type: "image/gif" },
      { filename: "report.pdf", url: "https://cdn.discordapp.com/attachments/one/report.pdf", size: 4096 },
      { filename: "bad", url: "javascript:alert(1)" },
    ], embeds: [{ type: "gifv", video: { url: "https://media.tenor.com/test.mp4" }, title: "GIF" }] }, false, "hello discord.gg/example <img src=x>");
    check("mini-chat displays image attachments and animated GIFs", !!bubble.querySelector("img") && !!bubble.querySelector("video[loop]"));
    check("mini-chat keeps file links and file sizes", !!bubble.querySelector('a[href$="report.pdf"]') && bubble.textContent?.includes("4 KB") === true);
    check("mini-chat displays bare Discord invites as cards", bubble.querySelector(".qr-invite")?.getAttribute("href") === "https://discord.gg/example");
    check("mini-chat displays an exact message timestamp", bubble.querySelector("time")?.getAttribute("datetime") === "2026-10-22T12:00:00.000Z");
    check("mini-chat rejects executable attachment URLs and treats message HTML as text", !bubble.querySelector('a[href^="javascript:"]') && bubble.querySelectorAll("img").length === 1 && bubble.textContent?.includes("<img src=x>") === true);
    const spoiler = renderChatMessage({ attachments: [{ filename: "SPOILER_hidden.png", url: "https://cdn.discordapp.com/attachments/one/hidden.png" }] }, true, "");
    check("mini-chat hides spoiler previews until requested", !spoiler.querySelector("img") && !!spoiler.querySelector("button"));
    spoiler.querySelector("button")!.click();
    check("mini-chat reveals spoiler previews on click", !!spoiler.querySelector("img"));
    check("mini-chat can recover message time from a snowflake", !!messageDate({ id: "300760994454437890" }));
  } finally { (globalThis as any).document = previousDocument; }
}

for (const [name, p] of Object.entries(palettes)) {
  for (const text of [p.text, p.muted, p.faint]) {
    check(`${name} palette text meets 4.5:1 on its raised surface`, contrast(text, p.raised) >= 4.5, contrast(text, p.raised));
  }
  check(`${name} palette action text meets 4.5:1`, contrast(p.onAccent, p.accent) >= 4.5, contrast(p.onAccent, p.accent));
}
check("dragged message bubbles remain inside a resized window", JSON.stringify(clampBubble(2000, -999, 400, 300)) === JSON.stringify({ x: 336, y: 52 }));
check("invalid saved message-bubble coordinates get safe defaults", Number.isFinite(clampBubble(NaN, NaN, 400, 300).x));
const loadedCounts = countLoadedMessages("target", [{ id: "g1", name: "One" }, { id: "g2", name: "Two" }], [{ id: "c1", guild_id: "g1" }, { id: "c1", guild_id: "g1" }, { id: "c2", guild_id: "g2" }], id => id === "c1" ? [{ id: "m1", author: { id: "target" } }, { id: "m1", author: { id: "target" } }, { id: "m2", author: { id: "other" } }] : null);
check("loaded-message counts deduplicate messages and keep unknown coverage", loadedCounts.total === 1 && loadedCounts.servers[0].channels === 1 && loadedCounts.servers[1].channels === 0);
check("presentation notifications hide both author and message text", notificationContent("Private author", "Private message", true).title === "XRay" && !notificationContent("Private author", "Private message", true).body.includes("Private"));
const normalizedIntel = parseLocalReport(JSON.stringify([{ account: "authorized", ip_address: "192.0.2.1" }]), "IntelX", "300760994454437890");
check("authorized report imports preserve all supplied fields without remote lookup", normalizedIntel.records[0].fields.length === 2 && normalizedIntel.metadata.importedAt === true);
let mismatchedImportRejected = false;
try { parseLocalReport(JSON.stringify({ metadata: { query: "300760994454437890" }, records: [] }), "Reports", "300760994454437891"); } catch { mismatchedImportRejected = true; }
check("report imports reject a mismatched subject", mismatchedImportRejected);
const inertExport = `<html><img src="https://untrusted.example/tracker"><script>throw new Error('never run')</script><script id="oathnet-report-data" type="application/json">{"metadata":{"query":"300760994454437890"},"records":[]}</script></html>`;
check("HTML imports extract only the JSON block without creating a document or executing scripts", parseLocalReport(inertExport, "Reports", "").records.length === 0);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
