# XRay 0.5.20

This update fixes local voice-indicator alignment, adds reviewed SoundCloud
handoff to GhostCloud, and checks the actual screen-capture budget after picking
a source.

The Personal build retains FakeDM and local message-edit controls even with the
clean build option enabled. Team builds exclude them. Clean Personal builds keep
saved local edits in the account's existing local document namespace, since their
server-backed modules are absent. Right-click Reset Local Edit removes an override;
FakeDM previews remain session-only. The local-edit switch is also available in
command search. Presentation mode hides the controls without changing their state.
Voice utility buttons share a compact grid; existing dark tokens, typography and
reduced-motion support remain. No new XRay dependency or continuous visual effect.

- Personal: the local headphone-off marker uses the native status strip or a
  vertically centered, reserved slot. Nested voice wrappers cannot add duplicates;
  replacing the native strip restores the marker. Turning it off removes its
  layout adjustments. Discord voice stores and audio behavior are unchanged.
- SoundCloud: a registered GhostCloud handler receives only exact supported web
  hosts, encoded as one URL parameter. Browser fallback and strict Tor behavior
  remain. GhostCloud must be updated once to its link-enabled build; an older
  running instance does not understand these requests.
- Sharing: if the selected source reports size or FPS above the chosen upper
  bounds, apply all selected bounds in one post-picker operation. Preserve stricter
  existing track constraints and audio. Do not reconfigure an in-budget source,
  copy frames, add a capture loop, override codecs, or change Discord entitlements.
  An unsupported resize leaves the approved source usable, and status reports its
  actual settings rather than claiming success.
- The existing Screen-share status button observes WebScreenShare directly; the
  optional capture-preference plugin no longer has to be enabled to inspect it.

Validation covers alignment/cleanup/rebuilt strips, SoundCloud URL boundaries,
cold/warm GhostCloud handoff, startup races, capture limits and status lifecycle.
Physical GPU/driver behavior and the reported game/stream lag still need an A/B
test on the affected PC at identical settings. This release does not claim a
measured return from 70 to 144 game FPS.

Restarting XRay disconnects voice. Applying the GhostCloud build restarts its
playback process. Updater signatures are provided; Windows Authenticode is not.
