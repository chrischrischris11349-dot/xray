# XRay 0.5.2

This release includes the dropdown, compact mini-chat, compositor-based launcher dragging and optional Halloween palette polish described in [0.5.1](RELEASE_0.5.1.md). Colors, sizing and motion reuse the existing design tokens and Discord controls; no UI library was added.

## Profile actions and history

The profile report action now sits in the same row as Message, Add friend and More. It finds separate action branches through tooltip wrappers, uses the neighboring button dimensions, centers the bundled icon, and removes only its own control when disabled. Direct and wrapped controls have regression coverage.

In Profile report > Set up history, enable **Observed messages, text and image links** to retain future messages from an authorized tester. Existing histories keep their previous selection; this category requires an explicit opt-in. Enable deleted-message observations too for deletion events and a later-deleted marker on retained messages. This observes only events delivered to XRay while connected, not older/private activity or the identity of a deletion actor.

Entries retain at most 500 text characters, four file names and four Discord attachment image links. Images load only when expanded, with lazy loading and an expired-image fallback. Binary images are not archived; signed Discord links may expire. Existing local/server storage selection and retention apply. Turning history off stops new observations. Old entries without image links cannot recover them.

Repeated history reads no longer prune/sort the entire document on every access, and unchanged timelines are not rebuilt on save-status updates. Event/byte limits remain enforced on mutations and serialization. Voice-store updates send native taskbar state only when it changes.

A synthetic model microbenchmark with 2,000 retained events and 1,000 repeated reads took 207.83 ms with full pruning on each read, versus 0.33 ms with throttled read pruning on this machine. This measures that model operation only, not whole-app responsiveness or real Discord FPS.

## Zoom and voice controls

Ctrl + plus (or equals) and Ctrl + minus change native page zoom in 10% steps, from 50% to 200%. Ctrl + 0 resets to 100%. The shell remembers zoom across restarts; Discord and XRay's shadow UI scale together. No CSS transform animation or constant layout timer is used.

The Windows taskbar thumbnail toolbar adds **Leave voice channel**, with a bundled Lucide phone-off icon. It is disabled when disconnected and uses Discord's own disconnect action. Mute and deafen retain their existing behavior.

## Screen sharing and sandbox

After the WebView2 source picker, a local live preview lets you confirm **Share this source**, choose another source, or cancel. Discord receives the stream after confirmation; cancellation stops captured tracks, including late replacement captures. The muted preview renders the stream directly without frame-copy polling.

WebView2 still owns the first source picker. This release does not implement a custom thumbnail grid before that picker. Capture preferences and negotiated encoding changes from 0.5.1 remain; real transmitted frame rate and latency require a call on the user's hardware.

Sandbox windows now actually close even when close-to-tray is enabled for the main window. Website redirects are followed only after validating each destination, and relative HTML assets use the final public HTTPS page URL. Scripts remain disabled by default. Dynamic websites may need script opt-in or may prohibit embedding; these restrictions are not bypassed.

## Validation and distribution

TypeScript, the full core regression suite and 23 native tests passed. Added tests cover profile action placement/cleanup, preview stream lifecycle, sandbox base URL/isolation, zoom keys and limits, disconnected Leave VC, image-link filtering and persisted observed-message/deletion events. Browser checks use synthetic data and video, not a real Discord call. Windows taskbar interaction and real screen-share performance still need a manual session check.

The installer includes plugin selection. The matching source/share archive excludes provider keys, private endpoints and credentials. The setup is unsigned. No GitHub push is part of this release.
