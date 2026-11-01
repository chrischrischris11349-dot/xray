Stand-ins used only by clean builds (`XRAY_CLEAN_BUILD=1`). `core/build.mjs`
resolves the modules listed in `CLEAN_STUBS` to these files, so the real
lookup, archive, profile-tracking, message-logging, local-edit and recording
code is not in the bundle at all. Each stand-in exports the same names and
does nothing.
