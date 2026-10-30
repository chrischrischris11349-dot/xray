# XRay 0.5.15

Adds offline link-destination review and optional local Tor routing, preserving
the existing profile, media, local-edit and theme behavior from 0.5.14.

- Masked links show their real hostname. External links require explicit Open;
  the sheet shows the full destination without contacting it. Cancel is focused
  by default. Reports underneath remain open, including under presentation mode.
- Native popup/navigation opens also require review. Tor mode uses only the
  configured, policy-verified Tor Browser and refuses an unavailable local proxy.
- The local opt-in routes WebView2 and native HTTP through SOCKS5 with destination
  DNS at the proxy. Voice/video/screenshare and native update downloads are
  unavailable in Tor mode. Team users remain in normal mode by default.
- Browser setup reuses an existing Tor Browser without administrator rights.
  Ordinary Firefox is unchanged. See [network privacy](NETWORK_PRIVACY.md) for
  setup, rollback, exact scope and limitations.
- Separate saved settings allow normal XRay/voice networking while external links
  still use Tor Browser. This mode is explicitly chosen, never a proxy fallback.

Design references: the existing `docs/DESIGN.md` tokens, `.dialog`/`.scrim` styles,
typography, spacing and buttons are reused. The destination is given stronger
hierarchy; no theme redesign or added UI library. The [safe synthetic preview](images/xray-0.5.15-link-review.png)
contains no real users or external requests.

Validation: 136 core TAP tests plus existing checks, TypeScript, 33 native tests
and three Python launcher tests pass. A mock SOCKS server confirms hostname
transport without destination DNS; unavailable proxies do not fall back. The
separately enabled live native HTTPS check returned `IsTor=true` without printing
its exit IP. Browser fixture checks confirmed Cancel, explicit Open, initial
focus and preservation of the report. The test opener was a local stub.

The Tor Browser window could not be inspected through desktop automation because
of an application-identity error. Its actual check-page result is unverified;
policy and launcher checks do not substitute for a live browser page test.

No new message-history or always-on collector behavior is introduced. Existing
archived originals stay unchanged. Storage alone does not collect when the PC
is off, and unsupported MOV codecs are not converted by this release.
