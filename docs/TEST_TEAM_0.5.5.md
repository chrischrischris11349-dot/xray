# XRay 0.5.5 test-team checks

Install `XRay-Setup-0.5.5.exe`, choose the desired plugins, and sign in with your own account. The installer is unsigned. Provider keys and private server settings are not distributed; configure your own in the native Provider keys window. Use consenting testers and conversations you can access.

| Check | Steps and expected result |
| --- | --- |
| Full Oathnet report | Open a tester's profile details, choose **Load full report**, then find **Oathnet search report**. Profile, username history and breach search are separate results. Every returned record can be opened; **Expand all returned fields** reveals nested and sensitive fields. Permission/quota failures have readable errors. |
| IP counts | Import an authorized Oathnet JSON/HTML export in Intelligence. When `totals.ips` is present, **IP addresses** matches it. **Unique IPs in loaded records** counts unique supplied address values. This may be smaller when only a page is loaded. Missing IP data is not invented. |
| Exports | Download JSON, CSV and printable HTML. Their summaries must match the displayed report, including IP counts. Search the record data for a known returned IP. An unavailable source metric is null in JSON and labeled unavailable on screen. |
| Breach details | Open each source record. A bundled icon or available profile image appears beside its title. Long/nested fields can be inspected without opening a separate website. |
| In-app images | Click a mini-chat or expanded history image. It opens inside XRay with Fit/Actual size. Escape returns to the mounted profile/chat. Expired images show an explicit unavailable state. |
| DM labels | Browse messages for a tester with known DMs, group DMs and shared-server messages. Each conversation uses the appropriate label. Missing channel information stays unavailable with its ID. |
| Cross-conversation search | Use **Browse available messages**, then **Search next server / DM page**. Each click checks one accessible page. Continue through listed scopes. Errors are visible and can be retried or skipped. A session stops at the documented cap; this is not a guaranteed lifetime search. |
| Edit/deletion history | Enable Observed messages, edits and deletions for a consenting tester before sending/editing/deleting test content. Open a timeline entry. It shows retained previous/current text and sent/observation timestamps where available; deletion actors remain unknown. Expand Images for attachments. |
| History smoothness | Expand an existing event, then use **Show older history**. Unchanged event rows stay expanded. Full bodies and images are not mounted until requested. Scroll the report without moving the underlying conversation. |
| Server storage recovery | With history saved on your configured server, temporarily make that service unavailable and reopen the report. The loading failure must not appear as an empty saved history. Restore service and select **Retry loading history**; retained entries should return. |
| Profile snapshot | Check avatar, bio, status, server join date and relationships against available Discord information. Membership observations identify what was received; they do not infer exact departure dates or distinguish leaving from removal. |
| Clipboard | Copy report text/IDs and paste into XRay search or notes. Selected text should be replaced correctly. Existing image-paste behavior in mini-chat should remain available. |
| Detailed report association | Attach a provider result to the correct optional Discord subject ID, or import an export declaring that ID; reopen the profile. It appears for that subject in the current session. An unrelated server-switcher result is not identity evidence. |
| Visual regression | Check Graphite and Halloween, normal/narrow window sizes, zoom, keyboard focus and Reduce Motion. Floating panels can still be dragged/resized. The compact-message brown line should remain absent. |
| Voice and native checks | In a test call, exercise mute/deafen/Leave VC, the source preview and the chosen capture budget. Judge real share smoothness on the team hardware/network. Check sender images on native notifications. These cannot be proven by the synthetic UI fixture. |

Historical content never observed or already removed by retention cannot be recovered. Discord access, provider plans, indexing, API paging and expired attachments constrain what can be displayed. The bundled server switcher does not supply breach/account records. Website enrichment can differ from your API access.

For a bug report, include version 0.5.5, the action, expected/actual behavior, theme/zoom and whether the data source returned the missing field. Redact credentials and private records before sharing screenshots or exports.
