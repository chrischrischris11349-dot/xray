# XRay 0.5.9 — media recovery and release polish

This test-team release includes the archive, updater and build-variant work in
[0.5.8](RELEASE_0.5.8.md), plus these final fixes:

- Recover original attachments requests the exact channel/message ID and verifies
  the author. It reports missing access, rate limits and deleted originals without
  substituting a neighbouring message. Switch to the account that can open that
  conversation before using recovery.
- Reload server copy refreshes its playback ticket and rereads the actual bytes,
  replacing a failed video player rather than reusing its previous in-memory Blob.
  Existing viewers of the same file keep their own playback copy until closed.
- Attachments, profile-history photos/videos, the image viewer and report exports
  have native Save As controls. The user chooses the folder and filename. The
  page never supplies a filesystem path. Reports are limited to 10 MB, downloads
  to 250 MB; cancelled or failed downloads leave no partial file. Public HTTPS
  downloads carry no Discord cookies; browser-only authenticated downloads retain
  their original browser link.
- Personal local edits render in the UI without overwriting Discord's canonical
  message content. System notices use native font styling. Delete from this
  session hides a message in the main view and mini-chat; it makes no server
  deletion request. Switching local mode off or restarting restores the view.
  The consented mode starts off. A Restore session messages command clears it.
  The small mode button has explicit, theme-compatible sizing and alignment.
- Right-click a connected voice channel or a participant for Start VC audio
  recording, Stop and save VC audio, and Open VC recordings. These call the same
  recorder as the panel: participant consent, a persistent indicator, incoming
  audio only, automatic stop when a participant joins, and upload to the configured
  server. A context menu cannot record a channel the user has not joined.

The existing dark-glass design tokens, native Discord controls and theme fonts
remain the references. Website sandbox windows remain separate private WebViews;
login, DRM and unsupported site features can require Open in browser. No protection
is disabled to make a preview load.

## Validation and limits

110 core TAP tests plus the existing core checks, TypeScript validation, 28 native
tests and the server HTTP/bot/media suite pass. Coverage includes recovery identity,
fresh archive reads, canonical-content integrity, session hiding/restoration,
voice-menu scoping, filename sanitization, public download destinations, archive
access/retention, duplicate ingestion, and Team/Personal feature separation.
The generated-media CSP fixture verifies image decoding and video playback with
external media blocked; it is labelled synthetic and contains no account data.

Source-expired files that were never archived cannot be recreated. Retention 0
means no age expiry, not unlimited event count: existing document/event and storage
quotas remain. Shared attachment blobs are deduplicated across account references;
accounts retain separate access and histories. Replayed observations are collapsed.
Only the active Discord account session receives its events. Personal-account
capture stops when XRay or the PC is off; VPS storage does not collect new events.
There is no unattended personal-token collector. Client-mod detection remains
undisclosed because Discord does not reliably expose it.

The Team share package excludes Personal binaries, personal controls, local settings
and credentials. Personal uses its authenticated private update feed; Team uses
the public signed release feed. Tauri update signatures are enabled; Windows
Authenticode signing is not configured. No hardware, network or live Discord
performance benchmark is claimed by these regression checks.
