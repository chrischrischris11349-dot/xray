# Account tabs

Open the XRay panel and choose **Account tabs → Add account tab**. Give the tab
a short label, then sign in through Discord's normal sign-in page. Each added
tab uses a separate WebView2 data directory; the existing Main tab keeps the
original profile. XRay never reads, copies or exports a Discord login token.

When two or more sessions are open, a compact tab strip appears beneath the
title bar. Switch with a click or the tab strip's arrow/Home/End keys. Hidden
sessions retain their WebViews and connections; there is no background logout
or suspension. Each open account costs additional memory and may play audio if
you joined voice there. Up to six saved account tabs are supported.

Use **Close tab** in the panel to disconnect that session after pending work
saves. Its login and local history remain and **Reopen** restores it. To remove
login access, sign out through Discord in that tab. Renaming only changes the
local label. Open tabs and the selected tab restore after restarting XRay.

The shell retains one native window per account, matching its geometry when
switching and hiding the previous window. The tab strip is shared navigation;
channel tabs from plugins still belong to their own account. Notifications open
their originating account. Taskbar voice controls address their own window, and
push-to-talk releases go back to the account where the key was pressed.

Close/restart preparation uses per-window acknowledgments with request IDs.
Each session checks for an active or unsaved recording, then flushes its own
message/history queues. A missing, failed or stale acknowledgment prevents the
restart. Saved data is not deleted when an account tab closes.

Browser session separation is not a security boundary against XRay itself or
code running in its trusted Discord origin. Shell preferences and configured
provider/server access remain app-wide; history keeps its existing account
namespaces. Browser login files stay on this device and are never packaged or
uploaded as part of server history. Opened accounts stop collecting when XRay
or the PC is off; server storage alone is not an always-on Discord collector.

Visuals reuse `docs/DESIGN.md` and `core/src/theme/tokens.ts`: existing dark
surfaces, type, radii and selected accent. Tabs have explicit selected state,
keyboard focus, 28px controls and horizontal overflow rather than clipped labels.
No added blur, animation loop or UI dependency is used for this navigation.

Presentation mode in any opened account hides notification previews app-wide.
Opening another account cannot turn that protection off; a session clears only
its own presentation state when it closes.
