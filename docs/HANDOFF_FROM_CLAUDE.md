# Handoff from Claude (2026-11-01)

## Done and pushed to `main`

- `5a1d2dd` (tag `v0.5.21`): screen-share preview controls and fixes, the open
  conversation follows the chat bubble, real file names for saved photos, clean
  update feeds, new updater signing key, `XRAY_NO_EDIT_TOOLS` build switch, call
  control colors and title-bar press states.
- `6141ba6`: settings panel grouped into Voice / Appearance / App / Sync & storage;
  redraws keep scroll, focus and the plugin-search caret.
- `02ce84c`: bubble and quick-reply backdrop blur removed (it redrew over live video
  every frame); Screen-share status shows the outgoing video encoder, hardware or
  software, codec, size, sent FPS and the quality-limitation reason.
- Core suite: 203 pass. Native: 48 pass, 1 live Tor check skipped.

No feature was deleted from the source. `XRAY_NO_EDIT_TOOLS` is opt-in; without it,
builds are unchanged.

## Not done: needs you or another assistant

1. **Publish the releases.** Both are saved as drafts on GitHub. Browser automation
   could not attach files.
   - `v0.5.21` draft: attach the four files in `dist/release-0.5.21/`
     (`XRay_0.5.21_x64-setup.exe`, `.exe.sig`, `clean.json`, `SHA256SUMS.txt`), set
     the label to **Latest**, publish.
   - `Clean update feed` draft (tag `clean-channel`, pre-release): attach the same
     `clean.json`, publish. Replace that asset with every later clean release.
2. **Back up the new updater key** at `%APPDATA%\XRay-build\updater.key` somewhere
   private. The original key was missing, so 0.5.20 and older installs cannot verify
   newer updates: testers install 0.5.21 by hand once.
3. **Private personal-clean feed.** Clean Personal builds check
   `/updates/personal-clean.json` on the private storage server. It is not uploaded;
   until it is, their update check reports the feed as unavailable.
4. **Live checks not run** (the off-screen test copy has no signed-in account):
   share preview in a real share, bubble follow, settings panel focus/scroll,
   Discord "Save Image" names, the encoder readout.
5. **Screen-share game FPS (RTX 3070, 70 vs 144).** Install
   `dist/XRay_0.5.21_Personal_FPS-test_x64-setup.exe`, share the game window at
   720p30, read Screen-share status. If it reports a software encoder limited by
   CPU, the next step is WebView2 hardware encoding for whatever codec Discord
   negotiates (do not force codecs or bypass Discord limits). If hardware, look at
   capture cost (window vs entire screen).
6. **Release notes for `6141ba6` and `02ce84c`.** They are after the 0.5.21 tag;
   add them to the next version's patch log and `docs/RELEASE_*.md`.
7. **Personal builds with local message editing / FakeDM** were not built by Claude.
   `scripts/build-release.ps1 -Personal` builds them as before.

## Files that matter

- `src-tauri/src/updates.rs`: per-variant feeds (`feed()`), `CLEAN_FEED`.
- `src-tauri/src/downloads.rs`: `download_name()` for Save As names.
- `core/src/voice/encoderStats.ts`: outgoing encoder report (read on demand only).
- `core/src/voice/sharePreview.ts`, `equicord/patches/WebScreenShare.tsx`: preview.
- `core/src/ui/panel.ts`: settings sections and place-keeping redraw.
