/**
 * Obsidian: xray's default look, the dark glass design from the UI preview.
 *
 * Discord's UI reads its colors from CSS custom properties (its "tokens"), so
 * the theme overrides those rather than restyling elements by class name.
 * Class names are hashed and change with every Discord build; tokens don't.
 * Discord re-declares its tokens on nested theme containers (popouts, modals),
 * so the overrides target those too, and use !important to beat Discord's
 * own declarations on the same element.
 *
 * The glass: the page paints a fixed, faintly tinted dark backdrop on <html>,
 * and Discord's big surfaces (server rail, sidebars, chat) are translucent
 * over it. Menus, popouts and modals stay solid so text on them stays crisp.
 * The backdrop never moves or animates, so it's painted once. (A real Mica
 * window was tried and dropped: with a transparent WebView2, Windows didn't
 * draw the backdrop, and the window turned see-through.)
 */
const THEME_CONTAINERS = [".theme-dark", ".theme-darker", ".theme-midnight", ".theme-light"];

const SCOPE = [
  "html.xray-obsidian",
  // Tokens are re-declared on the main app layer so they pick up its glass palette below.
  'html.xray-obsidian [class*="baseLayer_"]',
  ...THEME_CONTAINERS.map((c) => `html.xray-obsidian ${c}`),
].join(",\n");

/**
 * Glass only inside the main app layer. Everything Discord opens on top of it
 * (Settings, modals, pop-outs) lives outside that layer and keeps the solid
 * palette, so nothing behind them shows through.
 */
const GLASS_SCOPE = [
  'html.xray-obsidian [class*="baseLayer_"]',
  ...THEME_CONTAINERS.map((c) => `html.xray-obsidian [class*="baseLayer_"] ${c}`),
].join(",\n");

/** Every token xray sets, and what to set it to. Values may use the --xr-* palette below. */
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
  "--background-surface-higher": "var(--xr-raised-2)",
  "--background-surface-highest": "var(--xr-raised-3)",
  "--bg-surface-raised": "var(--xr-raised)",
  "--modal-background": "var(--xr-raised)",
  "--card-background-default": "var(--xr-raised)",
  "--card-primary-pressed-bg": "var(--xr-raised-2)",
  "--background-secondary-alt": "var(--xr-raised)",
  "--background-accent": "var(--xr-raised-3)",
  "--channeltextarea-background": "var(--xr-field)",
  "--input-background-default": "var(--xr-field)",
  "--user-profile-overlay-background": "var(--xr-raised)",
  "--user-profile-toolbar-background": "var(--xr-raised)",
  "--user-profile-activity-toolbar-background": "var(--xr-raised)",
  "--background-scrim": "rgba(0, 0, 0, 0.6)",
  // hover and selection tints: neutral white instead of Discord's blue-grey
  "--background-mod-muted": "rgba(255, 255, 255, 0.035)",
  "--background-mod-subtle": "rgba(255, 255, 255, 0.05)",
  "--background-mod-normal": "rgba(255, 255, 255, 0.07)",
  "--background-mod-strong": "rgba(255, 255, 255, 0.1)",
  "--interactive-background-default": "rgba(255, 255, 255, 0.03)",
  "--interactive-background-hover": "var(--xr-hover)",
  "--interactive-background-active": "rgba(255, 255, 255, 0.1)",
  "--interactive-background-selected": "var(--xr-selected)",
  "--message-background-hover": "rgba(255, 255, 255, 0.025)",
  "--user-profile-background-hover": "var(--xr-hover)",
  "--card-secondary-bg": "rgba(255, 255, 255, 0.04)",
  // hairlines
  "--border-muted": "rgba(255, 255, 255, 0.05)",
  "--border-subtle": "var(--xr-line)",
  "--border-normal": "var(--xr-line-2)",
  "--border-strong": "rgba(255, 255, 255, 0.18)",
  "--chat-border": "var(--xr-line)",
  "--card-border-default": "var(--xr-line)",
  "--user-profile-border": "var(--xr-line)",
  "--user-profile-toolbar-border": "var(--xr-line)",
  "--input-border-default": "var(--xr-line-2)",
  "--input-border-hover": "rgba(255, 255, 255, 0.16)",
  "--input-border-active": "rgba(255, 255, 255, 0.32)",
  "--border-focus": "rgba(255, 255, 255, 0.5)",
  "--spine-default": "rgba(255, 255, 255, 0.1)",
  // text
  "--text-strong": "var(--xr-strong)",
  "--text-default": "var(--xr-text)",
  "--text-subtle": "#a6a8b0",
  "--text-muted": "var(--xr-muted)",
  "--chat-text-muted": "var(--xr-muted)",
  "--channels-default": "var(--xr-muted)",
  "--input-text-default": "var(--xr-text)",
  "--input-placeholder-text-default": "var(--xr-faint)",
  "--input-icon-default": "var(--xr-faint)",
  "--interactive-text-default": "#8f919a",
  "--interactive-icon-default": "#8f919a",
  "--interactive-text-hover": "var(--xr-strong)",
  "--interactive-icon-hover": "var(--xr-strong)",
  "--interactive-text-active": "var(--xr-strong)",
  "--interactive-icon-active": "var(--xr-strong)",
  "--interactive-muted": "#56585f",
  "--text-link": "#9db4ff",
  // accent: Discord's blurple becomes Obsidian's white. Filled buttons turn
  // white with dark text. Places where Discord forces white text on its
  // brand color (the selected server, "Add Friend") get frosted glass instead.
  "--brand-500": "#8b90a0",
  "--brand-560": "#6f7482",
  "--background-brand": "rgba(255, 255, 255, 0.16)",
  "--text-brand": "var(--xr-strong)",
  "--control-primary-background-default": "var(--xr-accent)",
  "--control-primary-background-hover": "#ffffff",
  "--control-primary-background-active": "#d3d5da",
  "--control-primary-text-default": "var(--xr-on-accent)",
  "--control-primary-text-hover": "var(--xr-on-accent)",
  "--control-primary-text-active": "var(--xr-on-accent)",
  "--control-brand-foreground": "var(--xr-strong)",
  "--control-brand-foreground-new": "var(--xr-strong)",
  "--button-outline-brand-background-hover": "rgba(255, 255, 255, 0.12)",
  "--button-outline-brand-border-active": "rgba(255, 255, 255, 0.4)",
  "--interactive-accent-background-default": "rgba(255, 255, 255, 0.05)",
  "--interactive-accent-background-hover": "rgba(255, 255, 255, 0.12)",
  "--interactive-accent-background-active": "rgba(255, 255, 255, 0.16)",
  "--interactive-accent-background-selected": "rgba(255, 255, 255, 0.12)",
  "--mention-background": "rgba(255, 255, 255, 0.1)",
  "--mention-foreground": "#ffffff",
  "--message-highlight-background-default": "rgba(255, 255, 255, 0.05)",
  "--message-highlight-background-hover": "rgba(255, 255, 255, 0.04)",
  "--background-code": "rgba(255, 255, 255, 0.05)",
  // scrollbars: thin and quiet
  "--scrollbar-thin-thumb": "rgba(255, 255, 255, 0.12)",
  "--scrollbar-thin-track": "transparent",
  "--scrollbar-auto-thumb": "rgba(255, 255, 255, 0.14)",
  "--scrollbar-auto-track": "transparent",
  "--scrollbar-auto-scrollbar-color-thumb": "rgba(255, 255, 255, 0.14)",
  "--scrollbar-auto-scrollbar-color-track": "transparent",
};

/** Solid surfaces: used everywhere except the main app layer (see GLASS_PALETTE). */
const PALETTE = `
  --xr-base: #08080a;
  --xr-rail: #08080a;
  --xr-side: #0e0e11;
  --xr-chat: #0b0b0d;
  --xr-raised: #141417;
  --xr-raised-2: #19191d;
  --xr-raised-3: #202025;
  --xr-field: rgba(255, 255, 255, 0.045);
  --xr-line: rgba(255, 255, 255, 0.065);
  --xr-line-2: rgba(255, 255, 255, 0.1);
  --xr-hover: rgba(255, 255, 255, 0.045);
  --xr-selected: rgba(255, 255, 255, 0.085);
  --xr-strong: #f2f3f5;
  --xr-text: #dcdde2;
  --xr-muted: #9a9ca5;
  --xr-faint: #80828b;
  --xr-accent: #f2f3f5;
  --xr-on-accent: #0b0b0d;`;

/**
 * Glass surfaces for the main app layer. Discord nests its big containers
 * (the app shell, the rail, a pane inside a pane) and many share one token,
 * so any tint stacks up: the base layers are clear, the panes carry only a
 * whisper of tint, and the backdrop does the rest.
 */
const GLASS_PALETTE = `
  --xr-base: transparent;
  --xr-rail: transparent;
  --xr-side: rgba(255, 255, 255, 0.022);
  --xr-chat: rgba(0, 0, 0, 0.24);`;

export const obsidianCss = `
${SCOPE} {${PALETTE}
${Object.entries(TOKENS)
  .map(([name, value]) => `  ${name}: ${value} !important;`)
  .join("\n")}
}

${GLASS_SCOPE} {${GLASS_PALETTE}
}

/* The backdrop behind the glass: near-black with a faint cool tint, fixed in place. */
html.xray-obsidian {
  background:
    radial-gradient(1200px 760px at 4% -12%, rgba(96, 110, 150, 0.26), transparent 62%),
    radial-gradient(1000px 700px at 106% 112%, rgba(90, 74, 120, 0.2), transparent 60%),
    radial-gradient(900px 600px at 58% 40%, rgba(44, 50, 66, 0.14), transparent 70%),
    #060607 !important;
  background-attachment: fixed !important;
}
html.xray-obsidian body,
html.xray-obsidian #app-mount {
  background: transparent !important;
}

/* Section labels as small uppercase mono, the data-label style from the preview. */
html.xray-obsidian [class*="sectionTitle_"] > h2,
html.xray-obsidian [class*="headerText_"],
html.xray-obsidian h3[class*="membersGroup_"],
html.xray-obsidian [class*="membersGroup_"] > h3,
html.xray-obsidian li[class*="containerDefault_"] h3 {
  font-family: var(--font-code) !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  letter-spacing: 0.12em !important;
  text-transform: uppercase !important;
  color: var(--xr-faint) !important;
}

/* "Add Friend" sits on the white button fill but hard-codes white text. */
html.xray-obsidian [class*="addFriend_"]:not([class*="selected_"]) {
  color: var(--xr-on-accent) !important;
}

/*
 * Layout: the channel list and the main page float as rounded glass cards
 * over the backdrop. These match Discord's layout classes by name prefix
 * (the hashed suffix changes between builds); if Discord renames them,
 * the cards just stop floating and everything else keeps working.
 */
html.xray-obsidian [class*="sidebarList_"],
html.xray-obsidian [class*="sidebar_"] + [class*="page_"] {
  border: 1px solid rgba(255, 255, 255, 0.07) !important;
  border-radius: 16px !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 12px 40px rgba(0, 0, 0, 0.35) !important;
  overflow: hidden !important;
}
html.xray-obsidian [class*="sidebarList_"] {
  margin: 0 0 8px 0 !important;
  background: rgba(255, 255, 255, 0.025) !important;
}
html.xray-obsidian [class*="sidebar_"] + [class*="page_"] {
  margin: 0 8px 8px 8px !important;
  background: rgba(0, 0, 0, 0.22) !important;
}

/* The title bar: clear, with the xray mark on the left. */
html.xray-obsidian [class*="base_"] > [class^="bar_"] {
  position: relative !important;
  background: transparent !important;
}
html.xray-obsidian [class*="base_"] > [class^="bar_"]::before {
  content: "xray";
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  height: 18px;
  padding-left: 26px;
  line-height: 18px;
  font: 600 13px var(--font-primary);
  letter-spacing: -0.01em;
  color: var(--xr-strong);
  background: no-repeat left center / 18px 18px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='2' width='20' height='20' rx='6' fill='%23f2f3f5'/%3E%3Cpath d='M8.5 8.5l7 7M15.5 8.5l-7 7' fill='none' stroke='%230b0b0d' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E");
  pointer-events: none;
}

html.xray-obsidian ::selection {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
}
`;
