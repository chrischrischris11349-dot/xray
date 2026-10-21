/**
 * Personal touches to xray's look: your own accent color and font, and
 * sharper images in chat.
 */
import { definePlugin, type Plugin } from "./types";

/** "#7c5cff", "7c5cff" or "#abc" → "#rrggbb", or null. */
export function hexColor(text: string): string | null {
  const raw = text.trim().replace(/^#/, "");
  const full = /^[0-9a-f]{3}$/i.test(raw) ? [...raw].map((c) => c + c).join("") : raw;
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toLowerCase()}` : null;
}

/** Dark text on light colors, light text on dark ones. */
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b) > 0.4 ? "#0b0b0d" : "#ffffff";
}

const accentColor = definePlugin({
  id: "accentColor",
  name: "Accent Color",
  description: "Your own color for selected channels, your message bubbles and Discord's main buttons. Works with the Obsidian theme.",
  category: "Appearance",
  impact: "light",
  impactReason: "A few CSS variables",
  needsReload: false,
  enabledByDefault: false,
  options: {
    color: { type: "string", label: "Color", description: "A hex color, like #7c5cff.", default: "#7c5cff", placeholder: "#7c5cff" },
  },
  start(ctx) {
    const color = hexColor(ctx.options.color);
    if (!color) return;
    const on = textOn(color);
    ctx.css(`
      html.xray-obsidian, html.xray-obsidian [class*="baseLayer_"], html.xray-obsidian .theme-dark, html.xray-obsidian .theme-midnight {
        --xr-pill: ${color} !important;
        --xr-on-pill: ${on} !important;
        --xr-accent: ${color} !important;
        --xr-on-accent: ${on} !important;
        --control-primary-background-hover: ${color} !important;
      }
    `);
  },
});

const customFont = definePlugin({
  id: "customFont",
  name: "Custom Font",
  description: "Use any font installed on your PC for Discord's text.",
  category: "Appearance",
  impact: "light",
  impactReason: "A few CSS variables",
  needsReload: false,
  enabledByDefault: false,
  options: {
    font: { type: "string", label: "Font", description: "The name as Windows shows it, like Inter or Segoe UI.", default: "", placeholder: "Inter" },
    code: { type: "string", label: "Code font", description: "For code blocks. Leave empty to keep the current one.", default: "", placeholder: "JetBrains Mono" },
  },
  start(ctx) {
    // Only characters a font name can have, so the value can't escape the CSS.
    const clean = (name: string) => name.replace(/[^\p{L}\p{N} _-]/gu, "").trim();
    const font = clean(ctx.options.font);
    const code = clean(ctx.options.code);
    const rules: string[] = [];
    if (font) rules.push(`--font-primary: "${font}", "Segoe UI Variable Text", sans-serif !important;`, `--font-display: "${font}", "Segoe UI Variable Display", sans-serif !important;`, `--font-headline: "${font}", sans-serif !important;`);
    if (code) rules.push(`--font-code: "${code}", "Cascadia Mono", monospace !important;`, `--xr-mono: "${code}", "Cascadia Mono", monospace;`);
    if (rules.length) ctx.css(`html, html.xray-obsidian { ${rules.join(" ")} }`);
  },
});

const MEDIA_PROXY = /^https:\/\/media\.discordapp\.net\/attachments\//;

/** A media-proxy image address at the chosen quality. */
export function sharperImage(src: string, mode: string): string {
  if (!MEDIA_PROXY.test(src)) return src;
  try {
    const url = new URL(src);
    if (mode === "original") {
      // The real file, at its real size.
      url.hostname = "cdn.discordapp.com";
      for (const param of ["width", "height", "format", "quality"]) url.searchParams.delete(param);
    } else {
      url.searchParams.set("quality", "lossless");
    }
    return url.toString();
  } catch {
    return src;
  }
}

const imageQuality = definePlugin({
  id: "imageQuality",
  name: "Sharper Images",
  description: "Images in chat load without Discord's compression: lossless at the size shown, or the original file.",
  category: "Media",
  impact: "moderate",
  impactReason: "Bigger image downloads",
  needsReload: false,
  enabledByDefault: false,
  options: {
    mode: {
      type: "select",
      label: "Load",
      default: "lossless",
      choices: [
        { value: "lossless", label: "Lossless, at the size shown" },
        { value: "original", label: "The original file (uses more memory)" },
      ],
    },
  },
  start(ctx) {
    const mode = ctx.options.mode;
    // Every <img> Discord renders is created through the JSX runtime, so its address can be changed before it loads.
    ctx.onElement("img", (props) => {
      if (typeof props?.src !== "string" || !MEDIA_PROXY.test(props.src)) return;
      const src = sharperImage(props.src, mode);
      return src === props.src ? undefined : { ...props, src };
    });
  },
});

export const lookPlugins: readonly Plugin<any>[] = [accentColor, customFont, imageQuality];
