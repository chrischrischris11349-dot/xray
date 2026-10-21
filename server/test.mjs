// Checks the log server against an in-memory SQLite db and a live socket.
// Run with `node server/test.mjs`.
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
process.env.XRAY_LOG_TOKEN ??= "test-token-0123456789";
const { clean, store, openDb, createApp } = await import("./log-server.mjs");

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : " -> " + JSON.stringify(detail)}`);
}

// ---- clean(): only expected shapes survive ----
check("a valid error event passes", clean({ kind: "error", at: 5, text: "boom", source: "voice" })?.text === "boom");
check("an unknown kind is dropped", clean({ kind: "message", at: 5, text: "secret" }) === null);
check("an empty text is dropped", clean({ kind: "error", text: "" }) === null);
check("text and detail are capped", (() => {
  const e = clean({ kind: "plugin", at: 1, text: "x".repeat(5000), detail: { a: "y".repeat(5000), ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i])) } });
  return e.text.length === 1000 && e.detail.a.length === 200 && Object.keys(e.detail).length <= 12;
})());
check("nested detail values are dropped", JSON.stringify(clean({ kind: "voice", at: 1, text: "t", detail: { ok: 1, nope: { a: 1 }, arr: [1] } }).detail) === '{"ok":1}');
check("a missing timestamp defaults to now", clean({ kind: "error", text: "t" }).at > 0);

// ---- store(): retention and clear ----
const db = openDb(":memory:");
let fakeNow = 1_000_000_000_000;
const data = store(db, () => fakeNow);
check("adding counts only valid events", data.add([{ kind: "error", at: fakeNow, text: "a" }, { kind: "nope", text: "b" }, { kind: "voice", at: fakeNow, text: "c" }]) === 2);
data.add([{ kind: "plugin", at: fakeNow - 16 * 864e5, text: "old" }]);
check("events older than the window aren't returned", data.list().every((e) => e.text !== "old"));
check("a fresh add prunes old rows", db.prepare("SELECT COUNT(*) n FROM events").get().n === 2);
check("list newest first", data.list().map((e) => e.text).join() === "c,a", data.list());
check("filtering by kind works", data.list("voice").map((e) => e.text).join() === "c");
fakeNow += 20 * 864e5;
check("the whole window can age out", data.add([]) >= 0 && data.list().length === 0);
data.add([{ kind: "error", at: fakeNow, text: "fresh" }]);
check("clear empties the store", data.clear() === 1 && data.list().length === 0);

// ---- over HTTP ----
import { createServer } from "node:http";
const liveDb = openDb(":memory:");
const liveData = store(liveDb);
const server = createServer(createApp(liveData));
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const token = process.env.XRAY_LOG_TOKEN;
const call = (path, options = {}) => fetch(base + path, options);
const auth = (extra = {}) => ({ authorization: "Bearer " + token, ...extra });

check("no token is rejected", (await call("/events.json")).status === 401);
check("a wrong token is rejected", (await call("/events.json", { headers: auth({ authorization: "Bearer nope" }) })).status === 401);
const ingest = await call("/ingest", { method: "POST", headers: auth(), body: JSON.stringify([{ kind: "error", at: Date.now(), text: "hello", source: "webpack" }, { kind: "bad", text: "x" }]) });
check("ingest stores valid events and ignores the rest", (await ingest.json()).added === 1, ingest.status);
const listed = await (await call("/events.json", { headers: auth() })).json();
check("the page's data endpoint returns them", listed.events[0]?.text === "hello" && listed.retentionDays >= 1, listed);
check("events wrapped in an object are accepted", (await (await call("/ingest", { method: "POST", headers: auth(), body: JSON.stringify({ events: [{ kind: "voice", at: Date.now(), text: "v" }] }) })).json()).added === 1);
check("a non-array body is rejected", (await call("/ingest", { method: "POST", headers: auth(), body: "{}" })).status === 400);
check("the web page loads with a token", (await call("/", { headers: auth() })).status === 200 && (await (await call("/", { headers: auth() })).text()).includes("xray log"));
check("clear works over HTTP", (await (await call("/clear", { method: "POST", headers: auth() })).json()).cleared >= 1 && (await (await call("/events.json", { headers: auth() })).json()).events.length === 0);
check("an unknown path is 404", (await call("/nope", { headers: auth() })).status === 404);
const big = await call("/ingest", { method: "POST", headers: auth(), body: "[" + "0,".repeat(200000) + "0]" });
check("an oversized body is refused", big.status === 413, big.status);


// ---- config store (plugins' own data) ----
const cfg = call;
check("reading a missing config gives null", (await (await cfg("/config?ns=textReplace", { headers: auth() })).json()).value === null);
const put = await cfg("/config?ns=textReplace", { method: "PUT", headers: auth(), body: JSON.stringify({ value: { rules: [{ find: "brb", replace: "be right back" }] } }) });
check("writing config returns a timestamp", (await put.json()).updatedAt > 0, put.status);
const got = await (await cfg("/config?ns=textReplace", { headers: auth() })).json();
check("config round-trips", got.value?.rules?.[0]?.find === "brb" && got.updatedAt > 0, got);
await cfg("/config?ns=textReplace", { method: "PUT", headers: auth(), body: JSON.stringify({ value: { rules: [] } }) });
check("the newest write wins", (await (await cfg("/config?ns=textReplace", { headers: auth() })).json()).value.rules.length === 0);
check("a bad namespace is rejected", (await cfg("/config?ns=../etc", { method: "GET", headers: auth() })).status === 400);
check("config needs the token too", (await cfg("/config?ns=textReplace")).status === 401);
check("a PUT without value is rejected", (await cfg("/config?ns=x", { method: "PUT", headers: auth(), body: "{}" })).status === 400);
await cfg("/config?ns=textReplace", { method: "PUT", headers: auth(), body: JSON.stringify({ value: { rules: [{ find: "a", replace: "b" }] } }) });
await cfg("/clear", { method: "POST", headers: auth() });
check("config survives a /clear of events", (await (await cfg("/config?ns=textReplace", { headers: auth() })).json()).value !== null);

server.close();
liveDb.close();
db.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
