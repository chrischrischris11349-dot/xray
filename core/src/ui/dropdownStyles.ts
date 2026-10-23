/**
 * Keep the browser/Discord select implementations (keyboard handling, focus,
 * search and popup placement). Only their surfaces and field sizing belong to
 * XRay. Native option popups need opaque colors and an explicit color scheme;
 * a translucent field color alone leaves them up to the Windows theme.
 */
import { motion, radius, space, type } from "../theme/tokens";

export const shadowDropdownCss = `
:host { color-scheme: var(--xr-color-scheme, dark); }
select:is(.dialog-input,.opt-input) {
  appearance: auto;
  color-scheme: var(--xr-color-scheme, dark);
  min-width: 0;
  max-width: 100%;
  min-height: 36px;
  line-height: normal;
  padding-block: ${space.s1};
  padding-inline: ${space.s3} ${space.s2};
  background-color: var(--inset);
  color: var(--text);
  cursor: pointer;
  transition: border-color ${motion.fast} ${motion.ease}, background-color ${motion.fast} ${motion.ease};
}
select:is(.dialog-input,.opt-input) option,
select:is(.dialog-input,.opt-input) optgroup {
  background: var(--raised);
  color: var(--text);
  font: inherit;
}
select:is(.dialog-input,.opt-input):hover:not(:disabled) { border-color: var(--accent); }
select:is(.dialog-input,.opt-input):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
select:is(.dialog-input,.opt-input):disabled { cursor: default; opacity: .55; }
.row.appearance-row { grid-template-columns: minmax(0,1fr) minmax(0,1.8fr); gap: ${space.s3}; }
.appearance-row label { white-space: normal; overflow-wrap: anywhere; }
.opt:has(> select.opt-input) { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
.opt > select.opt-input { width: 100%; max-width: none; }
@media (forced-colors: active) {
  select:is(.dialog-input,.opt-input), select:is(.dialog-input,.opt-input) option {
    background: Canvas; color: CanvasText; border-color: ButtonText;
  }
}
`;

/** Discord's custom Select is shared by its settings and Equicord plugins. */
export const discordDropdownCss = `
html.xray-obsidian [class*="select_"]:is([role="button"],[role="combobox"]),
html.xray-obsidian [class*="select_"][class*="lookFilled_"] {
  min-width: 0;
  min-height: 36px;
  height: auto;
  border: 1px solid var(--xr-line-2) !important;
  border-radius: ${radius.m} !important;
  background: var(--xr-field) !important;
  color: var(--xr-text) !important;
  font-family: ${type.family};
  transition: border-color ${motion.fast} ${motion.ease}, background-color ${motion.fast} ${motion.ease};
}
html.xray-obsidian [class*="select_"]:is([role="button"],[role="combobox"]):focus-visible {
  outline: 2px solid var(--xr-pill) !important;
  outline-offset: 2px;
}
/* Do not change position, transforms, scrolling or z-index: Discord owns the
   popup anchor and flips its list to fit the available viewport. */
html.xray-obsidian [role="listbox"][class*="popout_"] {
  max-inline-size: calc(100vw - 16px);
  border: 1px solid var(--xr-line-2) !important;
  border-radius: ${radius.m} !important;
  background: var(--xr-raised) !important;
  color: var(--xr-text) !important;
  box-shadow: 0 12px 32px #0005;
}
html.xray-obsidian [role="listbox"][class*="popout_"] [role="option"] {
  color: var(--xr-text) !important;
  border-radius: ${radius.s};
}
html.xray-obsidian [role="listbox"][class*="popout_"] [role="option"]:is(:hover,[aria-selected="true"],[class*="optionActive_"]) {
  background: var(--xr-selected) !important;
  color: var(--xr-text) !important;
}
html.xray-obsidian .vc-plugins-setting-content { min-width: 0; }
html.xray-obsidian .fdm-panel select {
  color-scheme: var(--xr-color-scheme, dark);
  min-width: 0;
  min-height: 36px;
  background: var(--xr-field) !important;
  border-color: var(--xr-line-2) !important;
  color: var(--xr-text) !important;
}
html.xray-obsidian .fdm-panel select option {
  background: var(--xr-raised) !important;
  color: var(--xr-text) !important;
}
@media (prefers-reduced-motion: reduce) {
  html.xray-obsidian [class*="select_"] { transition: none !important; }
}
@media (forced-colors: active) {
  html.xray-obsidian [class*="select_"]:is([role="button"],[role="combobox"]),
  html.xray-obsidian [class*="select_"][class*="lookFilled_"],
  html.xray-obsidian [role="listbox"][class*="popout_"],
  html.xray-obsidian [role="listbox"][class*="popout_"] [role="option"],
  html.xray-obsidian .fdm-panel select,
  html.xray-obsidian .fdm-panel select option {
    background: Canvas !important; color: CanvasText !important; border-color: ButtonText !important;
  }
}
`;
