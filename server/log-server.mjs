/**
 * xray's log server: a small service for your VPS that keeps xray's own
 * errors and your own voice and plugin events, so you can see when Discord
 * changed something under xray or when a plugin acted.
 *
 * Logs never contain message bodies or image files. Separate opt-in account
 * documents can contain profile notes/observations and moderation audits.
 * See README.md for storage, retention and bearer-token access semantics.
 *
 * Storage is one SQLite file (node:sqlite, built into Node 22, no native
 * build). Rows older than the retention window are deleted on a timer and
 * on every write. You can also clear everything from xray or from the page.
 *
 * It's reached only through xray's Rust side, which holds the token; the
 * token never touches Discord's page. Run it behind HTTPS (a reverse proxy
 * such as Caddy or nginx), since the token rides in a header.
 *
 *   XRAY_LOG_TOKEN=<long secret>  (required; the server won't start without it)
 *   XRAY_LOG_PORT=8787
 *   XRAY_LOG_DB=./xray-log.sqlite
 *   XRAY_LOG_RETENTION_DAYS=15
 *   XRAY_LOG_BIND=127.0.0.1
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname,join } from "node:path";
import { recordingStore } from "./recordings.mjs";
import { startDiscordBot } from "./discord-bot.mjs";

const TOKEN = process.env.XRAY_LOG_TOKEN ?? "";
const PORT = Number(process.env.XRAY_LOG_PORT ?? 8787);
const BIND = process.env.XRAY_LOG_BIND ?? "127.0.0.1";
const DB_PATH = process.env.XRAY_LOG_DB ?? "./xray-log.sqlite";
const RETENTION_DAYS = Math.max(1, Number(process.env.XRAY_LOG_RETENTION_DAYS ?? 15));
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** The kinds of event xray sends, and nothing else is stored. */
const KINDS = new Set(["error", "voice", "plugin"]);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_BATCH = 200;
const MAX_TEXT = 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const PAGE_LIMIT = 500;

/**
 * One stored event. `kind` is error / voice / plugin, `at` is when it
 * happened (ms), `source` is the plugin or part of xray it came from, `text`
 * is xray's own message, and `detail` is a small flat bag of xray's own
 * fields (a server id, on/off). Each field is capped; anything unexpected is
 * dropped.
 */
export function clean(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!KINDS.has(raw.kind)) return null;
  const at = Number(raw.at);
  const text = typeof raw.text === "string" ? raw.text.slice(0, MAX_TEXT) : "";
  if (!text) return null;
  return {
    kind: raw.kind,
    at: Number.isFinite(at) && at > 0 ? at : Date.now(),
    source: typeof raw.source === "string" ? raw.source.slice(0, 120) : "",
    text,
    detail: cleanDetail(raw.detail),
  };
}

/** A flat object of short string/number/boolean fields, at most a handful. */
function cleanDetail(detail) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {};
  const out = {};
  for (const [key, value] of Object.entries(detail)) {
    if (Object.keys(out).length >= 12) break;
    if (typeof value === "string") out[key.slice(0, 40)] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean") out[key.slice(0, 40)] = value;
  }
  return out;
}

export function openDb(path = DB_PATH) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      kind    TEXT NOT NULL,
      at      INTEGER NOT NULL,
      source  TEXT NOT NULL DEFAULT '',
      text    TEXT NOT NULL,
      detail  TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS events_at ON events (at);
    CREATE TABLE IF NOT EXISTS config (
      ns         TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      ns TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
  `);
  return db;
}

/** Namespaces are plugin ids: short, and only safe characters. */
const NS_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;
const DOCUMENT_NS = /^(profile-history|moderation-audit|server-monitors|bot-history)\.\d{14,20}$/;
const MAX_DOCUMENT_BYTES = 2_500_000;

/** A tiny data layer, so the HTTP server and the tests share one path. */
export function store(db, now = () => Date.now()) {
  const insert = db.prepare("INSERT INTO events (kind, at, source, text, detail) VALUES (?, ?, ?, ?, ?)");
  const recent = db.prepare(`SELECT id, kind, at, source, text, detail FROM events WHERE at >= ? ORDER BY at DESC, id DESC LIMIT ?`);
  const dropOld = db.prepare("DELETE FROM events WHERE at < ?");
  const dropAll = db.prepare("DELETE FROM events");
  const getConfig = db.prepare("SELECT value, updated_at FROM config WHERE ns = ?");
  const putConfig = db.prepare(`
    INSERT INTO config (ns, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(ns) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const getDocument = db.prepare("SELECT value, revision FROM documents WHERE ns = ?");
  const insertDocument = db.prepare("INSERT OR IGNORE INTO documents (ns,value,revision) VALUES (?,?,1)");
  const updateDocument = db.prepare("UPDATE documents SET value=?,revision=revision+1 WHERE ns=? AND revision=?");
  return {
    readDocument(ns) {
      const row = getDocument.get(ns);
      return row ?? { value: null, revision: 0 };
    },
    writeDocument(ns, value, revision) {
      // One atomic statement prevents another device silently replacing newer data.
      const result = revision === 0 ? insertDocument.run(ns, value) : updateDocument.run(value, ns, revision);
      return Number(result.changes) === 1 ? { revision: revision + 1 } : null;
    },
    add(events) {
      let added = 0;
      for (const raw of events.slice(0, MAX_BATCH)) {
        const event = clean(raw);
        if (!event) continue;
        insert.run(event.kind, event.at, event.source, event.text, JSON.stringify(event.detail));
        added++;
      }
      this.prune();
      return added;
    },
    list(kind) {
      const rows = recent.all(now() - RETENTION_MS, PAGE_LIMIT);
      const parsed = rows.map((row) => ({ ...row, detail: safeParse(row.detail) }));
      return kind && KINDS.has(kind) ? parsed.filter((row) => row.kind === kind) : parsed;
    },
    prune() {
      return dropOld.run(now() - RETENTION_MS).changes;
    },
    clear() {
      return dropAll.run().changes;
    },
    /** Reads a plugin's own saved config, or null if it has none. */
    readConfig(ns) {
      if (!NS_PATTERN.test(ns)) return null;
      const row = getConfig.get(ns);
      return row ? { value: safeParse(row.value), updatedAt: row.updated_at } : null;
    },
    /** Replaces a plugin's own config. The newest write wins. */
    writeConfig(ns, value, at = now()) {
      if (!NS_PATTERN.test(ns)) return null;
      putConfig.run(ns, JSON.stringify(value ?? null), at);
      return { updatedAt: at };
    },
  };
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/** Constant-time token check, so a wrong guess learns nothing from timing. */
function authorized(req) {
  const header = req.headers.authorization ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      // Stop collecting, but let the request drain so we can still send a 413
      // response instead of resetting the connection.
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(new Error("too large"));
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => !tooLarge && resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(text);
}

export function createApp(data,recordings) {
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
      if(url.pathname==="/recordings" && req.method==="POST") {
        if(!recordings)return json(res,503,{error:"Recording storage unavailable"});
        let payload;try{payload=JSON.parse(await readBody(req,200000));}catch{return json(res,400,{error:"Invalid recording request"});}
        if(!["start","chunk","finish","list","read","abort"].includes(payload?.action))return json(res,400,{error:"Unknown recording action"});
        try{return json(res,200,recordings[payload.action](payload));}catch(error){return json(res,400,{error:error.message});}
      }
      if (url.pathname === "/documents") {
        const ns = url.searchParams.get("ns") ?? "";
        if (!DOCUMENT_NS.test(ns)) return json(res, 400, { error: "bad document namespace" });
        if (req.method === "GET") return json(res, 200, data.readDocument(ns));
        if (req.method === "PUT") {
          if(ns.startsWith("bot-history."))return json(res,403,{error:"VPS bot observations are read-only"});
          let payload;
          try { payload = JSON.parse(await readBody(req, MAX_DOCUMENT_BYTES)); }
          catch (error) { if (error.message === "too large") throw error; return json(res, 400, { error: "invalid JSON" }); }
          if (typeof payload?.value !== "string" || !Number.isSafeInteger(payload.revision) || payload.revision < 0 || Buffer.byteLength(payload.value) > 2_000_000) return json(res, 400, { error: "expected a bounded document string and revision" });
          const written = data.writeDocument(ns, payload.value, payload.revision);
          return written ? json(res, 200, written) : json(res, 409, { error: "document changed on another device; reload before saving" });
        }
      }
      if (req.method === "POST" && url.pathname === "/ingest") {
        const body = await readBody(req);
        const payload = safeParse(body);
        const events = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : null;
        if (!events) return json(res, 400, { error: "expected an array of events" });
        return json(res, 200, { added: data.add(events) });
      }
      if (req.method === "GET" && url.pathname === "/events.json") {
        return json(res, 200, { events: data.list(url.searchParams.get("kind")), retentionDays: RETENTION_DAYS });
      }
      if (req.method === "POST" && url.pathname === "/clear") {
        return json(res, 200, { cleared: data.clear() });
      }
      if (url.pathname === "/config") {
        const ns = url.searchParams.get("ns") ?? "";
        if (!NS_PATTERN.test(ns)) return json(res, 400, { error: "bad namespace" });
        if (req.method === "GET") {
          return json(res, 200, data.readConfig(ns) ?? { value: null, updatedAt: 0 });
        }
        if (req.method === "PUT") {
          const payload = safeParse(await readBody(req));
          if (!payload || typeof payload !== "object" || !("value" in payload)) return json(res, 400, { error: "expected { value }" });
          return json(res, 200, data.writeConfig(ns, payload.value));
        }
      }
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(PAGE);
      }
      return json(res, 404, { error: "not found" });
    } catch (err) {
      return json(res, err.message === "too large" ? 413 : 500, { error: err.message });
    }
  };
}

/**
 * The web page (`GET /`). It asks for the token once, keeps it in the tab
 * only, and reads `/events.json`. It's plain and self-contained so it needs
 * no build and ships in this one file.
 */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>xray log</title><style>
:root { color-scheme: dark; --bg:#0b0b0d; --card:#161619; --line:rgba(255,255,255,.1); --text:#f2f3f5; --muted:#9a9ca5; --faint:#7f818b; --accent:#8aa0ff; --error:#ff7a66; --voice:#3dd68c; --plugin:#f5b84a; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 "Segoe UI",system-ui,sans-serif; }
header { position:sticky; top:0; display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:16px 20px; background:rgba(11,11,13,.9); border-bottom:1px solid var(--line); backdrop-filter:blur(8px); }
h1 { font-size:17px; margin:0; font-weight:650; letter-spacing:-.01em; }
.sp { flex:1; }
button, select { height:34px; padding:0 12px; border:1px solid var(--line); border-radius:9px; background:var(--card); color:var(--text); font:inherit; font-size:13px; cursor:pointer; }
button:hover, select:hover { border-color:rgba(255,255,255,.25); }
button.danger { color:var(--error); }
main { max-width:900px; margin:0 auto; padding:18px 20px 60px; }
.row { display:flex; gap:12px; padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--card); margin-bottom:8px; }
.when { flex:none; width:118px; font:12px "Cascadia Mono",ui-monospace,monospace; color:var(--faint); }
.body { flex:1; min-width:0; }
.tag { display:inline-block; font:10.5px "Cascadia Mono",ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; padding:1px 6px; border-radius:5px; margin-right:8px; }
.tag.error { color:var(--error); background:rgba(255,122,102,.13); }
.tag.voice { color:var(--voice); background:rgba(61,214,140,.13); }
.tag.plugin { color:var(--plugin); background:rgba(245,184,74,.13); }
.src { font:12px "Cascadia Mono",ui-monospace,monospace; color:var(--muted); }
.text { margin-top:3px; overflow-wrap:anywhere; }
.detail { margin-top:4px; font:12px "Cascadia Mono",ui-monospace,monospace; color:var(--faint); overflow-wrap:anywhere; }
.empty, .note { padding:48px 16px; text-align:center; color:var(--muted); }
.note { padding:16px; }
</style></head><body>
<header>
  <h1>xray log</h1>
  <span class="sp"></span>
  <select id="kind"><option value="">All</option><option value="error">Errors</option><option value="voice">Voice</option><option value="plugin">Plugin</option></select>
  <button id="refresh">Refresh</button>
  <button id="clear" class="danger">Clear all</button>
</header>
<main><div id="list" class="empty">Enter the log token to load.</div></main>
<script>
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("xray-log-token") || "";
async function api(path, options = {}) {
  if (!token) token = prompt("Log token") || "";
  sessionStorage.setItem("xray-log-token", token);
  const res = await fetch(path, { ...options, headers: { ...(options.headers||{}), authorization: "Bearer " + token } });
  if (res.status === 401) { token = ""; sessionStorage.removeItem("xray-log-token"); throw new Error("Wrong token."); }
  if (!res.ok) throw new Error("Server error " + res.status);
  return res.json();
}
function when(ms) { const d = new Date(ms); return d.toLocaleDateString([], { month:"short", day:"numeric" }) + " " + d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c])); }
function row(e) {
  const detail = Object.keys(e.detail||{}).length ? '<div class="detail">' + esc(Object.entries(e.detail).map(([k,v]) => k+"="+v).join("  ")) + "</div>" : "";
  return '<div class="row"><div class="when">' + when(e.at) + '</div><div class="body"><span class="tag ' + esc(e.kind) + '">' + esc(e.kind) + '</span>'
    + (e.source ? '<span class="src">' + esc(e.source) + "</span>" : "")
    + '<div class="text">' + esc(e.text) + "</div>" + detail + "</div></div>";
}
async function load() {
  try {
    const { events, retentionDays } = await api("/events.json?kind=" + encodeURIComponent($("kind").value));
    document.title = "xray log (" + events.length + ")";
    $("list").className = events.length ? "" : "empty";
    $("list").innerHTML = events.length
      ? '<div class="note">Last ' + retentionDays + ' days · ' + events.length + ' event' + (events.length===1?"":"s") + "</div>" + events.map(row).join("")
      : "Nothing logged in the last " + (retentionDays||15) + " days.";
  } catch (err) { $("list").className = "empty"; $("list").textContent = err.message; }
}
$("refresh").onclick = load;
$("kind").onchange = load;
$("clear").onclick = async () => { if (confirm("Delete every logged event?")) { await api("/clear", { method:"POST" }); load(); } };
load();
</script></body></html>`;

/** Starts the HTTP server. Returned so tests can start it on an ephemeral port. */
export function start({ db = openDb(), port = PORT, bind = BIND, recordings = recordingStore(process.env.XRAY_RECORDINGS_DIR ?? join(dirname(DB_PATH),"recordings")) } = {}) {
  const data = store(db);
  const timer = setInterval(() => {data.prune();recordings.list();}, PRUNE_EVERY_MS);
  timer.unref?.();
  const server = createServer(createApp(data,recordings));
  server.listen(port, bind, () => console.log(`xray log server on http://${bind}:${port} (keeping ${RETENTION_DAYS} days)`));
  return { server, db, data, stop: () => { clearInterval(timer); server.close(); db.close(); } };
}

// Run directly (`node server/log-server.mjs`), not when imported by the tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!TOKEN || TOKEN.length < 16) {
    console.error("Set XRAY_LOG_TOKEN to a secret of at least 16 characters before starting the server.");
    process.exit(1);
  }
  const running=start();
  void startDiscordBot(running.db,running.data).then(bot=>{const timer=setInterval(()=>{try{bot.history.prune();}catch{console.error("Could not prune VPS bot history");}},PRUNE_EVERY_MS);timer.unref?.();const stop=()=>{clearInterval(timer);bot.stop();running.stop();};process.once("SIGTERM",stop);process.once("SIGINT",stop);}).catch(()=>console.error("VPS bot collector could not start"));
}
