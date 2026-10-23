# XRay 0.3 — profiles, observations and moderator controls

## Server join dates and profile reports

The full profile keeps an explicit server context, reads both cached `joinedAt` and REST `joined_at`, and makes one normal member request for the chosen server to fill missing/stale data. A shared-server selector changes the context for dates, roles and nicknames. The profile shows a readable join date plus the full timestamp in the local timezone and UTC. Missing/inaccessible member data stays unavailable; account creation and server creation are never substituted.

Each full profile includes a factual report, copy actions and private notes. The report uses available profile data and identifies snapshot/coverage limits rather than assigning speculative scores. Notes persist only in the current account's local WebView storage.

## Opt-in local history

Expand **Set up history** on the full profile, choose categories and retention, and save. Categories cover global username/display-name/avatar/banner/bio changes, visible presence, explicit member add/remove events in shared servers, deletions attributable to known message authors, and message edit metadata. Message bodies are not saved. Server-specific bios are not mixed into global-bio history.

History starts with a baseline. Pausing, restarting or reconnecting does not reconstruct missing transitions. Observation timestamps describe when XRay saw a change, not a guaranteed occurrence time. Profile-change values use previews capped at 300 characters, marked with an ellipsis when shortened. Offline and invisible cannot be distinguished. Member removal can mean leaving, a kick or a ban. The [Discord delete event](https://docs.discord.com/developers/events/gateway-events#message-delete) provides message/channel identifiers, without the deleting actor; the counter means **this author's messages observed deleted**, not proof the author deleted them.

There is no polling, private-server discovery or historical backfill. Only events delivered to this client are observed, so other plugins dropping events or missing cached authors can reduce coverage. Synthetic FakeDM clears and local edit/delete events are excluded. Retention is 7 or 30 days, up to 30 local profiles, 200 events per profile and 2,000 events overall. The latest 40 events are shown; copying the report and history includes all retained events. There are clear/remove controls.

Data lives under `xray.profileHistory.v1:<signed-in-account-id>` in local WebView storage, separate from settings sync and log-server reporting. No history, notes or account sessions are included in the installer. Local storage failures are surfaced as session-only persistence warnings. Data is local storage, not an encrypted vault.

## Global moderator toggle: exact scope

The single source of truth is `enabledFor`/`moderationEnabled()` in `core/src/plugins/messageModeration.ts`. It is global across XRay conversations for the signed-in account and starts off each launch. The plugin adds an On/Off indicator, a message-menu action and a command-palette toggle. Presentation mode hides custom controls under the existing privacy behavior.

Activation requires the current account to have Discord's **Manage Messages** permission in the currently open server channel. Each added deletion action checks the switch, ownership, server context and current channel permissions immediately before calling the existing authenticated Discord HTTP client. Discord's own server makes the final permission decision; a 403 is never treated as success. There is no new self-declared administrator role.

This is a client preference, not a new server authorization system. XRay cannot make Discord's server enforce a private client switch. Turning it off restricts XRay's added actions to owned messages; Discord's existing moderator tools retain their normal behavior.

**Editing someone else's message on Discord is unavailable, including for moderators.** The [Discord message API](https://docs.discord.com/developers/resources/message#edit-message) keeps content editing author-only. XRay's existing **Edit Locally** is labeled as changing only the viewer's copy; other-author local edits now require the global controls switch. Disabling the switch does not silently publish or undo local display changes. Reset Local Edit remains available. No server ownership or permissions are bypassed.

## Audit entries

Other-author deletions through the new action write an entry before the request and update its outcome to confirmed or rejected. Entries contain actor ID, message/channel IDs, an ISO timestamp and outcome, without message bodies. They live at `xray.moderationAudit.v1:<actor-id>` in local WebView storage, bounded to 500 entries / 30 days. Use Ctrl+K → **View local moderation audit**. If the initial audit write fails, the added moderator deletion does not start. A confirmation-write failure after a successful server response is reported explicitly as a completed deletion with an audit-write problem.

Confirmed moderator deletions also use the existing `reportEvent` convention (`kind: plugin`, `source: messageModeration`) when the user has configured and enabled log-server reporting. That report contains action metadata and the actor, never message text. Discord controls its own server audit logs. The local journal is not tamper-evident and is not presented as a server audit authority.

## Notification photos

Notification identity uses an exact sender avatar when available, then a known server icon, then the supplied icon. It never guesses from the newest channel message. Native images still require Discord CDN paths, bounded PNG downloads and the existing privacy checks. The 64-image cache now evicts old cached images instead of permanently refusing new images when full. Streamer Mode, passcode privacy and Presentation mode still hide sender/content previews.

## Verification and limits

TypeScript checks and the Node test suite cover date shapes and context isolation; opt-in categories, baselines, retention and deletion attribution; moderator ownership/role/switch checks; successful and forbidden mock API responses; audit outcomes; and sender/server icon selection. Rust tests include cache eviction and narrow CDN validation. The native installer presets are checked against all 380 selectable features. Browser fixture checks exercise real profile UI, server selection, note persistence/account isolation, a bio observation and toggle authorization.

No live messages were deleted or edited during validation. Native Windows toast delivery and live Discord profile/event availability still require normal usage to confirm; fixtures do not establish those outcomes. This is the existing Tauri/WebView2, TypeScript/CSS and Equicord React/TSX project, not Next.js. The installer remains unsigned.

## Changed files in this release

- `core/src/ui/profile.ts`, `memberDates.ts`, `profileJournal.ts`, `styles.ts`: server context/member dates, report, notes, history setup/timeline and scoped styles.
- `core/src/history/model.ts`, `observer.ts`, `index.ts`, and `core/src/index.ts`: bounded local history, passive event observation and startup wiring.
- `core/src/plugins/messageModeration.ts`, `localMessageEdit.ts`, `builtins.ts`: global controls, permission checks, audited deletion, local-edit gating and plugin registration.
- `core/src/shell/notificationIdentity.ts`, `notifications.ts`, and `src-tauri/src/notify.rs`: sender/server image selection and native cache eviction.
- `core/test/profile-history.test.ts`, `core/test/run.mjs`: the new regression cases and browser-like test globals. `notify.rs` also contains the new native cache test.
- Package/Cargo/Tauri version metadata, the generated plugin catalog, and `scripts/installer.mjs`, `installer-art.ps1`, `package-source.py`: version 0.3.0 packaging and installer choices/artwork. Sources and private local data remain separate.
