# XRay 0.5.0

The mini-chat has a smoked-glass surface, frame-coalesced launcher dragging, a draggable header and a visible resize corner. Moving the window uses a compositor translation and commits its layout once on release. Resize/move geometry persists separately from the launcher. Alt + arrows moves a focused header; Alt + Shift + arrows resizes it. The corner also supports Alt + arrows. Bounds follow the viewport. Hiding a panel does not overwrite its saved dimensions.

The top-right shield remembers Presentation mode across launches. It hides XRay surfaces and bundled plugin controls/accessories through CSS, without stopping plugins or changing their saved enable states. It hides new notification previews. A recording indicator remains visible. Presentation mode is a display preference, not account access control or a guarantee that arbitrary third-party rendering patches will reproduce stock Discord.

## Profile reports and monitoring

Opening a report from a mini-chat message now resolves the supplied user ID correctly. The ellipsis includes Open profile report and there is a report button beside it. Safe HTTP/HTTPS links inside report text, arrays and nested objects become anchors with target=_blank and rel=noopener noreferrer. Known Discord connections use their returned IDs to form profile links; unsupported or missing identifiers remain text.

Report photos now handle nested avatar objects and JSON-encoded fields. Discord avatar hashes are resolved at the profile source. Steam photos blocked by Discord's image policy retry through the existing credential-free native fetch bridge, validating a bounded raster image. Missing/failed photos have an accessible initials placeholder. Role tags distinguish owner, administrator, staff and moderator colors.

Right-click a server and choose Add to monitor list, select a loaded member or enter a tester ID, confirm consent and Save and start. Stop monitoring disables observation; Remove server removes the selection and its event list. Selections follow the existing account document storage mode, including verified server migration. Observations are limited to delivered message metadata, membership events and shared Discord presence/app activity. They do not discover private servers, identify who deleted a message, or independently track external platforms. Retention: seven days, 100 events/server, 1,000 overall, 32 servers. The server account namespace is server-monitors.<accountId>.

Quick reply captures up to 80 previously visible deleted messages in session memory while enabled, including when its window is closed. Logout, account switch and disabling Quick reply clear that cache. This cannot recover content the client never received. Local message edits and FakeDM records remain session-only and do not survive restart or alter other people's server messages.

## Live intelligence and keys

The Intelligence workspace now contains live IntelX, Snusbase and Oathnet forms, complete returned JSON, expandable records and working links. IntelX has search/result paging/stop and account/quota lookup. Snusbase has search/count/combo/hash/IP WHOIS/domain WHOIS/statistics. Oathnet has Discord profile/history, breach search, IP, Steam, Xbox and Roblox lookups. These are the implemented operations, not every endpoint offered by each vendor. Provider credits, subscriptions and result limits still apply.

IntelX does not accept a raw Discord ID or username as a dedicated search selector. Snusbase has no dedicated Discord-ID type. Use Oathnet's Discord profile/history modes for that input. Empty Oathnet history is a valid empty result; IntelX's empty HTTP 204 stop response is accepted.

Use Provider keys to open a separate bundled settings window. Keys are saved at %APPDATA%\app.xray.desktop\provider-keys.bin using Windows current-user DPAPI; the Discord WebView receives configuration booleans and lookup results, never the stored keys. Only that local settings window can change keys. Provider requests use fixed HTTPS routes, disallow redirects and cap time/body size. Friends must provide their own keys. No helper .env is needed when a native Oathnet key is configured; an existing local helper remains a compatibility fallback.

Live checks on October 22: IntelX authentication/search/result/stop succeeded; Oathnet profile succeeded and username history reported no results; Snusbase count succeeded but database search returned HTTP 429, zero requests remaining. The UI reports provider cooldowns, including Snusbase's seconds-until-reset header. A client update cannot reset that provider quota.

## VC recording and Windows integration

Recordings contains Start VC recording, Stop and save, Retry pending upload, Discard incomplete recording and Download recording. Capture uses incoming RTCPeerConnection audio receivers, without getUserMedia or microphone access. Everyone must agree before capture; an indicator stays visible even in Presentation mode. Incoming watched stream audio is included, before local per-user volume/mute processing. A participant joining or your voice channel/account changing stops capture. Rejoin voice after installing the build if incoming receivers were created before XRay's hook was installed.

Chunks upload in order to your configured HTTPS storage server, with idempotent retry and revision checks. Pending audio is bounded in memory; it is not a crash-proof local archive. If disconnected, keep the app open and retry or discard. An upload backlog beyond 2 MB stops capture and omits the remaining tail. Server limits: 32 MB/recording, 512 MB overall, 100 sessions, two-hour session limit, seven-day completed retention. Audio only reaches a local download when you choose Download.

The VPS service must run the matching server/log-server.mjs AND server/recordings.mjs. /recordings uses the existing bearer token; the native bridge reloads the HTTPS endpoint/token from shell.json. This remains a personal operator service; share the installer without your server token, API keys or SSH credentials.

The top-bar Deafen button uses Fake Deafen when that plugin's Top button option is enabled, otherwise normal Discord deafen. Windows taskbar thumbnail controls provide mute/deafen and update their icons/tooltips. A Start-menu shortcut plus friendly XRay app registration supports the Windows toast identity. Notifications prefer sender name/photo and available server/channel context, with an unambiguous recent-message match when Discord omits metadata. Windows still identifies the app as XRay; sender/server appear in the toast content.

## Sandbox preview

Bundled PreviewHTML and PreviewWebsite no longer depend on iframes inside Discord, which can be blocked by Discord CSP or a destination's frame policy. Choose Open sandbox preview on the message card to open an isolated, resizable private window. There is no Discord session or XRay command capability in these windows. Downloads, popups and new device/location permission requests are denied. Public HTTPS destinations only; at most three previews/open requests. Website previews block Discord navigation. A website can still see your network address and load external resources.

HTML is fetched without cookies, redirects or private-network destinations, limited to 1 MB UTF-8, and displayed in an opaque sandbox without allow-same-origin. Scripts default off; enabling scripts does not grant forms, network fetch, nested frames or top navigation. External images/styles can still load. There is no automatic window opening on incoming messages. Use the window's own size/zoom controls instead of the old blocked inline viewport controls.

## Validation and limits

TypeScript typecheck and the core/Node regression suite passed, including nested-link safety, avatar fallback, monitor persistence/filtering, notification matching, preserving hidden panel dimensions, and coalesced drag samples. Server HTTP tests cover auth, recording upload/finalize/readback, monitor namespaces and stale revisions; recording-store tests cover consent, ordering, retries, quotas and retention. Twenty-two Rust unit tests passed, including provider routes, DPAPI round-trip, sandbox destinations and notification avatar restrictions.

A browser fixture verified real pointer dragging/resizing, Presentation mode persistence, profile report opening from a message, live-result rendering, monitor tester selection and capture/finalization of a synthetic incoming audio tone with no microphone. The deployed private VPS endpoint separately passed authenticated synthetic upload/readback over HTTPS. Native Windows hover controls, real Discord VC receivers, actual Windows toast presentation and arbitrary native sandbox sites still need a manual check in the built app; those results are not inferred from fixture tests. Screenshots use sample data.

There is no measured whole-app speed/FPS comparison against Discord or Vencord. The minified core is 468,158 bytes and Equicord is 2,507,125 bytes in this release. Drag tests verify two pointer samples share one scheduled frame and commit without a jump. This is an implementation/regression measurement, not a claim about achieved display FPS.


Provider request details follow the primary [IntelX SDK](https://github.com/intelligencex/sdk), [Snusbase API documentation](https://docs.snusbase.com/) and [Oathnet documentation](https://docs.oathnet.org/). Snusbase combo and hash selectors are restricted per operation; WHOIS requests omit database grouping. The native request limit also covers Oathnet profile lookups.

The NSIS selection test passed all four presets with 380 choices. The setup is unsigned; Windows may show an unrecognized-publisher prompt. Distribution includes matching GPL source and third-party notices. No GitHub push is part of this release build.


Plugin-card origin badges now use the existing bundled Equicord, Vencord and user SVG icons, with a generic vector fallback for modified/unknown origins. The old equicord.org PNG image requests are removed from the card. This preserves source tooltips and adds accessible labels while avoiding offline/CSP broken-image symbols. Two regression tests cover all origin choices and the fallback, and the Equicord production bundle compiles the actual icon imports.


The Windows launch check caught and fixed a shortcut PROPVARIANT ownership error before distribution. The shortcut string now uses COM-owned memory so PropVariantClear can free it safely. A repeated allocation/read/drop regression test passes. The updated native app launches with a responsive window, and the Start-menu AUMID and friendly XRay toast registration were read back successfully. This validates startup/identity registration, not actual toast artwork or thumbnail hover behavior.


Recording startup rechecks account, channel and the participant set after consent, after server session creation and after the audio context resumes. A changed scope or interrupted preparation requires fresh consent. Upload recovery offers Save uploaded portion when capture has stopped: it finalizes received chunks with a persistent partial flag and omits pending memory audio only after confirmation. Synthetic browser tests verified rejection after a participant change and successful partial recovery after an upload outage/server restart. The private HTTPS VPS also passed partial finalize/readback; synthetic files were removed.


The source archive includes optional userplugin sources. Follow the distributed-snapshot steps in equicord/README.md before rebuilding, so cleaning the vendor checkout does not discard those sources. Four taskbar PNG resources were also accepted by the Windows icon loader during verification.
