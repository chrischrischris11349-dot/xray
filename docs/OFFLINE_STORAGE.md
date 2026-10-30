# Server-preferred storage with local backups

Starting with 0.5.16, server storage keeps an account-scoped local replica in
IndexedDB (`xray-offline-v1`) inside XRay's WebView profile. It is separate from
Discord's message store. Keys, passwords and native provider credentials are
not copied into this database. These are ordinary local app data, protected by
the Windows account rather than a new encryption scheme.

Successful document reads are backed up. Edits are committed locally before
upload; when the server fails, the document transport returns the durable local
revision so the profile, notes, monitor list, audit and local-edit UI stay usable.
A missing backup is reported as missing, with local saving ready for new data.
Nothing reconstructs a never-copied server record. A local disk failure still
permits healthy server reads, and a write is not reported as saved if both
destinations fail.

The replica tracks local and server revisions separately. On retry, a pending
document is uploaded only if the remote base still matches, or acknowledged if
the identical value already arrived. A different server value is preserved;
the local edit stays pending for review/export. It is never silently replaced
or sent as a blind overwrite. The existing server compare-and-swap check remains.
When a conflicting server value has been read, its value/revision are included
in the local replica's `serverConflict` export field. A full-copy run stops and
reports a local-write/quota failure instead of counting an uncopied page as saved.

DM archives use the existing owner, target, channel and message identities.
Messages and mutation outbox entries commit together. History imports cannot
undo a newer edit or deletion; rotated attachment URLs are deduplicated by
pathname. Configure/ingest/checkpoint/delete operations replay in order after
reconnection, with the server's existing idempotent merge rules. Account
switches do not mix replicas. This observes enrolled targets and accessible
messages only; local edits never change archived originals.

Images, video, voice messages and file copies use bounded binary parts in
IndexedDB. Playback can read them after the source/server becomes unavailable.
An uncopied part first tries the server; when unavailable, a still-accessible
Discord CDN original can be downloaded using validated native HTTPS range
requests. The native 25 MB response limit and 250 MB file limit still apply.
If the original was deleted and no retained/local copy exists, the UI reports
that limitation. Unsupported codecs are not converted.

Consented VC recordings keep local chunks before acknowledging capture. Server
failure switches storage to those chunks, without dropping the captured bytes.
Completed pending clips can be uploaded with **Retry server uploads**. A saved
retry recording ID/checkpoint prevents a retried finish from creating another
completed server clip. Existing consent, participant selection, visible recording
indicator and 32 MB clip limits remain. Local storage does not add PC-off capture.

## Controls

The XRay panel has **Local backup & cache**:

- **Copy server data to this device** copies existing profile documents and
  paged message archives first, then available media and recordings. It does
  not initiate Discord searches or enroll new people. It can be paused; completed
  pages and files remain. Missing media sources are counted without stopping
  the text/history copy.
- The first connected launch with server profile storage enabled starts one
  background copy for that signed-in account. A completed-copy marker prevents
  repeating the full copy on every startup. Other accounts copy when signed in.
  New observed media have a persistent retry queue.
- **Retry server uploads** reconciles saved documents, replays archive mutations
  and uploads completed local recordings. Conflicting documents remain pending.
- **Clear downloaded cache** removes downloaded media/playback parts and saved
  lookup responses after confirmation. Saved history, local edits, captured
  recordings and pending uploads remain. Media cleared here may require its
  server/original to download again.
- **Export local history** exports JSON records for the current account. Binary
  media are played/downloaded separately. Saved provider responses are opened
  through **View saved lookups**, dated and explicitly historical. A failed live
  provider search is never replaced with cached data presented as a fresh result.

The cache has a 1 GB total safety limit, plus browser/OS storage quotas. No data
is silently evicted to meet that limit. Clear downloaded cache or export/free
space when needed. The JSON-only fallback in restricted runtimes has localStorage
quota limits; durable binary fallback requires IndexedDB. App/profile removal
or clearing all WebView data can remove this backup, so export important records.

The design uses existing `docs/DESIGN.md` card, button, spacing and text tokens.
No UI or database library was added. The existing serialized document session
and native authorization transports remain in place; the backup layer wraps
the narrow storage commands.
