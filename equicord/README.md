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

### Bundled ports

`equicord/plugins/fakeDM` ships with xray and is copied into Equicord's
userplugins during every build. FakeDM adds a chat-bar button for local fake
messages and call entries in DMs and group DMs. Records last only for the
current Discord session. It has no Nightcord translator or private-controls
dependency. Repository-owned ports are included even without an external
userplugins folder; edits to their sources invalidate the build cache.

`equicord/plugins/realtimeTimestamps` also ships as a repository-owned port.
It defaults to AM/PM and shares XRay's Appearance → Time format preference
through the narrow `__xray.timeFormat` / `setTimeFormat` integration. Its own
12/24-hour selector updates the same preference; outside XRay it uses its
standalone settings. The plugin remains optional, and timestamp patches must
return strings because Discord also parses their results as text. Advanced
CustomTimestamps templates are independent and should not be enabled alongside
RealtimeTimestamps because both patch the same Discord component.

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


## Rebuilding the distributed source snapshot

The release source ZIP includes the exact optional userplugin sources under
`vendor/equicord/src/userplugins`. Before the first build, copy that directory
outside the vendor checkout: the pinned build deliberately cleans vendor files.
From the extracted source root in PowerShell:

```powershell
npm ci
Copy-Item -LiteralPath .\vendor\equicord\src\userplugins -Destination .\source-userplugins.local -Recurse
$env:XRAY_USERPLUGINS_DIR = (Resolve-Path -LiteralPath .\source-userplugins.local).Path
npm run app:build
```

Do the copy once into a new `source-userplugins.local` directory; preserve it
for later rebuilds. The existing `*.local` ignore rule keeps this local source
copy out of Git. This step is for the distributed snapshot. A normal Git
checkout can instead point `XRAY_USERPLUGINS_DIR` at its own authorized optional
plugin source folder; repository-owned ports are always included.
