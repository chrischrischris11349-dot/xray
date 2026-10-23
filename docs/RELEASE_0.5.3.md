# XRay 0.5.3 — message reports and image viewing

This remains the existing Tauri/Rust shell, TypeScript/esbuild core and React/TSX Equicord plugins. There is no Next.js application or framework migration. The dark surfaces, purple seasonal palette, control styles and Lucide icons reuse the existing design system in `docs/DESIGN.md`.

## Behavior

- Ordinary clicks on mini-chat image previews and history images open an in-app viewer. Fit/actual-size controls, Escape, focus restoration and an unavailable-image message are included. The profile underneath stays mounted. Modifier-clicks retain normal external-link behavior. Only trusted raster/data and media URLs are accepted; active SVG and arbitrary tracking hosts are rejected.
- Profile history identifies DMs, group DMs and server channels from ChannelStore. If a channel has disappeared, its ID remains and its type is explicitly unavailable.
- **Browse available messages** merges loaded messages across accessible channel-store shapes with retained observations, including deleted messages. It deduplicates messages, groups their edit/deletion events, shows sent and observation times separately and renders 25 messages per page. Retained-only messages use the newest known text.
- **Search next server / DM page** makes one request per click. Guild searches use the author filter and total-result-based offsets; DM history uses exact string snowflake cursors and filters the author. Permission errors, indexing delays, malformed responses and rate limits are reported rather than interpreted as zero matches. Search stops at 1,000 fetched matches per session; Discord guild-search offsets also have a ceiling. Skip can move past an unavailable scope. Nothing runs as a background scan.
- Newly observed edit entries can retain previous/edited text and sent time when Observed messages is enabled. Message text is bounded to 4,000 characters; the existing record, age and UTF-8 document limits still apply. Old truncated data cannot be restored. Deletion actors remain unknown. Membership removal observations do not distinguish leaving, kicking and banning, or establish an exact departure time.
- Current avatar, bio, status, account and server join information remain in the full profile. Exported profile history also includes available avatar/banner references and membership observations. Historical profile values retain their existing limits.
- The brown vertical own-message border and its negative left margin are removed. This fixes the line beside compact messages without shifting avatars or timestamps.
- Live IntelX/Snusbase/Oathnet results, imported reports, profile history and message reports provide JSON, CSV and printable HTML downloads. Exports preserve source data; CSV cells defend against spreadsheet formulas. Printable HTML escapes supplied content and contains no script. Source metrics not supplied are null/unknown rather than fabricated; top-source counts describe returned records.
- Copy uses the Clipboard API with a selection-based WebView2 fallback and an explicit failure path. Plain-text paste replaces the selection, respects field limits, emits input and avoids interfering with existing image-paste handlers. Report text remains selectable.
- Optional subject IDs associate provider results with a full profile for the current account/session. Imported exports are associated by their declared subject ID. These associations are not independent identity verification. Stored results are bounded and session-only, not silently saved to disk or uploaded.

## Server browser and data limits

The bundled Equicord ServerSearch plugin opens Discord's server switcher; it does not supply breach/account records. Its implementation and the plugin system are unchanged. Import a matching JSON/HTML report into Intelligence, or attach provider results using the optional Discord subject ID, then reopen the profile to include them. No separate server-browser account export was supplied, so absent results cannot be reconstructed.

Search cannot return historical deleted content or previous edits that were never observed and retained. It also cannot guarantee every lifetime message: permissions, source indexing, missing DMs, API limits and session caps apply. Previously unknown join/leave dates are not invented. Expired Discord image URLs may remain unavailable.

The guild query and pagination follow [Discord's message resource documentation](https://docs.discord.com/developers/resources/message#search-guild-messages). DM paging follows Get Channel Messages in the same resource. The app uses its existing HTTP client and account permissions; no new token or auth mechanism was introduced.

## Changed files

| Files | Purpose |
| --- | --- |
| `core/src/ui/imageViewer.ts`, `chatMessage.ts`, `profileJournal.ts`, `root.ts` | In-app images, modal key priority and history image actions |
| `core/src/ui/clipboard.ts`, `dialog.ts`, `styles.ts` | Copy fallback, selection-aware paste and selectable results |
| `core/src/ui/messageHistory.ts`, `messageSearch.ts`, `messageBrowser.ts`, `profile.ts` | DM/channel normalization, paged queries and merged message reports |
| `core/src/history/model.ts`, `observer.ts` | Bounded sent timestamps and before/after edit data |
| `core/src/ui/reportExport.ts`, `reportCache.ts` | Safe formats, printable reports and account/subject-scoped result association |
| `core/src/ui/liveIntel.ts`, `intelligence.ts`, `importedReport.ts`, `oathnet.ts` | Provider/import exports, incremental records and report integration |
| `core/src/theme/shell.ts` | Remove the vertical border artifact |
| `core/test/reports.test.ts`, `run.mjs` | Regression coverage integrated into `npm test` |
| Build manifests, `.gitignore`, README and these notes | Release version and distribution hygiene |

## Validation

TypeScript and the full `npm test` suite pass. Seven new tests cover DM detection and collection shapes, merged deletions/latest edits, guild query parameters and pagination, indexing/permission/rate errors, exact DM cursors, CSV/JSON/HTML formats, clipboard fallback, safe viewer URLs and persisted edit history. Browser fixtures verified the viewer, Escape, paste into profile notes, a correctly labeled DM report and the CSV download action. Fixtures use synthetic data; no live provider credits or private-account lookups were used for UI tests.

Native download dialogs, clipboard permissions and live API account/permission combinations still need a user session check. CodeRabbit CLI was unavailable, so no CodeRabbit scan is claimed. The build remains unsigned. Matching source and third-party notices are included in the share archive; credentials are excluded.

Release verification: all 23 native tests and the server suite passed. The optimized 0.5.3 build and installer completed. The production process remained responding with a nonzero main window handle and no Application crash events since launch. Source/archive credential and private-endpoint scans passed.
