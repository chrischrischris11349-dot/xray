/** Replaced at build time by core/build.mjs. */
declare const __XRAY_VERSION__: string;
declare const __XRAY_DEV__: boolean;
declare const __XRAY_PERSONAL_BUILD__: boolean;

/** SVG files are bundled as their source text (see core/build.mjs). */
declare module "*.svg" {
  const source: string;
  export default source;
}
