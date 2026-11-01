# XRay 0.5.21

This update finishes the screen-share preview, makes the open conversation
follow the chat bubble, and tightens a few visual details.

- Sharing: the preview holds the selected screen or window locally until
  Share this source. In the preview you can change capture resolution and FPS on
  the live source (bounded by Discord's own stricter constraints) and mute or
  unmute the audio tracks Windows granted. The choices match the picker's, so a
  preview change is a valid saved setting. Changing the audio source still needs
  the system picker; the preview says so and supports re-picking. The microphone
  is never requested or mixed in. Cancelled and late replacement captures stop.
- Fixed: a re-picked source with audio was muted when the first source had none.
  Captured audio is now shared by default; an explicit mute carries over to a
  replacement. Cancelling a re-pick keeps its explanation visible instead of
  overwriting it.
- Preview polish: busy controls dim while a change applies, Share this source is
  the highlighted primary action, and Choose another source… ends in an ellipsis
  because it opens the system picker.
- Chat bubble: dragging the bubble moves the open conversation on the
  compositor and saves once on release, keeping manual size and offset.
- Save As: a generic WebView2 suggestion ("file", "download", no extension)
  falls back to the source URL's own name, such as Discord's attachment name,
  then to an extension from the MIME type. Names stay sanitized.
- Updates: clean builds read their own feed. Public clean builds use the
  `clean-channel` release's `clean.json`; clean Personal builds use
  `/updates/personal-clean.json` on private storage. No clean build reads a feed
  that can offer a full build.
- Theme: call controls and the call timer use the theme's connected and muted
  colors instead of one-off values. Title-bar and call buttons gain a press state.

Validation: typecheck and the full core suite, including preview audio, quality,
cancellation and re-pick cases, constraint preservation, and bubble following.
Live GPU, FPS and delivered stream quality are not measured by these tests.

Install this release by hand once: its updates are signed with a new key, which
0.5.20 and older installs cannot verify. Later updates arrive automatically.

The release installer is a clean build: the excluded lookup, archive, tracking
and recording modules are not included. It updates from the clean feed.
