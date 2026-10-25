# XRay 0.5.7 — live multi-source results and VPS collection support

This update retains the existing Tauri/TypeScript/esbuild stack and the custom-status work in 0.5.6. No framework migration or new library is required.

## Real Oathnet results

The earlier full report queried profile/history and the breach database, but not the separate stealer or victim search APIs. It also displayed/exported one breach page at a time. That was incomplete coverage; summary styling could not supply those missing sources.

**Load all live Oathnet results** now starts a provider search session and queries breaches, stealer credentials and victim profiles. It follows each returned cursor, reports each source's loaded count and total, and preserves all received source responses. Discord profile/history lookups are included in the Intelligence full search. The profile sheet retains its own existing profile/history lookup beside the multi-source search. Explicit Steam, Xbox and IP identifiers returned by search records trigger their respective enrichment lookups; identities are not inferred from unrelated names.

The display renders 50 received records per page, with a category selector. JSON, CSV and printable HTML export the complete received collection, not only the visible page. The 1,000-record renderer rejection was removed. Source/plan limits, request failures, repeated/missing cursors, stopping and a 20 MB response-memory budget are explicit incomplete states. Retry retains successful results and resumes failed/remaining sources. Opening a profile alone does not spend provider credits; starting a search does. Closing stops further requests after the in-flight request finishes.

IP/email/domain sections enumerate actual returned values, including nested/stringified data. Source search failures are distinct from verified empty results. A valid empty username-history response does not become a fabricated account record. Totals include queried enrichment responses and remain unknown while source totals are missing.

The current report module was verified against live Oathnet responses using the previously supplied export's Discord query. It returned ten breach records, zero stealer/victim records, a Discord profile, a Steam profile and an Xbox profile; username history returned no result. No IP values were returned for that query. These are real API results, not the earlier synthetic screenshot fixture. Private live responses/screenshots are excluded from Git and the share archive. Automated regression tests continue to use synthetic values.

The native bridge adds only fixed session/stealer/victim routes and validated `search_id`/cursor parameters. Provider keys remain in the existing Windows vault. Search sessions follow [Oathnet's documentation](https://docs.oathnet.org/guides/search-sessions), and cursor handling follows its [pagination contract](https://docs.oathnet.org/guides/pagination).

## Discord profile availability

Profile fields distinguish loading, request failure, missing server context, explicit nulls and fields not returned by Discord. Nickname, boosting and join dates belong to the selected shared server. The selected channel's camelCase/accessor guild-ID forms are recognized too. Member/profile HTTP failures are no longer silently presented as generic missing values. Explicit null legacy names clear stale cached names.

An account can have no legacy username, no shared premium date, no nickname and no current boost. Those are not dates that can be reconstructed from an account ID. Join dates are read from the actual guild member response. No values are invented to fill the table.

## Inline message images and videos

**Browse available messages** in the full profile now renders images directly and uploaded/direct videos with native playback controls. It reuses the mini-chat's trusted-media renderer, including image viewing, embeds, spoiler controls and source file links. Videos do not autoplay and use `preload="none"`; images load lazily. The report still renders only 25 messages per page.

Video attachment links are now retained alongside image links in eligible desktop and VPS observations. Missing attachments in a partial/text-only edit no longer erase previously received media references. Deletion, restart and serialization tests cover this behavior. Historical videos without retained references cannot be reconstructed. Expired links or unsupported codecs show an explicit original-link fallback. Third-party players that do not supply a trusted direct media URL remain links; arbitrary remote iframes are not embedded.

## VPS collection

The existing storage service can now run a Discord bot collector using Node 22's built-in WebSocket/fetch/SQLite support. It observes only enrolled testers in enabled shared-server monitors. It retains selected message text/attachment links, edits, deletions, profile/presence/custom-status changes, membership and voice-channel changes that Discord delivers to the bot. Text retention follows the tester's profile-history categories. A bounded persisted message cache supports deletion excerpts after collector restart.

`bot-history.<accountId>` is a separate, read-only API document. Bot updates cannot overwrite desktop profile notes/history, and client writes to the bot namespace are rejected. The full profile has **VPS bot history**, refresh, event details and exports. This requires server profile storage to be enabled. Multiple opted-in profile testers can be observed in each enabled monitored server.

VPS storage was updated and its authenticated bot-history endpoint verified. Actual always-on Discord collection still requires a valid bot application/token, enabled gateway intents and installation in the permitted test servers. No personal-account login token was used or stored. Without bot setup, the service remains available for storage and reports that collection needs configuration. See [VPS setup](VPS_BOT_SETUP.md).

Bots do not inherit the main/alt account's DMs or access to other servers. Global bio changes and events not delivered to a bot remain unavailable while the desktop client is closed. Image links are retained; attachment files are not archived and URLs can expire.

## Validation and files

The current combined core suite, TypeScript checks, native checks and server tests pass. Regression cases cover multi-source cursor exhaustion, source-specific retry, 1,101-record export retention with 50 rendered rows, nested IP values, honest profile availability, bot enrollment filtering, restart-safe message history, multiple testers, Bot authentication, gateway intents and read-only API access.

| Files | Change |
| --- | --- |
| `core/src/ui/oathnetFullReport.ts` | Live session, source paging, enrichment, category views and aggregate exports |
| `oathnet.ts`, `liveIntel.ts`, `importedReport.ts`, `reportExport.ts` in the same UI directory | Integrate the full report, preserve large received collections and recognize victim/client IP fields |
| `core/src/ui/profile.ts`, `profileJournal.ts` | Precise field states/server context and read-only VPS history |
| `core/src/ui/messageHistory.ts`, `messageBrowser.ts`, `chatMessage.ts`, `styles.ts` | Inline image/video messages, safe fallbacks and full-profile sizing |
| `core/src/history/model.ts`, `observer.ts` | Optional retained video references and partial-edit attachment preservation |
| `src-tauri/src/intelligence.rs`, `documents.rs` | Fixed provider routes, session validation and read-only bot namespace |
| `server/bot-history.mjs`, `discord-bot.mjs`, `log-server.mjs` | Opt-in persisted observations, gateway lifecycle and service integration |
| `server/bot-history.test.mjs`, `server/test.mjs`, affected core tests | Regression coverage |
| `scripts/configure-vps-bot.ps1`, setup notes, manifests | Private bot setup and matching distribution |

The existing custom-status files and tests from 0.5.6 are preserved. Native signed-in profile combinations and bot permissions/intents still require the test-team session checks. The installer remains unsigned.

Final delivery validation: 96 core TAP tests plus the existing core checks, TypeScript checks, 25 native tests, the server HTTP suite and all five bot tests pass. The optimized executable/NSIS installer built successfully. The restarted app reports 0.5.7, remains responding with a nonzero window handle, and has no startup error output or Application crash events since launch. Source/installer freshness, archive integrity and known-credential/private-endpoint checks passed. The deployed VPS module hashes match the matching source; its storage service is active, and its private bot environment still requires setup.
