# Signed updates and build variants

The team installer includes Tauri's signed updater. XRay checks once shortly after
startup, on a later focus after six hours, and on request in the panel. Available
updates show a small notice. Download verifies the installer signature; Restart
and apply installs it. Plugin choices survive updater-mode installs. Pending
history must save, and a recording must be finished before restart.

Existing builds without the updater need this installer once. The updater cannot
retroactively add itself to an older executable. Windows initial installation is
still unsigned for Authenticode; Tauri update signatures are a separate mechanism.

The team feed is the repository's latest release asset `latest.json`. Your personal
build uses `/updates/personal.json` on your configured private HTTPS storage server,
with its existing token held only in Rust. Personal update files are authenticated
and never uploaded to the public team release. There is no cross-channel fallback.

Use `scripts/build-release.ps1` for Team or add `-Personal` for your own installer.
`XRAY_PERSONAL_BUILD=1` gates local editing, Fake Deafen and the FakeDM port during
core/plugin/installer generation. These controls are absent from the team catalog.
Both builds retain normal Discord permissions for real edits and deletions.
The personal local-edit switch starts off for each new account and remembers an
explicit opt-in across reloads and restarts. Saved overrides are account-scoped
`local-message-edits` documents, kept on the VPS when server storage is enabled,
or in captured localStorage otherwise. Switching the mode off suspends them;
right-click Reset Local Edit deletes the saved override. Session-only message
hiding remains temporary. At most 1,000 overrides / 1 MB are saved; reaching the
limit reports an error without evicting existing edits. Discord messages and
archived history are never rewritten. The shield hides controls, preserving their
operation and its own state across reloads. Notification preview privacy is
independent of the cosmetic shield; streamer/lock privacy still applies.
These are build variants of GPL source, not an account-authentication boundary.

The updater signing key is outside the repository at `%APPDATA%/XRay-build/updater.key`.
Its directory is restricted to the current Windows user and SYSTEM. Keep a private
backup. Do not add it or its generation log to Git, source ZIPs or installers.
Only its public key is in `tauri.conf.json`. Forks need their own key and feed.
Build tooling now requires stable Rust 1.90 or newer for the updater plugin.

Example key generation for a fork, followed by configuring that key's public value:

```
node node_modules/@tauri-apps/cli/tauri.js signer generate --ci -w <private-path>
```

The NSIS installer and its `.sig` file are published together. A feed contains a
SemVer version and `platforms.windows-x86_64` with the HTTPS installer URL and the
signature file's contents. Signatures are mandatory. Neither arbitrary URLs nor
signatures can be supplied by Discord's page to XRay's narrow `app_update` command.
The public feed must refer to the team installer; the private feed to Personal.

Implementation reference: [Tauri updater](https://v2.tauri.app/plugin/updater/).
