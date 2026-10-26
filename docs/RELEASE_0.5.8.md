# XRay 0.5.8 - archived history media and profile action fixes

## Actual server media storage

Opt-in profile history using server storage now archives the actual photo/video files on the configured VPS. Saving desktop or bot history indexes its retained Discord URLs and queues copies in two download workers. Existing histories are indexed on startup. Download, source expiry, quota and media-type failures remain explicit failed states.

Files are deduplicated per account and attachment path. Rotating a signed source URL does not duplicate a saved file; a newly recovered URL requeues a failed copy. Writes use private permissions and atomic rename. Only HTTPS Discord attachment hosts/paths are accepted, redirects are refused, media types are validated and download timeouts apply. Limits are 250 MB per file and 20 GB total. No Discord account token is used.

The existing storage token stays in Rust. Authenticated status requests return one-hour signed playback URLs. The private file route validates signatures and supports byte ranges/HEAD for video seeking. There is no public directory listing. Archived photos open in the existing viewer; only exact archive URLs registered from a native response are accepted there.

Profile and VPS history show photos directly inside message events. Media events start expanded, photos load lazily, and videos require playback with preload=none. The redundant Images disclosure is removed. Archive checks are limited to four concurrent native requests, with in-flight deduplication and saving/failure/retry states. Playback URLs can be refreshed.

## Older entries and retention

Older entries saved with filenames but no media URLs offer Recover original attachments. One user-triggered, permission-limited read must return the exact message and author. Attachment references are updated across matching observations and saved to the current backend, preserving historical text. Server storage then copies the files. Entries with existing URLs expose the same action under Attachment recovery to refresh expired links. Deleted files that were never saved and are no longer available from Discord cannot be reconstructed from filenames.

Attachment capture accepts arrays, native collections, keyed objects and URL-only media. Partial edits preserve observed media. Older desktop events can also recover missing metadata from the same author's already-loaded message.

Retention accepts custom whole days up to 365,000; 0 means no age expiry. Desktop and bot history preserve this across restart, and bot message cache age follows the longest enrolled retention. Other limits remain explicit: 200 events per profile, 2,000 across profiles, a 1.8 MB history document and 10,000 cached bot messages. Increasing days cannot recover already-pruned events. Archive references follow retained history: expiration, clearing or removal of their last reference removes the file. No-expiry references have no age cutoff.

## Profile action placement

The report action requires a compact row of actual profile controls such as Message or Add Friend. It cannot climb through activity cards looking for another button. Tooltip wrappers still work and the control stays beside More. Unknown layouts retain right-click Open profile report. Existing Discord controls and docs/DESIGN.md remain the references. These layout changes add no library; signed updates use the official Tauri updater plugin.

## Validation

107 core TAP tests, the existing core checks and TypeScript validation pass. Regression cases cover inline media/fallbacks, native attachment shapes through edit/delete/restart, account isolation, immutable text, exact original-message identity, server playback URL handling, immediate recovery refresh, custom/no-expiry retention, wrapped controls and activity-card exclusion.

The server HTTP suite and eleven bot/media tests pass. Media cases verify saved bytes after source deletion and archive restart, authenticated status, signed/expired playback, byte ranges, account separation, rotated links, no-expiry retention, clearing, quotas and unsafe URLs. Native library tests pass (26 cases). The history document format remains version 1.

The VPS service was updated and remains active. Initial backfill found five historical source URLs returning HTTP 404, so those copies were reported failed. Recovering still-existing originals or observing new attachments is required for missing copies. Always-on collection while the PC is off still requires the separately configured authorized bot; server storage alone does not observe Discord. The installer remains unsigned.


## Additional release polish

Archive media now travels through bounded authenticated native chunks and local
blob URLs. Discord's restrictive image/media policy is kept intact. Photos load
near the viewport; videos load only when requested, with progress. Blob data is
shared within the current account and released when its report disappears. Total
retained playback data is limited to 256 MB; large videos require buffering before
playback. External archived-file links remain available for unsupported codecs.
A labelled generated-media browser fixture verified photo decoding and video
playback under a policy that blocks external images and videos. This is not a
claim that an expired original has been recovered.

Repeated gateway creates/deletes and edit replays no longer duplicate bot history.
Duplicate monitor enrollment is collapsed. Server history writes also collapse
repeated create/delete entries inside the same account document. Account access
references remain separate, while identical attachment files share one physical
copy across accounts; removing one account's reference does not break another's.
The VPS view hides events already visible in desktop history, retaining source
observations in exports.

The panel now includes chat-bubble corner placement, collection coverage and signed
update controls. Profile headers have a bundled client-info icon. Other users show
Client undisclosed because Discord exposes platform presence, not reliable Vencord
or other-mod identification. Your own session is identified as XRay. See Discord's
[client status fields](https://docs.discord.com/developers/events/gateway-events#client-status-object).

Separate Team and Personal installers isolate personal local editing, FakeDM and
Fake Deafen. The Personal global switch is explicitly local and consented, starts
off, and restores original views when disabled. Team keeps normal permission-based
moderation. Signed update downloads and restart-to-apply preserve plugin choices,
wait for history saving and block restarts during pending recordings. Personal
uses a private authenticated feed; Team uses the public release feed. See UPDATES.md.

Account-only capture ends when XRay or the PC is off. This release never treats
storage availability as proof of always-on event collection. Collection coverage
is explicit and test-team controls do not include a personal-token VPS collector.
