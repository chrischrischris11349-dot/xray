Stand-ins used only by clean builds (`XRAY_CLEAN_BUILD=1`). `core/build.mjs`
resolves the modules listed in `CLEAN_STUBS` to these files, so the real
lookup, archive, profile-tracking, message-logging and recording code is not in
the bundle at all. Team builds also exclude local-edit tools. Personal builds
retain their local editing and session-only FakeDM controls; saved local edits
use the existing local namespace in clean mode. Each stand-in exports the same
names and does nothing.
