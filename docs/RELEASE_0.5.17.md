# XRay 0.5.17

Adds **XRay voice output** to the settings panel for independent Sonar routing.
It uses Discord's existing `AUDIO_SET_OUTPUT_DEVICE` action. Choose Sonar Chat,
an available output endpoint, or Follow Discord's output selection. The Personal
build prefers Sonar Chat when that named endpoint is present; Team builds follow
Discord by default. Device absence keeps the existing output. The current output
is read from MediaEngineStore rather than assumed from the preference.

Input devices, VoiceMeeter microphone routing, mute, deafen and volume are not
changed. No audio is recorded or used to discover devices. The control only
reads devices already exposed by Discord. The preference survives restart and
reapplies after reconnect/account change. No polling or new dependency is added.

Windows on the test PC reports Sonar Gaming for the normal/multimedia output and
Sonar Chat for communications. GhostCloud's existing audio elements/Web Audio
graph use the default output, so its default route remains Gaming without a
GhostCloud code change. This is configuration/source evidence, not a measured
hardware loopback test. SteelSeries can still label both runtime sessions
`msedgewebview2`; the output endpoint, not that shared label, separates VC/music.
[Safe synthetic routing preview](images/xray-0.5.17-voice-output.png).

Includes the [0.5.16 local-backup, navigation and profile-button fixes](RELEASE_0.5.16.md)
and [0.5.15 reviewed links/optional Tor](RELEASE_0.5.15.md). A storage conflict
also retains the differing server value/revision in the local export record.
The server-copy workflow stops if local writes fail or reach quota rather than
reporting uncopied pages as backed up.

Validation: 149 core TAP tests plus existing checks, TypeScript, 33 native tests
and three launcher tests pass. Routing tests verify the selected Chat endpoint,
the single output-only action, no duplicate dispatch, Follow Discord behavior
and missing-device handling. Browser fixture tests show the selected/current
route using a mocked MediaEngineStore; physical Sonar audio playback is not
claimed. See the earlier notes for native/IndexedDB/live verification limits.

Installers retain Team/Personal separation. No private keys, local history,
browser profile or operator-specific server/network settings are distributed.
