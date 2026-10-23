import { palettes } from "./palettes";

// Original vector artwork: a small static accent, confined to the optional
// theme's settings header. No remote assets, emoji fonts or animated filters.
export const halloweenMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="${palettes.halloween.accent}">
    <path d="M11.5 7.5c-2-2-6-.5-7 3-1.5 5 1 10 7 10s8.5-5 7-10c-1-3.5-5-5-7-3Z"/>
    <path d="M11.5 7.5c-3 3-3 10 0 13m0-13c3 3 3 10 0 13m0-13c-.5-2 0-4 1.5-5m-1.5 4c2-2 4-2 5-1"/>
  </g>
  <g stroke="${palettes.halloween.muted}">
    <path d="M29 19V9a7 7 0 0 1 14 0v10l-3-2-4 3-4-3-3 2Z"/>
    <path d="M33.5 9.5v1m5-1v1" stroke-width="2"/>
  </g>
</svg>`;

export const seasonalShadowCss = `
:host([data-palette="halloween"]) .panel > .head .title::after {
  content:""; display:inline-block; width:40px; height:20px; margin-inline-start:8px;
  vertical-align:middle; background:url("data:image/svg+xml,${encodeURIComponent(halloweenMark)}") center / contain no-repeat;
  pointer-events:none;
}
@media (forced-colors:active), (prefers-contrast:more) {
  :host([data-palette="halloween"]) .panel > .head .title::after { display:none; }
}
`;
