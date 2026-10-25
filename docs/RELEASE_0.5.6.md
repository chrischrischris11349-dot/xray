# XRay 0.5.6 — custom-status observations

Profile history now records the text and emoji from Discord's **Set your status**
feature. In **Profile report → Set up history**, select the profile category
whose label includes **custom status text/emoji**. Existing profile-history
selections apply. Presence-only history still records only availability changes.

Entries show **Custom status changed**, the observation time, and before/after
values. Emoji-only changes and explicit clearing are included. Custom Discord
emoji preserve name, ID and animation marker; Unicode emoji remain readable.
Duplicate activity updates do not create duplicate entries.

Missing activity data and offline/invisible updates do not imply a clear.
First observation, resume, reconnect and restart establish a baseline rather
than inventing changes during gaps. Entries use existing retention and
local/server storage. A storage server preserves uploaded logs; it does not
observe new changes while XRay is closed. No background server collector is
included in this update.

Regression coverage includes text/emoji changes, clearing, deduplication,
missing/hidden activity, opt-in, pause/resume, reconnect/restart gaps, bounded
input, serialized history restoration and visible event labels. There are no
new dependencies, polling loops, provider calls or image downloads.

This update is applied to the latest existing application source and retains
the earlier profile, report, mini-chat, theme and screen-preview work. The
installer remains unsigned and includes plugin selection. Distribution must
include matching source and third-party notices; provider keys and private
server settings remain outside the package.

Validation: TypeScript checking and the full core suite passed (94 TAP tests
on the latest source, plus the existing core checks). All 25 native tests
passed. Synthetic regression tests verify observation logic and storage
restoration; they do not provide always-on collection or historical recovery.
