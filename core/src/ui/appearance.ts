import { pluginState, save } from "../settings";
import { palettes, paletteVariables, type PaletteId } from "../theme/palettes";
import { uiRoot } from "./root";
import { h } from "./dom";
import { currentTimeFormat, setTimeFormat, type TimeFormat } from "../time";

let sheet: CSSStyleSheet | undefined;
export function currentPalette(): PaletteId {
  const value = pluginState("appearance").data?.palette;
  return typeof value === "string" && Object.hasOwn(palettes, value) ? value as PaletteId : "graphite";
}
export function applyPalette(id = currentPalette()): void {
  const p = palettes[id];
  const host = uiRoot().host as HTMLElement;
  host.style.colorScheme = p.colorScheme;
  for (const [key, value] of Object.entries(paletteVariables(p))) host.style.setProperty(key, value);
  const roles = { base: p.base, rail: p.side, side: p.side, chat: p.chat, raised: p.raised, "raised-2": p.raised,
    field: p.side, line: p.line, "line-2": p.line, hover: p.wash, selected: p.wash, strong: p.text, text: p.text,
    muted: p.muted, faint: p.faint, accent: p.accent, link: p.accent, "accent-hover": p.accent, "on-accent": p.onAccent };
  sheet ??= new CSSStyleSheet();
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  sheet.replaceSync(`html.xray-obsidian { background:${p.base}!important; color-scheme:${p.colorScheme}; --xr-color-scheme:${p.colorScheme}; --xr-pill:${p.accent}!important; --xr-on-pill:${p.onAccent}!important; }
    html.xray-obsidian, html.xray-obsidian [class*="baseLayer_"], ${["dark", "darker", "midnight", "light"].map(t => `html.xray-obsidian .theme-${t}`).join(",")} {
      ${Object.entries(roles).map(([k,v]) => `--xr-${k}:${v}!important`).join(";")};
      --control-primary-background-active:var(--xr-accent)!important;
      --interactive-accent-background-active:var(--xr-selected)!important;
      --mention-background:var(--xr-selected)!important;
      --message-highlight-background-default:var(--xr-hover)!important;
      --message-highlight-background-hover:var(--xr-selected)!important;
    }
    /* Limit monochrome overrides to device icons; presence and destructive actions retain meaning. */
    .vc-platform-indicator { color:${p.accent}; gap:5px; align-items:center; }
    .vc-platform-indicator svg { fill:currentColor!important; color:${p.accent}!important; filter:drop-shadow(0 0 3px color-mix(in srgb, ${p.accent} 28%, transparent)); }
    [data-xray-deco="platform"] svg { stroke:${p.accent}!important; filter:drop-shadow(0 0 3px color-mix(in srgb, ${p.accent} 28%, transparent)); }
    .xray-role-tag { display:inline-flex; align-items:center; vertical-align:middle; }
    .xray-role-tag[data-xray-role="OWNER"] > span { background:#49391f!important; color:#ffe0a6!important; }
    .xray-role-tag[data-xray-role="ADMINISTRATOR"] > span { background:#472e35!important; color:#ffc8d5!important; }
    .xray-role-tag[data-xray-role="MODERATOR_STAFF"] > span { background:#233e38!important; color:#b9e8d7!important; }
    .xray-role-tag[data-xray-role="MODERATOR"] > span, .xray-role-tag[data-xray-role="VOICE_MODERATOR"] > span, .xray-role-tag[data-xray-role="CHAT_MODERATOR"] > span { background:#293c50!important; color:#c1dfff!important; }
    @media (prefers-contrast:more), (forced-colors:active), (prefers-reduced-transparency:reduce) {
      .vc-platform-indicator svg, [data-xray-deco="platform"] svg { filter:none; }
    }`);
  host.setAttribute("data-palette", id);
}
export function appearanceControl(): HTMLElement {
  const select = h("select", { class: "dialog-input", attrs: { id: "xray-color-palette", "aria-label": "XRay color palette" } },
    ...Object.entries(palettes).map(([id,p]) => h("option", { attrs: { value: id }, text: p.label })));
  select.value = currentPalette();
  select.addEventListener("change", () => {
    const id = select.value as PaletteId;
    if (!Object.hasOwn(palettes, id)) return;
    pluginState("appearance").data = { ...pluginState("appearance").data, palette: id };
    save(); applyPalette(id);
  });
  return h("div", { class: "row appearance-row" }, h("label", { class: "row-text", attrs: { for: "xray-color-palette" }, text: "Color palette" }), select);
}

export function timeFormatControl(): HTMLElement {
  const select = h("select", { class: "dialog-input", attrs: { id: "xray-time-format", "aria-label": "Time format" } },
    h("option", { attrs: { value: "12h" }, text: "12-hour · 4:38 PM" }),
    h("option", { attrs: { value: "24h" }, text: "24-hour · 16:38 (military)" }));
  select.value = currentTimeFormat();
  select.addEventListener("change", () => setTimeFormat(select.value as TimeFormat));
  return h("div", { class: "row appearance-row" }, h("label", { class: "row-text", attrs: { for: "xray-time-format" }, text: "Time format" }), select);
}
