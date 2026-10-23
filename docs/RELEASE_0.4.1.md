# XRay 0.4.1

Opted-in deletion history now retains up to 500 characters of visible text and
four attachment names per event. Edits remain metadata-only; attachment files
are not downloaded or archived. Old entries show an explicit unavailable state,
or text already retained by the message logger. The history document is bounded
to 1.8 MB of UTF-8 by pruning oldest events in addition to its existing age/count
limits. Storage still follows the server/device setting.

Mini-chat retains up to 80 deleted-message copies in memory for this session
when deletions arrive while that conversation is open, even if the optional
MessageLogger plugin is disabled. It also labels deleted rows retained by that
plugin. Rows update when deletion status changes; copies support reading and
copying, with server mutation/reply actions disabled. The cache is cleared on
logout, account switch and disabling Quick reply. It is not an offline archive.

Message times default to 12-hour AM/PM. Open the XRay panel and choose **Time
format → 24-hour (military)** to use the other format. This also applies to
mini-chat times, reply-time decorations, profile/report times and scheduled
message summaries. Dates, time zones, actual message instants and ISO export
timestamps are unchanged.

The optional RealtimeTimestamps plugin is now a repository-owned port so this
fix ships in every installer. Its format selector and the XRay panel share the
appearance preference, which persists across launches and follows settings
sync when enabled. An inherited 24-hour plugin default becomes AM/PM unless
the shared preference explicitly selects 24-hour time. Existing plugin enable
choices are preserved. Third-party CustomTimestamps templates remain separate.

Formatters are cached (bounded to 32 combinations); mini-chat refreshes its
existing rows when the preference changes and unsubscribes when closed. No
additional interval is added. Regression tests cover midnight, noon, afternoon,
locale-independent clock selection, shared settings feedback and unchanged
machine timestamps. The existing core/server/native checks remain applicable.

`XRay_Bot_Monitoring_Design.txt` is a proposed official-bot architecture and
API/UI/storage design. It does not install a Discord monitoring bot. Unsupported
bio access and cross-user profiling limitations are explicitly documented.
