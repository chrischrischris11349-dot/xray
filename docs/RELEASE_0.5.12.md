# XRay 0.5.12

## Controls and alignment

Local editing now accepts Discord dispatchers that return `void`. A reversible
DOM rendering fallback also displays saved overrides when Discord memoizes its
message JSX. Native content and archived text remain unchanged. Overrides stay
per account until Reset Local Edit; session-only hiding remains temporary.

The profile action copies the actual native button's dimensions and resolves
the current person when clicked, including reused profile rows. Its center
matches Message, Add Friend and More. Activity cards remain excluded. Hide
Server now has a store-backed CSS fallback when Discord's guild-tree source
patch misses, with cleanup on stop and persisted hide/unhide state. Buttons in
XRay sheets center their contents and wrap within narrow cards.

These changes reuse `docs/DESIGN.md`, the native profile action styles and the
provided screenshots. No new design system or UI library was added.

## Saved DM archive

Full profile → Saved DM archive → Save / resume past DMs explicitly enrolls
the selected person in known private/group conversations that include them.
Open a DM first if it is absent from the client channel store. Only this
person's messages are uploaded. The authenticated desktop client retrieves
accessible history; no Discord account credentials are transferred to the VPS.

Pages load serially with a one-second yield. Pause stops after the current
operation; account/storage changes cancel the job. Reopening requires an
explicit Resume click. Saved checkpoints advance only after server writes
succeed. Resuming first checks recent pages for the gap since the last load,
then continues the older checkpoint. Rate-limit, permission and malformed
response failures pause loading with an error. Completion means the oldest
accessible page of the listed conversations, not a complete account history.

The VPS stores messages in separate indexed SQLite tables. Repeated history
pages and live observations share an account/channel/message key. Historical
pages cannot replace newer observed text or resurrect an observed deletion.
Archives have no age expiry and do not use the rolling log's 200-event cap.
Saved attachment references remain even when a later edit removes an attachment;
limits are twenty saved filenames and twenty URLs per media type per message.
Observed deletion markers cover in-flight history-page races (10,000/account).
Reading shows ten saved messages per page rather than loading the archive into
WebView memory. Stop live DM archiving preserves saved messages and files.

Supported returned Discord image/video attachment links are copied using the
existing archive service, with permanent archive references independent of
rolling profile-log retention. The report shows per-file save/playback status.
The service shares physical media blobs across accounts. Storage limits remain
250 MB per file and 20 GB total media; message JSON has a 500 MB/account quota
(operator setting `XRAY_MESSAGE_ARCHIVE_BYTES`).
Quota failures retain earlier saved messages and pause additional writes.
The operator can explicitly remove archive tables/references in a database
backup/maintenance workflow; clearing a rolling profile history does not erase
the separate DM archive.

New activity is saved only while an enrolled XRay client is connected. A
bounded 200-operation in-memory live queue reports failures; failed uploads
require backfilling still-accessible messages. Deleted-before-fetch content,
missed deletion/edit events during downtime, expired files that were never
copied, closed/unexposed conversations and inaccessible accounts cannot be
reconstructed. The VPS remains storage, not a personal-token collector.

## Validation

Regression tests cover synchronous dispatch, view restoration/reset, scope
isolation, retained originals, CSS hiding, historical/live overlap, sticky
deletions, no-expiry media references, paging past 200 messages, atomic quota
failure, checkpoint ordering, cancellation, recent-gap catch-up, exact cursors,
rate limits and preserving ten photos in a message.

Synthetic browser verification uses production controls and styles with dummy
data; it is not a Discord API or hardware test. The selected native XRay test
window did not expose usable input geometry, so this does not claim a complete
live-client regression pass or pixel-perfect behavior in every Discord build.
Live screenshare/audio behavior is unchanged by this release.
