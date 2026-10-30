# XRay 0.5.19

This signed release carries the changes prepared as 0.5.18. That public tag was
already occupied and lacked an updater manifest; its uploads were left untouched.
The complete installer, source and signed updater feed are published as 0.5.19.

Adds **Hardware acceleration** to the XRay panel in Team and Personal builds.
It defaults on and preserves WebView2's automatic GPU choice and driver safety
checks. Off requests software compatibility mode (`--disable-gpu`) on the next
full launch. This is a preference, not a claim that the current machine is
actually using accelerated decoding/compositing. Driver/runtime limitations can
still cause fallback. External GPU arguments are reported without exposing the
environment string. No blocklist bypass or experimental acceleration flags are
added. See [Microsoft's performance guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance).

The current-launch preference remains separate from the saved next-launch value.
**Restart to apply** appears when they differ. It refuses to restart during a
recording or recording preparation, and flushes pending history/archive work
before requesting a native restart. Failed settings writes leave the previous
preference intact. Shell settings use a staged, flushed replacement file; the
new graphics command returns four booleans, never keys or arbitrary flags.
Main and sandbox WebViews share the current launch's graphics policy.

**Performance plugins** opens the existing picker filtered to bundled FastDiscord,
UI Optimisations, NoTypingAnimation and DisableAnimations, where available.
These plugins remain optional. Their existing defaults/options are unchanged;
some explicitly reduce animation, blur or media. No plugin is automatically
enabled or disabled on upgrade. This uses the existing userplugin selection and
exclusion lists and adds no dependency.

Picker search now reuses the existing normalized ranking cache and coalesces
input bursts into one list update per animation frame. Ordering, rows and visuals
are preserved. Local benchmark: 378 catalog entries, 1,000 queries, five measured
runs after warmup; median 1,358.5 ms before and 864.7 ms with cached ranking
(36.4% less CPU time). This is ranking-only, on the test PC while other apps were
running; it is not an end-to-end Discord performance comparison. A regression
test checks a three-input burst commits once using the final query.

Typing feedback also avoids redundant work: the optional character counter batches
input bursts into one update and skips unchanged attributes. It leaves the actual
draft and selection untouched. Optional keyboard sounds explicitly disconnect their
temporary audio nodes after playback, preserving their tone/timing. The picker has
a **Typing** filter for SmoothType, Keyboard Sounds and Character Counter, where
bundled. These are discoverable options rather than forced changes to everyone's feel.

Screen-share capture also keeps lower numeric and ideal frame-rate/resolution
requests instead of raising them to the picker's higher budget. This corrects
unnecessary capture work; the exact game-FPS impact still needs comparison on
the affected PC. The picker adds explicit 720p/30 lower-impact and 720p/60 motion
presets, preserving audio choices and higher quality options. Neither preset
promises a specific game FPS or forces a hardware encoder. Fresh capture defaults
are 720p/30 instead of 1080p/60; existing explicit preferences are preserved. The
local preview reports actual capture size/FPS, distinct from encoded stream FPS.

Validation: 162 core TAP tests and 36 native tests pass (one separate live Tor
test is ignored by default). UI tests cover saved versus active state, failed
save rollback, recording/unsaved-data restart guards, the plugin filter and
cancelled queued rendering. Native tests cover migration defaults, persistence
over two writes, graphics flags and the narrow reply. Browser preview uses
synthetic native state. Physical audio output and GPU acceleration vary by device.

Public Team updates use the existing signed GitHub feed. Personal updates stay
on the configured private feed. Existing installs can check/download and restart
to apply; an old build without the updater needs the new installer once.
No private settings, tokens or collected history are distributed.
