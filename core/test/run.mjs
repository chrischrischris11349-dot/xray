// Bundles core.test.ts for Node and runs it. The banner stands in for the
// browser globals the core touches (window, document, and a WebSocket that
// records what it sends instead of connecting).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { build } from "esbuild";

const outfile = "node_modules/.cache/xray/core.test.cjs";
mkdirSync("node_modules/.cache/xray", { recursive: true });

await build({
  entryPoints: ["core/test/core.test.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "warning",
  define: { __XRAY_VERSION__: '"test"', __XRAY_DEV__: "true" },
  banner: {
    js: [
      "globalThis.window = globalThis;",
      "globalThis.document = {};",
      "globalThis.WebSocket = class { static OPEN = 1; constructor(url) { this.url = url; this.readyState = 1; this.sent = []; } send(data) { this.sent.push(data); } };",
    ].join("\n"),
  },
});

try {
  execFileSync(process.execPath, [outfile], { stdio: ["ignore", "inherit", "ignore"] });
} catch {
  process.exit(1);
}
