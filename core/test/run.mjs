// Bundles core.test.ts for Node and runs it. The banner stands in for the
// browser globals the core touches (window, document, and a WebSocket that
// records what it sends instead of connecting).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { build } from "esbuild";
import { resolve } from "node:path";

const outfile = "node_modules/.cache/xray/core.test.cjs";
mkdirSync("node_modules/.cache/xray", { recursive: true });

await build({
  entryPoints: ["core/test/core.test.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "warning",
  loader: { ".svg": "text" },
  define: { __XRAY_VERSION__: '"test"', __XRAY_DEV__: "true" },
  banner: {
    js: [
      "globalThis.window = globalThis;",
      "globalThis.document = {};",
      "globalThis.WebSocket = class { static OPEN = 1; constructor(url) { this.url = url; this.readyState = 1; this.sent = []; } send(data) { this.sent.push(data); } };",
      "globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};",
      "globalThis.location = { href: 'https://discord.com/channels/@me', hostname: 'discord.com', pathname: '/channels/@me' };",
      "globalThis.Element = class {};",
      "globalThis.HTMLElement = class extends globalThis.Element {};",
      "globalThis.HTMLImageElement = class extends globalThis.HTMLElement {};",
      "globalThis.XMLHttpRequest = class { open(method, url) { this.method = method; this.url = url; } send(body) { this.body = body; } };",
    ].join("\n"),
  },
});

try {
  execFileSync(process.execPath, ["--test", "core/test/dm-backfill.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/settings-mode-sync.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/hidden-servers.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/local-view.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/archive-reload.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/voice-recording-menu.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/build-variants.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/voice-zoom.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/profile-actions.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/sandbox-preview.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/share-preview.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/plugin-card.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/dropdowns.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/screenshare.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/installer.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, ["--test", "core/test/timestamp-plugin.test.mjs"], { stdio: ["ignore", "inherit", "inherit"] });
  execFileSync(process.execPath, [outfile], { stdio: ["ignore", "inherit", "inherit"] });
  for (const [entryPoint, name] of [["core/test/recording-selection.test.ts","recording-selection"],["core/test/reports.test.ts", "reports"], ["core/test/custom-status.test.ts", "custom-status"], ["core/test/seasonal.test.ts", "seasonal"], ["core/test/oathnet.test.ts", "oathnet"], ["core/test/release.test.ts", "release"], ["core/test/profile-history.test.ts", "profile-history"], ["core/test/storage-chat.test.ts", "storage-chat"], ["core/test/history-storage.test.ts", "history-storage"], ["equicord/plugins/fakeDM/session.test.ts", "fakedm"], ["core/test/time.test.ts", "time"], ["core/test/profile-monitor.test.ts", "profile-monitor"]]) {
    const testFile = `node_modules/.cache/xray/${name}.test.cjs`;
    await build({ entryPoints: [entryPoint], outfile: testFile, bundle: true, platform: "node", format: "cjs", loader: { ".svg": "text" }, logLevel: "warning",
      ...(["reports","oathnet","release","profile-history","storage-chat","time","profile-monitor"].includes(name) ? { banner:{js:"globalThis.window=globalThis;globalThis.document={};globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};"} } : {}),
      ...(name === "history-storage" ? { banner:{js:"globalThis.window=globalThis;globalThis.document={};globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};"},plugins:[{name:"history-fixture",setup(b){b.onResolve({filter:/^\.\.\/discord$/},()=>({path:resolve("core/test/history-discord.fixture.ts")}));}}] } : {}) });
    execFileSync(process.execPath, ["--test", testFile], { stdio: ["ignore", "inherit", "inherit"] });
  }
} catch {
  process.exit(1);
}
