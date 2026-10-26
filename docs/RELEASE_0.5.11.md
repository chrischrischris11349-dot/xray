# XRay 0.5.11 — preserve live mode preferences during configuration sync

Includes the saved edits, shield/media/control fixes, layout polish, recording
selection and screen-share audio work documented in [0.5.10](RELEASE_0.5.10.md).

A final reload regression was closed: a late server configuration response could
replace locally remembered presentation or personal edit-mode preferences. These
two live UI preferences now keep the current device's data across the merge,
including changes made while the read was in flight. Other configuration still
uses the existing sync behavior. Saved message overrides remain account-scoped
revision-checked documents; they are not folded into general settings.

119 core tests plus the existing core checks, typecheck, 28 native tests and the
server HTTP/bot/media suite pass. The new test reproduces a delayed, stale remote
configuration and verifies both mode preferences survive while ordinary settings
continue to sync. The 0.5.10 synthetic settings/popup and shield-reload preview
covers the unchanged layout. Live multi-person audio mapping and VoiceMeeter
screen-share routing still require device checks; no hardware or cross-client
performance guarantee is claimed. Restart once to load this native build. After
that Ctrl+R preserves saved modes and overrides. Earlier session-only edits that
were already lost cannot be recreated automatically.
