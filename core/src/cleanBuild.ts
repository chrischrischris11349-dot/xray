/** Clean builds leave out the lookup, archive, tracking and recording modules (see core/build.mjs). */
export const cleanBuild = typeof __XRAY_CLEAN_BUILD__ !== "undefined" && __XRAY_CLEAN_BUILD__;
