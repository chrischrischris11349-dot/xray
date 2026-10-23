# XRay 0.4.0

Mini-chat now supports replying to a specific message, an author-mention switch
(off by default), quoted reply previews, and live typing status from Discord's
TypingStore. A draft's reply belongs to its conversation and is retained if a
send fails. Logout/account changes clear session drafts and release previews.
The bubble can also open the currently selected server channel.
Each draft session has a generation token: a late send completion after logout
or feature shutdown cannot clear or unlock a newer session's composer.

Right-click a mini-chat message, or use its ellipsis button, for Reply,
Pin/Unpin, Copy text/link/ID, Open in Discord, sender profile, own-message
editing and permission-checked deletion. Message pins update from Discord's
store. Server pins require Pin Messages (bit 51); Manage Messages alone is not
sufficient. Editing another author's text on Discord is still unavailable.
The new menu supports keyboard navigation and disabled permission states.

Photo metadata is available from the mini-chat list's info button (choose a
local original), from a staged image's right-click menu, and for image
attachments in a message menu. exifr 7.1.3 reads supported EXIF/TIFF, XMP,
IPTC, ICC, JFIF and PNG tags on demand. It can display camera, capture time
and GPS only when present in the file. Tags do not verify identity/location
and cannot reveal a sender's IP. Discord may strip them. Downloads are limited
to original Discord attachment hosts, credential-free, 20 MB, and bounded
timeouts; local originals do not leave the device. Nothing is persisted by the
viewer. Unsupported/stripped files and expired URLs have explicit errors;
closing the loading sheet suppresses a late result. Output is capped and
binary fields are summarized. Parsing is deferred until selected; the parser
bytes are included in the single embedded core bundle.

## Server-backed records

The panel's **Store profile data on my server** switch moves profile notes,
opted-in history and moderation audit records to the configured personal XRay
server. Configure `sync_endpoint` and `sync_token` in
`%APPDATA%\app.xray.desktop\shell.json`, and deploy this version of
`server/log-server.mjs`. No server was configured on the development PC, so no
live migration/deployment is claimed.

Migration keeps local originals until upload/read-back acknowledgement, then
removes them; failed/conflicting migrations preserve them. Mode is one tiny
local account preference. Server mode has memory-only working data, no
persistent local fallback. Offline failures are visible and must be saved
before quitting. Background history writes coalesce during a slow request,
so snapshots do not build up in an unbounded network queue. Account documents
use atomic revision checks; another device's changed record is rejected,
never blindly overwritten. Export unsaved changes before reloading after a
conflict. Switching the mode off explicitly saves a local copy again and
retains the server record. Settings sync remains a separate local+remote
feature. App files and WebView caches still consume disk.

Other-author moderation deletion awaits its requested audit write before the
Discord request, rechecks account/permissions after that asynchronous write,
then writes confirmed/rejected outcome. If storage is unavailable the added
moderator action does not begin. View it with Ctrl+K > View moderation audit.
Discord's normal permission checks and native tools retain their behavior.

See [server setup and limits](../server/README.md) for retention and the
personal bearer-token model. History/audit docs are separate from logs and
the /clear endpoint. Any script in the Discord WebView could invoke granted
document commands; native token storage is not an isolation boundary for
document contents. Shared installers contain no server token, API key, login,
notes or history.

## Main changed files

- `core/src/ui/quickReply.ts`, `imageDrafts.ts`, `imageUpload.ts`,
  `chatMessage.ts`, `miniChatActions.ts`, `miniMenu.ts`, `photoMetadata.ts`,
  `dialog.ts`, `icons.ts`, `styles.ts`: chat interactions and photo inspection.
- `core/src/history/index.ts`, `core/src/ui/profileJournal.ts`,
  `core/src/ui/panel.ts`, `core/src/plugins/messageModeration.ts`: persistence,
  status and asynchronous audit enforcement.
- `core/src/shell/documentSession.ts`, `serverStorage.ts`: account mode,
  verified migration and serialized revision-aware document transport.
- `src-tauri/src/documents.rs`, `lib.rs`, `build.rs`, capabilities and generated
  permission: bounded native bridge, configured destination and Rust-held token.
- `server/log-server.mjs`, `server/test.mjs`, `server/README.md`: SQLite
  documents and authenticated compare-and-swap HTTP endpoints.
- `core/test/storage-chat.test.ts`, `core/test/history-storage.test.ts`,
  `core/test/history-discord.fixture.ts`, `core/test/run.mjs`: regressions for reply
  payloads/drafts, typing/pin permission, EXIF, migration/offline/conflicts,
  serialized saves, and audit-before-delete enforcement.
- Package/Cargo/Tauri versions and installer artwork: 0.4 release metadata.

## Verification

TypeScript checking, existing Node tests plus 10 storage/chat regression cases,
44 server checks, 17 Rust tests and all four installer-selection presets.
Browser fixture checks covered replies, quote previews, pins, typing text,
actual generated JPEG EXIF, successful migration/local-copy removal, offline
failure and retry. All conversations, pins and document transports in the UI
test were fixtures. No real messages were sent/edited/deleted/pinned. No live
server endpoint, native Windows notification delivery, or real Discord pin
and send compatibility has been end-to-end verified in this release.

Installer remains unsigned. Stack remains Rust/Tauri/WebView2, TypeScript/CSS
and Equicord React/TSX; it is not a Next.js rewrite.
