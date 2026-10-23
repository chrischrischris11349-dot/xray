# XRay 0.5.1

This is a restrained polish of the existing interface. Dropdowns now use opaque, palette-aware option colors and native dark/light color schemes. Labels and values can shrink without overlapping. Discord and Equicord Select popups receive the same surface colors while retaining their own placement, scrolling and keyboard behavior.

Mini-chat messages use the existing 13px type, 8px spacing and 10px rounding tokens. Launcher dragging now updates a compositor transform and commits layout on release. Closed conversations no longer schedule rendering work. Switches slide smoothly, and centered toasts retain their horizontal position during entry. Reduced motion, reduced transparency and high-contrast preferences are respected.

Choose **Halloween** in the XRay panel's Color palette selector for near-black plum surfaces, orange actions and lavender selections. The settings title includes original, static vector pumpkin and ghost artwork. It adds no image requests, timers or animations. Graphite remains the default.

## Screen sharing

The bundled WebScreenShare plugin no longer forces 4K/120 FPS encoder maxima or a fixed 600 Kbit/s bitrate. Capture is bounded by the selected resolution/frame rate and stricter caller limits. Discord retains negotiated encoding and account/session limits. Explicit higher-quality selections remain available; actual output depends on the source, hardware, bandwidth and session.

Optional Screen-share capture preferences adds 720p/1080p budgets, 30/60 FPS caps, motion/detail hints and an application-window picker hint. Changes apply to the next share. Screen-share status reports observed capture dimensions and rate, which can differ from transmitted video. Disabling preferences while the native picker is open leaves the user's resulting share intact.

## References and validation

Colors and semantic roles come from `core/src/theme/palettes.ts`; spacing, typography, rounding and motion reuse `core/src/theme/tokens.ts` and `docs/DESIGN.md`. Existing mini-chat markup, Discord Select components and Equicord screen-picker controls are retained. Architecture follows `docs/ARCHITECTURE.md`; no new UI dependency was introduced.

Regression coverage includes capture bounds, unchanged inputs/audio opt-out, native errors, disabling during capture preparation, palette contrast and dropdown scope. Browser checks use synthetic data. A real Discord call is still required to assess screen-share FPS and latency on the user's hardware; no measured whole-app speed advantage is claimed.

The installer includes plugin selection. Distribution includes matching GPL source and third-party notices, excluding private keys and server credentials. The setup is unsigned. No GitHub push is included in this release.

Verification: TypeScript and core suites passed, including seven dropdown/capture fixture tests and two seasonal tests; all 22 native tests passed. All four installer presets passed with 380 choices. Browser verification covered dark/light fields, keyboard selection, Halloween persistence, launcher movement and panel resizing. Browser screenshots cannot confirm the Windows native option popup artwork.

Minified bundles: core 475,518 bytes (0.5.0: 468,158), Equicord 2,507,492 bytes (0.5.0: 2,507,125). The added controls/theme increase size slightly; no first-load or transmitted-FPS improvement is claimed. Launcher movement avoids repeated layout writes, and closed mini-chat rendering timers are skipped.
