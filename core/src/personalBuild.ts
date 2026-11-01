/** Release artifacts default to the team build. Personal tools are compiled separately. */
export const personalBuild = typeof __XRAY_PERSONAL_BUILD__ !== "undefined" && __XRAY_PERSONAL_BUILD__;
/** Personal local message editing and FakeDM; XRAY_NO_EDIT_TOOLS=1 leaves them out of a personal build. */
export const editTools = personalBuild && (typeof __XRAY_EDIT_TOOLS__ === "undefined" || __XRAY_EDIT_TOOLS__);
