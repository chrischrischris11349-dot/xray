# XRay 0.5.10 — saved edits and control fixes

Personal local edits now survive Ctrl+R and restarts. Each account stores overrides
in its own `local-message-edits` document, using the configured server when server
storage is enabled and captured localStorage otherwise. Edits are shown only after
the storage write succeeds. The mode remembers its account opt-in; turning it off
shows original messages temporarily. Right-click Reset Local Edit, in the main
chat or mini-chat, removes the override permanently. A failed save/reset is reported
and does not replace prior data. Disabling a plugin or logging out clears the view,
not the saved overrides. Session-only hiding still resets on restart. Saved edits
have no time expiry; the 1,000-edit / 1 MB cap refuses new writes without evicting
old overrides. Discord stores, outgoing messages and archived history stay original.

The shield persists its state across reloads. It hides plugin controls, including
the local-edit button, without disabling features or hiding arbitrary `vc-*`
content wrappers. It no longer closes the FakeDM panel state or automatically
anonymizes desktop notifications. Existing lock/streamer privacy still applies.
The local-edit button returns when the shield is switched off.

Older media loaded from a conversation is now eligible for opted-in message
history. Such entries are labelled Media loaded from conversation history and
retain their original sent timestamp. The same message ID is not added twice;
missing media references on an existing observation can be enriched without
changing historical text. Opening a profile captures media already loaded in the
current conversation, when that profile has message history enabled. This does
not search unloaded conversations or claim the file was captured at its sent time.
Existing archive limits and failure/recovery states remain in place.

The report action opens directly without sending a synthetic Escape through
Discord's profile UI. Hide Server publishes immutable state snapshots so its
React subscribers update immediately and storage reloads emit a change. Settings
cards now stack their text/controls; update dialogs are centered and use a normal
single-column dialog. HTML hidden states override display styles consistently.
Redundant backdrop filtering on opaque settings/dialog surfaces was removed;
transparent bubble materials remain. No cross-client speed claim is made.

VC recording offers All incoming audio or selected participants. Individual
selection requires a separate incoming audio identity exposed by Discord. Missing
or ambiguous identities are excluded from selected-person recordings; they are
not guessed from track order. All mode includes incoming call and watched-stream
audio, before local mute/volume processing. Microphone input is excluded. Consent
and the persistent recording indicator are mandatory; channel/participant changes
stop capture as before. No participant-selection support is claimed for clients
that supply only a mixed or unidentified incoming stream.

The share picker adds explicit application/system/off/default audio choices.
Existing explicit mute is preserved until the user changes the audio choice.
The muted preview reports whether a live audio track was actually supplied.
Microphone input is never mixed into screen-share capture. Application/window
capture requests its own audio where the runtime supports it; otherwise the
preview reports no audio instead of claiming success. A system-audio mix can
include VoiceMeeter monitoring if it is routed to the output; use application
audio or change the monitoring route to exclude it. Windows/WebView source support
and native audio permission still determine availability.

Reference: [Chromium screen-sharing controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls)
and [local playback vs captured audio](https://developer.chrome.com/blog/screen-sharing-improvements-in-chrome-109).

Always-on personal-account capture is not implemented: XRay must remain connected
for account observations. An authorized VPS collector is required for new events
while the PC is off. Actual archived files remain available until their retained
references are removed by configured retention, manual clearing or document/event
quotas; deletion of the original Discord message does not remove a saved copy.

Regression coverage includes saved-edit reload/reset/failure/account separation,
shield preference persistence, loaded media deduplication and deletion retention,
hide-server snapshots, recording identity filtering, and explicit share-audio modes.
Live multi-participant recording and hardware-specific screen-share audio still
need the test team's device checks. Team builds exclude personal edit controls.
