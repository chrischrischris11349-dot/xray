# Custom-status history

In a profile report, open **Set up history** and enable the profile category
whose label includes **custom status text/emoji**. Changes appear as
**Custom status changed**, with the observation time and previous/new values.
This includes text edits, emoji-only changes and explicit clears. Unicode emoji
are retained as text; custom Discord emoji retain their name, ID and animation
marker without downloading images.

Only activity updates already delivered to XRay are observed. Missing activity
data and going offline/invisible do not establish that a status was cleared.
The first known value establishes a baseline. Restart, reconnect and resume
establish new baselines; changes during those gaps are not reconstructed.

Records follow the existing profile category, history retention and selected
local/server storage. Server storage preserves uploaded history while the PC
is off, but does not collect new events. An independent, authorized collector
would be needed for observation while XRay is closed.

The history schema remains version 1: old records load without migration, and
new events use the existing bounded before/after fields and timestamp. No
polling, provider requests, image downloads or new dependencies were added.
