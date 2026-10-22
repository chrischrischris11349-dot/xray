// Builds Equicord for xray: a pinned Equicord, minus the plugins in
// excluded.json, compiled as its userscript and wrapped so it runs inside
// xray's window (see README.md). Output: src-tauri/inject/equicord.js.
//
//   node equicord/build.mjs          build if the pin or the exclusions changed
//   node equicord/build.mjs --force  always rebuild
//
// Needs git, Node 22 and pnpm. The checkout lives in vendor/equicord (ignored).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "https://github.com/Equicord/Equicord.git";
/** Equicord 1.15.11.0, 2026-10-19. Bump deliberately, then rebuild and retest. */
const COMMIT = "c3167a0306c125a83cff83aa200238d339ecf2a3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor", "equicord");
const out = join(root, "src-tauri", "inject", "equicord.js");
const excluded = JSON.parse(readFileSync(join(root, "equicord", "excluded.json"), "utf8")).plugins;
const shim = readFileSync(join(root, "equicord", "shim.js"), "utf8");

const stamp = createHash("sha256").update(COMMIT).update(JSON.stringify(excluded)).update(shim).update(readFileSync(fileURLToPath(import.meta.url))).digest("hex").slice(0, 16);
if (!process.argv.includes("--force") && existsSync(out) && readFileSync(out, "utf8").includes(`xray-build:${stamp}`)) {
  console.log("equicord.js is up to date");
  process.exit(0);
}

const run = (cmd, args, cwd = vendor) => execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

if (!existsSync(join(vendor, ".git"))) {
  mkdirSync(vendor, { recursive: true });
  run("git", ["init", "-q"]);
  run("git", ["remote", "add", "origin", REPO]);
}
run("git", ["fetch", "-q", "--depth", "1", "origin", COMMIT]);
// A clean tree at the pin, so removed plugins come back before being removed again.
run("git", ["checkout", "-q", "--force", COMMIT]);
run("git", ["clean", "-q", "-fdx", "-e", "node_modules"]);

for (const name of Object.keys(excluded)) {
  const dir = ["src/plugins", "src/equicordplugins"].map((base) => join(vendor, base, name)).find(existsSync);
  if (!dir) throw new Error(`excluded plugin "${name}" isn't in this Equicord; update equicord/excluded.json`);
  rmSync(dir, { recursive: true });
}

/**
 * Other plugins that import from a removed one get a stand-in for just that
 * import. Each must match exactly once, so a changed pin fails loudly here.
 */
const FIXUPS = [
  {
    file: "src/equicordplugins/channelTabs/components/ChannelTab.tsx",
    find: 'import { getActiveAutoCompletes } from "@equicordplugins/questify/utils/completion";',
    // Questify is removed, so no Quest is ever auto-completing.
    replace: "const getActiveAutoCompletes = (): readonly unknown[] => [];",
  },
];
for (const { file, find, replace } of FIXUPS) {
  const path = join(vendor, file);
  const source = readFileSync(path, "utf8");
  if (source.split(find).length !== 2) throw new Error(`fix-up for ${file} no longer matches; update equicord/build.mjs`);
  writeFileSync(path, source.replace(find, () => replace));
}

run("pnpm", ["install", "--frozen-lockfile"]);
run("pnpm", ["buildWeb"]);

const userscript = readFileSync(join(vendor, "dist", "Equicord.user.js"), "utf8");
const notice = `/*! Equicord (https://github.com/Equicord/Equicord) at ${COMMIT}, GPL-3.0-or-later.
 * Built for xray with these plugins removed: ${Object.keys(excluded).join(", ")}.
 * xray-build:${stamp} */\n`;
writeFileSync(out, notice + shim.replace("/*USERSCRIPT*/", () => userscript));
console.log(`wrote ${out} (${(Buffer.byteLength(notice) / 1024 + userscript.length / 1024).toFixed(0)} KB)`);
