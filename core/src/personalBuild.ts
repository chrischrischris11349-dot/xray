/** Release artifacts default to the team build. Personal tools are compiled separately. */
export const personalBuild = typeof __XRAY_PERSONAL_BUILD__ !== "undefined" && __XRAY_PERSONAL_BUILD__;
