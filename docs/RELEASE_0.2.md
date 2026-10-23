# XRay 0.2

The desktop shell is Rust/Tauri with Windows WebView2. XRay's own panels use TypeScript and CSS with direct DOM rendering; bundled Equicord plugins use TypeScript/React/TSX. Build tools use JavaScript, with HTML for the shell and JSON/TOML configuration. This is not a Next.js application.

## Fake Deafen fix

Fake Deafen now runs independently of the moderation actions, incoming voice-state dispatcher and other plugins. It changes only outgoing gateway opcode 4 self-mute/self-deafen flags while enabled. Turning it off restores the last real outgoing self state. It starts off on each launch. A leave packet remains unchanged; reconnects replace the old connection and state. The toggle does not change local audio controls.

The old Server mute/deafen options and their recovery/interception paths have been removed. Old saved values for those options are ignored. An existing real server mute/deafen remains authoritative and must be removed using the server's normal moderation controls by someone with permission. The plugin does not bypass it.

Use the glasses button beside Discord's voice controls, the Fake deafen card in the XRay panel, or Ctrl+Shift+Q. A global shortcut can be assigned under Hotkeys. Enabling it before joining arms it for the next normal outgoing voice update. After enabling the plugin during an existing call, reconnect normally so it observes the voice state.

## Interface and media

- Settings can be moved by their header and resized from the lower corner. Bounds are saved locally and clamped to the current window. Focus the header and use Alt+arrows to move; Alt+Shift+arrows resizes.
- The palette row has a dedicated label/select grid. Graphite, Space Gray, Silver, Off-white and Mist & Oak share surface/text tokens.
- Mini-chat accepts PNG, JPEG, GIF, WebP and AVIF via its image button, paste or drop. Preview/remove attachments before pressing Send. Drafts are separate per conversation and remain on failure. Up to 10 images and 50 MiB staged across drafts; Discord's actual account upload limits still apply.
- Exact sender metadata or a Discord avatar can identify a desktop notification's sender. Unknown metadata retains Discord's supplied title; it never guesses from a channel's newest message. Presentation mode, passcode privacy and Streamer Mode hide previews.
- The small shield in the top-right toggles Presentation mode, hiding XRay panels, bubble, title-bar voice controls, Fake Deafen/FakeDM controls and notification previews. It does not change the underlying voice settings or remove notifications already delivered to Windows.
- Optional Screen-share capture preferences requests 30/60 FPS and can prefer an application window in the native picker. Discord's Share screen workflow still selects the actual source. Screen-share status distinguishes requested from actual capture resolution/FPS. Capture FPS is not the transmitted/encoded FPS; hardware, network and Discord session limits still apply.

## Installer

The branded, per-user Windows installer offers Recommended, Minimal, All optional plugins and Keep existing (upgrade), plus individual choices from the actual bundled catalog. Choices select enabled features in a shared binary; they do not remove optional plugin code. Required plugin APIs and WebView2 remain available.

Choices are written to the app's local configuration directory and applied before both plugin engines start. The bootstrap preserves other settings, applies a selection once, and rolls back partial writes. Keep existing preserves the prior selection file. Test harnesses write only into the repository's ignored cache, never the user's live configuration.

This build is unsigned unless a signing certificate is separately configured. It contains no user's API keys, Discord session, imported reports or private settings. A friend signs in and configures their own services.

## Performance changes and limits

1. Reuse normalized search titles/keywords, invalidating when fields change. Query normalization runs once per rank operation. Scores/order remain unchanged.
2. Deduplicate overlapping added DOM roots once per observer batch before notifying watchers. Descendants covered by an added ancestor are not rescanned separately.
3. Retain unchanged mini-chat row nodes across store refreshes. Only changed/removed/reordered rows update, preserving media and spoiler state. The cache remains bounded to the visible message window.

Run `node core/test/performance.mjs` for reproducible synthetic search/DOM microbenchmarks. These are not app startup, memory, battery, screenshare or Discord-versus-XRay benchmarks. No claim of overall superiority over Discord/Vencord/Equibop follows from them. Adding features can increase bundle size despite lowering these hot-path costs.

## Validation

`npm run typecheck`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `node scripts/test-installer.mjs`, and a production NSIS build. Browser fixture checks cover the real panel geometry, image staging/send cleanup through a mocked uploader, media display and Presentation mode. Native voice calls, Windows toast delivery, the OS capture picker, transmitted FPS and an interactive installation still need a manual smoke test; synthetic tests do not establish those live outcomes.

## Remaining service limits

IntelX and Snusbase tabs currently support authorized local report imports; a live connector has not been implemented. Supplied API keys are not embedded in source or the installer. Oathnet uses the separate local helper configuration, with errors reported directly. Local edits/FakeDM records are session-only. Message totals describe loaded cache coverage, not a complete lifetime search. Private IP addresses cannot be inferred from Discord profile data.
