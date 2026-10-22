/**
 * The color layer of xray's theme ("mist and oak", tokens in tokens.ts;
 * the file keeps its old name so settings and imports stay put).
 *
 * Discord's UI reads its colors from CSS custom properties (its "tokens"), so
 * the theme overrides those rather than restyling elements by class name.
 * Class names are hashed and change with every Discord build; tokens don't.
 * Discord re-declares its tokens on nested theme containers (popouts, modals),
 * so the overrides target those too, and use !important to beat Discord's
 * own declarations on the same element.
 *
 * The layout (floating panes, the server dock, the backdrop between them) is
 * in shell.ts. Content surfaces are solid so text stays crisp; only the app
 * frame inside the main layer is clear, which lets the mist backdrop show in
 * the gutters between panes.
 */
import { accent, edge, ink, mist } from "./tokens";

const THEME_CONTAINERS = [".theme-dark", ".theme-darker", ".theme-midnight", ".theme-light"];

const SCOPE = [
  "html.xray-obsidian",
  // Tokens are re-declared on the main app layer so they pick up its clear frame below.
  'html.xray-obsidian [class*="baseLayer_"]',
  ...THEME_CONTAINERS.map((c) => `html.xray-obsidian ${c}`),
].join(",\n");

/** The main app layer's own frame, where the backdrop shows through. Popouts and modals live outside it. */
const FRAME_SCOPE = [
  'html.xray-obsidian [class*="baseLayer_"]',
  ...THEME_CONTAINERS.map((c) => `html.xray-obsidian [class*="baseLayer_"] ${c}`),
].join(",\n");

/** Every Discord token xray sets, and what to set it to. Values use the --xr-* roles below. */
const TOKENS: Record<string, string> = {
  // surfaces
  "--app-frame-background": "var(--xr-base)",
  "--app-frame-border": "var(--xr-line)",
  "--background-base-lowest": "var(--xr-rail)",
  "--background-base-lower": "var(--xr-side)",
  "--background-base-low": "var(--xr-side)",
  "--panel-bg": "var(--xr-side)",
  "--chat-background": "var(--xr-chat)",
  "--chat-background-default": "var(--xr-chat)",
  "--background-surface-high": "var(--xr-raised)",
  "--background-surface-higher": "var(--xr-raised)",
  "--background-surface-highest": "var(--xr-raised-2)",
  "--bg-surface-raised": "var(--xr-raised)",
  "--modal-background": "var(--xr-raised)",
  "--card-background-default": "var(--xr-raised)",
  "--card-primary-pressed-bg": "var(--xr-raised-2)",
  "--background-secondary-alt": "var(--xr-raised)",
  "--background-accent": "var(--xr-raised-2)",
  "--channeltextarea-background": "var(--xr-field)",
  "--input-background-default": "var(--xr-field)",
  "--user-profile-overlay-background": "var(--xr-raised)",
  "--user-profile-toolbar-background": "var(--xr-raised)",
  "--user-profile-activity-toolbar-background": "var(--xr-raised)",
  "--background-scrim": "rgba(8, 9, 10, 0.66)",
  // hover and selection: a warm wash, and oak for what's selected
  "--background-mod-muted": "var(--xr-hover)",
  "--background-mod-subtle": "var(--xr-hover)",
  "--background-mod-normal": "rgba(237, 233, 226, 0.08)",
  "--background-mod-strong": "rgba(237, 233, 226, 0.11)",
  "--interactive-background-default": "transparent",
  "--interactive-background-hover": "var(--xr-hover)",
  "--interactive-background-active": "rgba(237, 233, 226, 0.09)",
  "--interactive-background-selected": "var(--xr-selected)",
  "--message-background-hover": "rgba(237, 233, 226, 0.025)",
  "--user-profile-background-hover": "var(--xr-hover)",
  "--card-secondary-bg": "var(--xr-raised-2)",
  // hairlines
  "--border-muted": "var(--xr-line)",
  "--border-subtle": "var(--xr-line)",
  "--border-normal": "var(--xr-line-2)",
  "--border-strong": "rgba(237, 233, 226, 0.22)",
  "--chat-border": "var(--xr-line)",
  "--card-border-default": "var(--xr-line)",
  "--user-profile-border": "var(--xr-line)",
  "--user-profile-toolbar-border": "var(--xr-line)",
  "--input-border-default": "var(--xr-line-2)",
  "--input-border-hover": "rgba(237, 233, 226, 0.2)",
  "--input-border-active": "var(--xr-accent)",
  "--border-focus": "var(--xr-accent)",
  "--spine-default": "var(--xr-line-2)",
  // text
  "--text-strong": "var(--xr-strong)",
  "--text-default": "var(--xr-text)",
  "--text-subtle": "var(--xr-muted)",
  "--text-muted": "var(--xr-muted)",
  "--chat-text-muted": "var(--xr-muted)",
  "--channels-default": "var(--xr-muted)",
  "--input-text-default": "var(--xr-text)",
  "--input-placeholder-text-default": "var(--xr-faint)",
  "--input-icon-default": "var(--xr-faint)",
  "--interactive-text-default": "var(--xr-muted)",
  "--interactive-icon-default": "var(--xr-muted)",
  "--interactive-text-hover": "var(--xr-strong)",
  "--interactive-icon-hover": "var(--xr-strong)",
  "--interactive-text-active": "var(--xr-strong)",
  "--interactive-icon-active": "var(--xr-strong)",
  "--interactive-muted": "#5E5953",
  "--text-link": "var(--xr-link)",
  // accent: Discord's blurple becomes oak. Filled buttons are oak with dark text.
  "--brand-500": "var(--xr-accent)",
  "--brand-560": "var(--xr-accent-hover)",
  "--background-brand": "var(--xr-accent)",
  "--text-brand": "var(--xr-accent)",
  "--control-primary-background-default": "var(--xr-accent)",
  "--control-primary-background-hover": "var(--xr-accent-hover)",
  "--control-primary-background-active": "#C48B49",
  "--control-primary-text-default": "var(--xr-on-accent)",
  "--control-primary-text-hover": "var(--xr-on-accent)",
  "--control-primary-text-active": "var(--xr-on-accent)",
  "--control-brand-foreground": "var(--xr-accent)",
  "--control-brand-foreground-new": "var(--xr-accent)",
  "--button-outline-brand-background-hover": "var(--xr-selected)",
  "--button-outline-brand-border-active": "var(--xr-accent)",
  "--interactive-accent-background-default": "var(--xr-hover)",
  "--interactive-accent-background-hover": "var(--xr-selected)",
  "--interactive-accent-background-active": "rgba(210, 154, 87, 0.2)",
  "--interactive-accent-background-selected": "var(--xr-selected)",
  "--mention-background": "rgba(210, 154, 87, 0.16)",
  "--mention-foreground": "var(--xr-link)",
  "--message-highlight-background-default": "rgba(210, 154, 87, 0.08)",
  "--message-highlight-background-hover": "rgba(210, 154, 87, 0.11)",
  "--background-code": "rgba(237, 233, 226, 0.05)",
  // status: bamboo means online and connected, nothing else
  "--status-online": "var(--xr-ok)",
  "--status-positive": "var(--xr-ok)",
  "--status-positive-background": "var(--xr-ok)",
  "--text-positive": "var(--xr-ok)",
  "--green-360": "var(--xr-ok)",
  "--status-danger": "var(--xr-danger)",
  "--text-danger": "var(--xr-danger)",
  // scrollbars: thin and quiet
  "--scrollbar-thin-thumb": "rgba(237, 233, 226, 0.14)",
  "--scrollbar-thin-track": "transparent",
  "--scrollbar-auto-thumb": "rgba(237, 233, 226, 0.16)",
  "--scrollbar-auto-track": "transparent",
  "--scrollbar-auto-scrollbar-color-thumb": "rgba(237, 233, 226, 0.16)",
  "--scrollbar-auto-scrollbar-color-track": "transparent",
};

/** Role names the overrides use, mapped onto the design tokens. */
const ROLES = `
  --xr-base: ${mist.m0};
  --xr-rail: ${mist.m1};
  --xr-side: ${mist.m1};
  --xr-chat: ${mist.m2};
  --xr-raised: ${mist.m3};
  --xr-raised-2: ${mist.m4};
  --xr-field: #202427;
  --xr-line: ${edge.soft};
  --xr-line-2: ${edge.strong};
  --xr-hover: ${edge.hover};
  --xr-selected: ${accent.oakWash};
  --xr-strong: ${ink.text};
  --xr-text: ${ink.text};
  --xr-muted: ${ink.text2};
  --xr-faint: ${ink.text3};
  --xr-accent: ${accent.oak};
  --xr-accent-hover: ${accent.oakHover};
  --xr-on-accent: ${accent.onOak};
  --xr-ok: ${accent.bamboo};
  --xr-danger: ${accent.danger};
  --xr-link: ${accent.link};`;

/** Inside the main layer, the frame and rail are clear so the backdrop shows between the panes. */
const FRAME_ROLES = `
  --xr-base: transparent;
  --xr-rail: transparent;`;

export const obsidianCss = `
${SCOPE} {${ROLES}
${Object.entries(TOKENS)
  .map(([name, value]) => `  ${name}: ${value} !important;`)
  .join("\n")}
}

${FRAME_SCOPE} {${FRAME_ROLES}
}

/* Increased contrast: secondary text steps up, hairlines get firmer. */
@media (prefers-contrast: more) {
  ${SCOPE.split(",\n").join(",\n  ")} {
    --xr-muted: ${ink.text} !important;
    --xr-faint: ${ink.text2} !important;
    --xr-line: ${edge.strong} !important;
    --xr-line-2: rgba(237, 233, 226, 0.28) !important;
  }
}

/* "Add Friend" sits on the oak button fill but hard-codes white text. */
html.xray-obsidian [class*="addFriend_"]:not([class*="selected_"]) {
  color: var(--xr-on-accent) !important;
}

html.xray-obsidian ::selection {
  background: rgba(210, 154, 87, 0.32);
  color: ${ink.text};
}
`;
