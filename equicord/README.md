# Equicord inside xray

xray runs [Equicord](https://github.com/Equicord/Equicord) (Vencord plus
Equicord's own plugins, GPL-3.0-or-later, by Vendicated, the Equicord team
and contributors) inside its window, with xray's theme and plugins on top.

## How it's built

`npm run equicord:build` (also run by `npm run app:build`):

1. checks out the commit pinned in `build.mjs` into `vendor/equicord`;
2. removes every plugin listed in `excluded.json` (with the reason for each),
   and applies the small fix-ups in `build.mjs` for code that imported them;
3. builds Equicord's userscript (`pnpm buildWeb`);
4. wraps it in `shim.js` and writes `src-tauri/inject/equicord.js`, which the
   window injects before xray's own core.

It skips the rebuild when the pin, the exclusions and the shim haven't
changed. It needs git, Node 22 and pnpm.

## How it runs

- **Order.** Equicord runs first, so its webpack patcher is in place before
  Discord's scripts. xray's core then listens to Equicord's module events
  instead of hooking webpack itself (`core/src/webpack.ts`).
- **Network.** A userscript manager would let Equicord fetch any site.
  Discord's page can't, so `shim.js` sends those requests to xray's Rust side
  (`src-tauri/src/webfetch.rs`): https only, never your own machine or local
  network, no cookies, size and time limits.
- **Duplicates.** Where Equicord has the same plugin as xray, Equicord's takes
  over (`core/src/plugins/equicordTwins.ts`), and your on/off choice carries
  over once.
- **Choosing.** The plugin picker (`core/src/ui/picker.ts`) lists every xray
  and Equicord plugin. It opens on first login and from Ctrl+K → "Choose plugins".

## Updating

Bump `COMMIT` in `build.mjs`, run `npm run equicord:build -- --force`, then
check that every name in `excluded.json` still exists (the build fails if one
doesn't) and retest live.
