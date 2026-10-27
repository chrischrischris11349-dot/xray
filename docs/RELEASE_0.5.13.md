# XRay 0.5.13

Includes the local-edit redraw/rendering fix, profile action alignment/context,
Hide Server fallback and paged VPS DM archive described in
`docs/RELEASE_0.5.12.md`.

This final failure-path pass keeps restart-to-update available after an archive
read/page error. Actual in-flight uploads still drain before restart, and
profile-document writes still require acknowledgement. Archive errors remain
visible; a failed read is not treated as an unsaved message.

Resume first reloads the selected person's saved conversation scopes, including
previously known DMs absent from the current channel list. Stopping one person's
live archive does not wait for another person's history load. Logout/storage
changes clear stale archive status, and late errors from an older account do
not overwrite the new account's state.

Validation: 127 core TAP tests plus existing checks, typecheck, 28 native tests,
the server HTTP checks and 18 bot/media/archive tests. Synthetic production-UI
checks verified profile opening/centers, local edit persistence/reset and
server hide/show. VPS authentication and existing saved-media byte/range
playback were checked after deployment. Native live input was unavailable in
the selected test window; this is not a claim that every live Discord build or
hardware-specific screen-share/audio setup was manually verified.

Install/restart once to replace the embedded client. Ctrl+R reloads the running
build and cannot upgrade its executable. Full profile → Saved DM archive →
Save / resume past DMs starts the explicit history load; it does not start a
VPS-side account collector. Existing coverage, consent and storage limits are
unchanged.
