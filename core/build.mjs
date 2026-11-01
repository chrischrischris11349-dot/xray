// Bundles the mod core into one script that the Rust shell injects into
// Discord at document start (see src-tauri/src/window.rs).
//
//   node core/build.mjs            readable build for development
//   node core/build.mjs --release  minified build (used by `tauri build`)
//   node core/build.mjs --watch    rebuild on change
//
// XRAY_CLEAN_BUILD=1 swaps the modules in CLEAN_STUBS for the stand-ins in
// core/src/clean, so their code is left out of the bundle entirely.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const release = process.argv.includes("--release");
const watch = process.argv.includes("--watch");
const clean = process.env.XRAY_CLEAN_BUILD === "1";
const personal = process.env.XRAY_PERSONAL_BUILD === "1";
const editTools = personal && process.env.XRAY_NO_EDIT_TOOLS !== "1";
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const src = join(dirname(fileURLToPath(import.meta.url)), "src");
/** Module (relative to core/src, no extension) → its stand-in in core/src/clean. */
const CLEAN_STUBS = {
  "ui/intelligence": "intelligence",
  "history/index": "history",
  "history/dmArchive": "dmArchive",
  "voice/recorder": "recorder",
  "ui/collectorStatus": "collectorStatus",
  "ui/oathnet": "profileExtras",
  "ui/messageBrowser": "profileExtras",
  "ui/profileJournal": "profileExtras",
  "ui/dmArchive": "profileExtras",
  "ui/recordingLibrary": "profileExtras",
  "ui/reportCache": "profileExtras",
  "plugins/messageLogger": "plugins",
  "plugins/voiceRecordingMenu": "plugins",
  ...(!editTools ? {"plugins/localMessageEdit":"plugins","plugins/personalLocalEdit":"plugins"} : {}),
  "ui/deletedMessages": "deletedMessages",
  "shell/offlineStartup": "offline",
  "shell/offlineRecordings": "offline",
  "ui/offlineStorage": "offline",
};
const stubs = new Map(Object.entries(CLEAN_STUBS).map(([from, to]) => [join(src, from), join(src, "clean", `${to}.ts`)]));
for (const [from, to] of stubs) if (!existsSync(`${from}.ts`) || !existsSync(to)) throw new Error(`clean stub ${from} -> ${to} doesn't match a file`);
const cleanStubs = {
  name: "xray-clean-stubs",
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, ({ path, resolveDir }) => {
      const target = resolve(resolveDir, path).replace(/\.ts$/, "");
      const stub = stubs.get(target) ?? stubs.get(join(target, "index"));
      return stub ? { path: stub } : undefined;
    });
  },
};

const options = {
  entryPoints: ["core/src/index.ts"],
  outfile: "src-tauri/inject/core.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: release,
  legalComments: "none",
  define: {
    __XRAY_VERSION__: JSON.stringify(version),
    __XRAY_DEV__: String(!release),
    __XRAY_PERSONAL_BUILD__: String(process.env.XRAY_PERSONAL_BUILD === "1"),
    __XRAY_CLEAN_BUILD__: String(clean),
    __XRAY_EDIT_TOOLS__: String(editTools),
  },
  plugins: clean ? [cleanStubs] : [],
  logLevel: "info",
  // Icons (Lucide, ISC) are bundled as SVG text, so nothing loads from outside at runtime.
  loader: { ".svg": "text" },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
