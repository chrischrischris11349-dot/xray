// Bundles the mod core into one script that the Rust shell injects into
// Discord at document start (see src-tauri/src/window.rs).
//
//   node core/build.mjs            readable build for development
//   node core/build.mjs --release  minified build (used by `tauri build`)
//   node core/build.mjs --watch    rebuild on change
import { readFileSync } from "node:fs";
import { build, context } from "esbuild";

const release = process.argv.includes("--release");
const watch = process.argv.includes("--watch");
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

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
  },
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
