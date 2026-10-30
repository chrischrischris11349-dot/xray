# XRay 0.5.16

Fixes native Discord navigation, restores normal voice networking with separately
protected browser links, and adds durable local storage fallback.

- Internal Discord links remain in XRay even when Discord's label contains
  invisible formatting characters. External links retain offline destination
  review from [0.5.15](RELEASE_0.5.15.md).
- Normal XRay networking/VC and Tor Browser links are separate saved choices.
  Strict Tor remains an optional chat-only mode. The browser launcher uses an
  isolated profile and Tor Browser's `--allow-remote` switch to avoid repeated
  profile-lock prompts; locked proxy policies still prevent direct fallback.
  The normal Firefox and Tor Browser profiles are not edited or used for links.
- The full-profile action uses the active XRay foreground and raised-surface
  tokens, explicit SVG stroke and centered native-sized geometry. The graphical
  fixture measured a 32 × 32 button, `rgb(242,242,244)` foreground and
  `rgb(41,42,45)` background in Graphite.
- Saved profile/history, notes, local edits, monitor lists and audits have local
  replicas. An unreachable server no longer prevents loading a saved local copy
  or saving a new local edit. Reconnection retains revision checks and preserves
  conflicts rather than overwriting another device.
- The DM archive can save locally with the server unavailable or disabled.
  Original text, attachment references, deletion markers and duplicate identity
  rules persist across restarts. Binary media/playback parts and consented VC
  clips have durable local copies. Available old server data can be copied to
  this device from the new backup controls, with a background first-copy pass.
- Cache controls report size/pending saves, retry uploads, export JSON and clear
  downloaded cache while preserving saved history/edits/pending work. Saved
  provider responses are explicitly historical; live searches keep truthful
  success/failure behavior. See [offline storage](OFFLINE_STORAGE.md).

Validation: 145 core TAP tests plus the existing checks, TypeScript, 33 native
tests and three Python launcher tests pass. Nine new tests cover restart recovery,
offline edits, server conflicts, local disk failure, account isolation, archive
deduplication/deletions/checkpoints, retained media and consented recording retry.
An actual IndexedDB browser fixture copied data, saved an edit during a simulated
outage, reloaded and recovered that edit. Clearing downloaded cache retained the
pending edit and message record. [Safe preview](images/xray-0.5.16-local-backup.png).
This fixture uses synthetic data and a stubbed network, not a live VC capture.

The running 0.5.15 hotfix visibly opened a server channel and showed Voice Connected
after normal networking was restored. The configured storage HTTPS request returned
200 with retained history. The VPS service was active with 187 GB free; the reported
storage failure was not a full disk. The Tor Browser check page remains unverified
because its window cannot be read through the desktop automation tool. Native Tor
HTTPS and SOCKS failure/DNS behavior were checked independently in 0.5.15.

Limits: local backups use disk (1 GB app limit), source permissions and codec
support remain, and server-only files must be copied while reachable. No new
always-on Discord collector is included. Windows Authenticode is not configured;
updater signatures, corresponding GPL source and checksums accompany installers.
