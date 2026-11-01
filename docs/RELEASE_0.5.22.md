# XRay 0.5.22

This release packages the settings and screen-share improvements made after the
0.5.21 tag. It preserves the existing dark palette, typography and compact layout.

- Settings are grouped into Voice, Appearance, App, and Sync & storage. Redraws
  preserve scroll, keyboard focus, and the plugin-search caret/selection.
- Bubble and quick-reply surfaces retain their dark styling without backdrop
  blur over live video. This removes repeated blur work while sharing or watching
  video; it is not a measured game-FPS improvement.
- Screen-share status reads the outgoing encoder implementation, codec, size,
  sent FPS, and quality-limitation reason on demand. There is no polling loop.
  Disabled streams are excluded. Unavailable measurements remain unknown.
- The browser's power-efficiency flag indicates likely hardware acceleration;
  it does not prove GPU or CPU encoding. Labels now preserve that distinction,
  following the [WebRTC statistics definition](https://www.w3.org/TR/webrtc-stats/#dom-rtcoutboundrtpstreamstats-powerefficientencoder).
- Preview quality/audio controls, bubble following and real attachment names
  from 0.5.21 remain included. Changing the audio source requires choosing it
  again in the system picker. Preview playback remains muted.
- Full Personal builds retain local editing and FakeDM. `XRAY_NO_EDIT_TOOLS=1`
  remains an explicit build choice; the Team build excludes these controls.
  Local message edits affect only your display, not Discord or archived history.
- Private update storage now serves the separate clean Personal manifest and its
  matching installer. These routes retain authentication, strict filenames, and
  no-store caching; uploading a feed alone was insufficient with the old route.

The public installer remains a clean Team build. Full Personal and clean
Personal installers have their own private feeds; no clean feed offers a full
build. The signing key changed in 0.5.21, so 0.5.20 and older installations need
one manual installation. No signature check has been weakened.

Validation: TypeScript passes; 204 core tests pass; native checks report 48
passed and one live Tor check ignored. The server suite passes its existing
HTTP/storage checks and 24 tests, including the authenticated clean/full update
routes. Release installers are signature-checked separately from these tests.
These automated checks do not replace the pending signed-in preview, audio,
Save Image and hardware checks.

The remaining hardware check is the reported RTX 3070 whole-screen 720p30
game-FPS drop (about 70 versus 144
in normal Discord). Compare the same scene, source, settings and audio routing;
record game FPS separately from capture/sent FPS and receiver playback. The
encoder readout guides investigation but cannot certify that this is fixed.

Design references: existing `docs/DESIGN.md` and `core/src/theme/tokens.ts`;
Apple Design's `layout.md` > Visual hierarchy, `settings.md` > Best practices,
`buttons.md` > Best practices, and `motion.md` > Providing feedback. These favor
related setting groups, preserved context, recognizable controls and brief,
gesture-following movement. No dependency, service, palette or animation added.
