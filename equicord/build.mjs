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
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

/** Your own userplugins to include (equicord/userplugins.json), and where they live. */
const userplugins = JSON.parse(readFileSync(join(root, "equicord", "userplugins.json"), "utf8")).plugins;
const userpluginsDir = process.env.XRAY_USERPLUGINS_DIR ?? join(homedir(), "Vencord", "src", "userplugins");
const haveUserplugins = existsSync(userpluginsDir);
// Repository-owned ports are always included, including on CI.
const bundledPluginsDir = join(root, "equicord", "plugins");
const personal = process.env.XRAY_PERSONAL_BUILD === "1";
const bundledPlugins = readdirSync(bundledPluginsDir).filter(name => statSync(join(bundledPluginsDir, name)).isDirectory() && (personal || name !== "fakeDM")).sort();

/** A fingerprint of every file in the listed userplugins, so editing one triggers a rebuild. */
function userpluginsHash() {
  const hash = createHash("sha256");
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(path).update(readFileSync(path));
    }
  };
  for (const name of userplugins) if (existsSync(join(userpluginsDir, name))) walk(join(userpluginsDir, name));
  for (const name of bundledPlugins) walk(join(bundledPluginsDir, name));
  return hash.digest("hex");
}

const stamp = createHash("sha256").update(COMMIT).update(String(personal)).update(JSON.stringify(excluded)).update(shim).update(readFileSync(fileURLToPath(import.meta.url))).update(JSON.stringify(userplugins)).update(userpluginsHash()).update(readFileSync(join(root,"equicord","patches","PluginCard.tsx"))).update(readFileSync(join(root,"equicord","patches","WebScreenShare.tsx"))).update(readFileSync(join(root,"core","src","voice","captureConstraints.ts"))).update(readFileSync(join(root,"core","src","voice","sharePreview.ts"))).digest("hex").slice(0, 16);
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
    file: "src/api/MessageAccessories.tsx",
    find: '<accessory.render {...props} />',
    replace: '<div data-xray-plugin-ui style={{display:"contents"}}><accessory.render {...props} /></div>',
  },
  {
    file: "src/api/HeaderBar.tsx",
    find: 'className={classes(HeaderBarClasses.clickable, className)}',
    replace: 'data-xray-plugin-ui className={classes(HeaderBarClasses.clickable, className)}',
  },
  {
    file: "src/equicordplugins/moreUserTags/consts.ts",
    find: 'import { GuildStore } from "@webpack/common";',
    replace: 'import { GuildStore, React } from "@webpack/common";',
  },
  {
    file: "src/equicordplugins/moreUserTags/consts.ts",
    find: 'export const Tag = findLazy(m => m.Types?.[0] === "BOT") as RC<{ type?: number | null, className?: string, useRemSizes?: boolean; }> & { Types: Record<string, number>; };',
    replace: 'const RawTag = findLazy(m => m.Types?.[0] === "BOT");\nexport const Tag = ((props: any) => React.createElement("span", {className:"xray-role-tag", "data-xray-role": tags[(props.type ?? 0)-101]?.name}, React.createElement(RawTag,props))) as RC<{type?:number|null,className?:string,useRemSizes?:boolean}> & {Types:Record<string,number>};\nObject.defineProperty(Tag,"Types",{get:()=>RawTag.Types});',
  },
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

// Keep plugin-origin badges self-contained. The pinned card used externally
// hosted PNGs, which Discord CSP/offline requests can block.
cpSync(join(root, "equicord", "patches", "PluginCard.tsx"), join(vendor, "src/components/settings/tabs/plugins/PluginCard.tsx"));
// Bound capture work to the selected share budget; retain Discord's encoder limits.
cpSync(join(root, "equicord", "patches", "WebScreenShare.tsx"), join(vendor, "src/plugins/webScreenShare.browser/index.tsx"));
cpSync(join(root, "core", "src", "voice", "captureConstraints.ts"), join(vendor, "src/plugins/webScreenShare.browser/captureConstraints.ts"));
cpSync(join(root, "core", "src", "voice", "sharePreview.ts"), join(vendor, "src/plugins/webScreenShare.browser/sharePreview.ts"));

// Your own userplugins, only the listed ones. A clean checkout has none of its own.
if (haveUserplugins) {
  const target = join(vendor, "src", "userplugins");
  mkdirSync(target, { recursive: true });
  for (const name of userplugins) {
    const from = join(userpluginsDir, name);
    if (!existsSync(from)) {
      console.warn(`userplugin "${name}" isn't in ${userpluginsDir}; skipped`);
      continue;
    }
    cpSync(from, join(target, name), { recursive: true, filter: (path) => !path.split(/[\\/]/).includes(".git") });
  }
} else {
  console.warn(`no userplugins folder at ${userpluginsDir}; building without them`);
}

// Bundled ports take precedence over optional external copies.
for (const name of bundledPlugins) {
  cpSync(join(bundledPluginsDir, name), join(vendor, "src", "userplugins", name), { recursive: true });
}

run("pnpm", ["install", "--frozen-lockfile"]);
run("pnpm", ["buildWeb"]);

const userscript = readFileSync(join(vendor, "dist", "Equicord.user.js"), "utf8");
const notice = `/*! Equicord (https://github.com/Equicord/Equicord) at ${COMMIT}, GPL-3.0-or-later.
 * Built for xray with these plugins removed: ${Object.keys(excluded).join(", ")}.
 * Bundled ports included: ${bundledPlugins.join(", ")}.
 * Your userplugins included: ${haveUserplugins ? userplugins.filter((n) => !n.startsWith("_")).join(", ") : "none"}.
 * xray-build:${stamp} */\n`;
writeFileSync(out, notice + shim.replace("/*USERSCRIPT*/", () => userscript));
console.log(`wrote ${out} (${(Buffer.byteLength(notice) / 1024 + userscript.length / 1024).toFixed(0)} KB)`);
