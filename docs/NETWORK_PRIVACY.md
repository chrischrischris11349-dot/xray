# Local Tor routing and link review

**Current behavior (0.5.19):** normal XRay sessions open reviewed HTTP(S) links
with the Windows registered handler, usually the default browser. The old
`tor_browser_links` setting is ignored and removed on settings saves. Existing
internal Discord navigation stays in XRay. Explicit strict Tor mode still uses
the verified Tor Browser and never falls back to direct networking. The legacy
link-only setup described below applies to 0.5.15–0.5.18, not current builds.

XRay 0.5.15 can opt into the local Tor SOCKS5 listener at `127.0.0.1:9050`.
This is a local setting, disabled by default in Team installers. It does not
change the Windows proxy, ordinary Firefox, other apps or other users' settings.
Signing into Discord still identifies the Discord account.

## Existing Tor Browser

`python scripts/configure-local-tor.py` verifies an existing Tor Browser under
`~/Desktop/Tor Browser/Browser`, checks the SOCKS handshake, backs up changed
browser policies and Tor-only XRay settings, then enables routing for the next
full XRay process startup. Quit XRay first; use version 0.5.15 or newer.
`--check` makes no changes; `--browser-only` configures only that Tor Browser.
Use `--links-only` to deliberately restore normal XRay networking and VC while
keeping opened links in Tor Browser. This removes the strict-mode marker,
sets `tor_proxy=false` and `tor_browser_links=true`. Both choices survive restart.
Discord traffic and voice then use the normal connection; only reviewed external
browser opens use Tor. Neither mode is silently selected after a connection error.
No profile, cookies, passwords or ordinary Firefox registry policies are read.

The helper locks SOCKS5 and proxy DNS in that user-owned Tor Browser installation,
disables direct fallback, speculative requests, HTTP/3 and WebRTC. XRay opens
approved external links only in the verified installation, using its existing
external proxy through `TOR_PROVIDER=none`. The normal Tor Browser launcher may
still manage its own Tor instance; use `scripts/launch-tor-browser.py` or the
local XRay Tor Browser shortcut for this external-proxy configuration. The
launcher refuses missing policies or an unavailable proxy. It never selects a
different browser. External-proxy mode has no Tor circuit-control interface.

From 0.5.16, opened links use the separate `TorBrowser/Data/Browser/xray-profile`
profile with `--allow-remote`. This permits subsequent local reviewed opens in
that profile rather than colliding with an already-running no-remote browser.
It does not enable a network listening proxy or browser debugging port. The
ordinary browser profile is not reused. See Tor's
[implementation note](https://archive.torproject.org/websites/lists.torproject.org/pipermail/tbb-commits/2021-January/008591.html).

Ordinary Firefox's normal shortcut is unchanged and is not protected by this
setup. This is not a system VPN or a claim of browser fingerprint anonymity.

## XRay's routing

- Main and sandbox WebView2 windows use fixed SOCKS5, proxy-side destination DNS,
  no proxy bypass, no QUIC and blocked non-proxied WebRTC. The injected runtime
  disables WebRTC APIs: voice, video and screen sharing are unavailable in this
  chat-only mode. A small `Tor · chat only` badge explains the restriction.
- Native HTTP clients use the same fixed SOCKS proxy, including storage, media,
  reports, notification images and configured remote providers. A local Oathnet
  helper is not contacted in this mode. Proxy failure is an error, not a retry
  on a direct socket. Normal mode retains existing network behavior.
- Native update check/download is paused because its separate updater transport
  is not configured for Tor. Obtain the signed installer through Tor Browser;
  applying an already-downloaded update remains available.
- Conflicting WebView2 proxy/DNS environment overrides refuse startup. A separate
  local `tor-required.flag` preserves the requirement if `shell.json` is lost,
  unreadable or rewritten by an older binary. This marker is not distributed.

To deliberately opt out, quit XRay, remove its local config-directory
`tor-required.flag`, set `tor_proxy` to `false` in `shell.json`, and restart.
Normal routing also restores the Windows default link handler in 0.5.19.
To undo browser policy changes, restore the saved policy from
`%APPDATA%/XRay-network/tor-browser-policies-before-*.json` while that browser is
closed. The helper does not stop or reconfigure the user's Tor daemon.

Tor can be slower or blocked by services. The signed-in client is still a
different browser environment from Tor Browser. This implementation covers
XRay's WebView/native HTTP and its chosen link launcher, not arbitrary plugins
that spawn outside programs or other Windows processes.

## Offline link review

External HTTP(S) anchors show an explicit confirmation with their canonical
hostname and full URL before opening. Labels that hide or disagree with the
destination get a dashed underline and hostname. IDN/punycode, hidden label
characters, known shorteners and unencrypted HTTP get specific explanations.
URLs with embedded credentials are blocked. Inspection does not fetch, resolve
or follow the link. Redirect targets and site reputation remain unknown.

The warning uses the existing dark dialog tokens and preserves any open report.
Cancel has initial focus; keyboard navigation, copy and middle-click are handled.
Presentation mode cannot suppress an explicit review dialog. Native popup and
navigation handlers provide a second review path for links outside the anchor
handler. The reviewed-link native command validates web URLs; it is not a trust
boundary against code already executing in Discord's origin.

References: [Tor SOCKS extensions](https://spec.torproject.org/socks-extensions.html),
[Firefox proxy policy](https://firefox-admin-docs.mozilla.org/reference/policies/proxy/),
[Chromium SOCKS DNS](https://chromium.googlesource.com/playground/chromium-org-site/+/refs/heads/main/developers/design-documents/network-stack/socks-proxy.md),
[WebView2 flags](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags?tabs=win32cpp).
