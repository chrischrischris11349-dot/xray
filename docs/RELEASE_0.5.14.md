# XRay 0.5.14

Adds playable retained voice messages, before/after profile-photo history,
notable change tags, profile tabs and consented recording playback. Reuses
the existing design tokens and bundled Lucide icons; no UI dependencies added.

- Local overrides now notify the mini chat directly, so a no-op native store
  update does not leave the old bubble rendered. Native message lookup also
  supports locating the row from its content element. Overrides remain per
  account, survive reloads until reset, and never rewrite archived originals.
- Short notification text can identify a unique recent sender; identical
  ambiguous texts remain unresolved. Metadata is captured before native Flux
  handlers run. Avatar resolution accepts both trusted Discord CDN hosts and
  normalizes native toast images to PNG.
- Retained events and paged DM archives now include audio and file references.
  Players use explicit controls and no autoplay. Supported audio, images,
  video and file copies are archived on the VPS; unsupported/expired sources
  show errors or download fallbacks. Profile photo hashes render as actual
  before/after pictures and can retain server copies under existing retention.
- Changes have category icons and compact accent tags. New changes remain
  marked until explicitly reviewed; the review position is account-scoped and
  persisted with the history document. Only observed changes are described.
- Full profiles have Overview, Changes, Text, Media and Recordings tabs.
  Text/media archives use bounded server-side filtering and pagination.
  History loading explicitly says messages sent by the selected person;
  current-account outgoing messages are excluded.
- Consented VC recordings have an on-demand, chunked audio player in
  Intelligence and profile views. New clips carry participant associations;
  older unassigned clips remain in Intelligence. Being present in a recorded
  call does not prove a participant spoke. Playback holds one clip per view
  in memory and releases it on close; no persistent local audio cache.

Limits remain explicit: source permissions, unavailable old media, observed
events only, rolling-history/document quotas, 500 MB/account DM JSON, 250 MB
per archived file / 20 GB media, and 32 MB/clip / 512 MB recordings with seven
days of recording retention. Storage alone does not collect new activity when
the PC/client is off. Filename-only older logs need an exact accessible
original; deleted, never-archived content cannot be reconstructed.

The installed executable was still 0.5.11 during investigation. Installing or
applying the native update and restarting is required; Ctrl+R alone continues
to run the old embedded client.

Follow-up polish completed in XRay rather than handed to another assistant:
- Local overlays copy the native foreground and text fill, avoiding black text
  inherited from a dark message row. The account switch waits for UserStore,
  and edited rows repair their override after native reconciliation. Only
  visible edited rows receive redraws; there is no polling loop.
- Forwarded message snapshots retain text, audio and video. Reply targets are
  never treated as messages sent by the selected tester. The snapshot fields
  follow Discord's Message Snapshot Object documentation.
- Overview now includes the saved DM archive, with progress while older pages
  load, stable media rows, text/media filters and exact-message-link recovery.
- Last observed online and latest presence observation survive restart for
  profiles opted into presence history. Offline/invisible is never treated
  as proof of logout; opening cached profiles does not invent a new timestamp.

Validation: 133 core TAP tests plus existing checks, typecheck, 28 native tests,
the HTTP checks and 23 server tests passed. A generated WebM/Opus clip decoded
and played to completion through the production recording player in a browser
fixture (currentTime advanced, ended=true, readyState=4, no media error).
This was synthetic audio, not a live VC capture or a private conversation.
The VPS returned two existing completed clips; an archived real profile-photo
chunk was verified without displaying private image data. Some older photo
URLs failed to archive and remain explicitly unavailable.

The local-edit browser fixture verified readable computed foreground
(rgb(238,238,238)), prefilled edit text, native rerender recovery, reload with
presentation mode on, and Reset followed by reload. These are synthetic UI
checks. Native desktop click automation was blocked by unavailable input
geometry, so private live-message editing and the specific reported video
were not manually verified. The linked-message recovery control can retrieve
that exact message through the signed-in client if Discord still supplies it.

The final Personal NSIS installer was applied in update mode. Settings were
unchanged, the process relaunched from AppData/Local/XRay, and the installed
binary matched the final Personal build after normalizing only Tauri's
three-byte UNK-to-NSS installer marker. Desktop click automation still lacked
input geometry, so direct private-message editing was not claimed verified.
The exact reported clip has a ready 2,018,580-byte video/quicktime server copy;
its QuickTime container/codec remains a WebView2 playback compatibility limit.
