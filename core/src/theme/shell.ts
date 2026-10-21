/**
 * The xray shell: the layout half of the Obsidian theme (colors are in
 * obsidian.ts). Discord's panes become floating glass cards over a dark,
 * dot-gridded backdrop:
 *
 *   - a command bar on top, with the xray mark and a mono breadcrumb
 *   - the server list as a floating dock of squircle icons
 *   - the channel list and the chat as separate rounded cards
 *   - your account as a pill under the dock and channel list
 *   - message text in bubbles (yours white, see ownMessages.ts), mono
 *     timestamps, and a pill-shaped message box
 *   - glass menus whose highlighted item turns white
 *
 * Discord's app is one CSS grid sized by a few variables
 * (--custom-app-top-bar-height and friends), so the shell resizes through
 * those and restyles the grid's children by class-name prefix. Discord's
 * class names end in a hash that changes between builds, so every selector
 * matches the stable prefix (`[class*="sidebarList_"]`). If Discord renames
 * something, that one piece goes back to Discord's look and the rest holds.
 *
 * Nothing here animates or blurs a large area: the backdrop is painted once,
 * and only small menus use backdrop blur, so scrolling stays cheap at 240 Hz.
 */

const MARK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='2' width='20' height='20' rx='6' fill='%23f2f3f5'/%3E%3Cpath d='M8.5 8.5l7 7M15.5 8.5l-7 7' fill='none' stroke='%230b0b0d' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E";

/** The same mark without its tile, for the home button (which draws its own). */
const MARK_GLYPH =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 7l10 10M17 7L7 17' fill='none' stroke='%23f2f3f5' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E";

const SEARCH_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2380828b' stroke-width='2.2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E";

/** Four small L-shaped ticks, one per corner, like a viewfinder. */
const corner = (x: string, y: string) =>
  `linear-gradient(var(--xr-tick), var(--xr-tick)) ${x} ${y} / 10px 1px no-repeat, linear-gradient(var(--xr-tick), var(--xr-tick)) ${x} ${y} / 1px 10px no-repeat`;
const HUD_TICKS = [corner("left", "top"), corner("right", "top"), corner("left", "bottom"), corner("right", "bottom")].join(",\n    ");

export const shellCss = `
html.xray-obsidian {
  --custom-app-top-bar-height: 46px !important;
  --xr-gap: 10px;
  --xr-radius: 18px;
  /* Neutral dark glass: true black-grey, no blue cast. */
  --xr-card: rgba(12, 12, 13, 0.72);
  --xr-panel: rgba(7, 7, 8, 0.86);
  /* Hairlines: plain white at a whisper, so edges read as glass, not color. */
  --xr-edge: rgba(255, 255, 255, 0.06);
  --xr-edge-hi: rgba(255, 255, 255, 0.1);
  /* HUD ticks: neutral silver. */
  --xr-tick: rgba(255, 255, 255, 0.18);
  /* Selected rows and your own bubbles. The Accent Color plugin changes these two. */
  --xr-pill: rgba(242, 242, 242, 0.94);
  --xr-on-pill: #0b0b0b;
  --xr-mono: "Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, monospace;
  --xr-card-shadow: inset 0 0 0 1px var(--xr-edge), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  /* Windows' own variable font instead of Discord's gg sans. */
  --font-primary: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif !important;
  --font-display: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif !important;
  --font-headline: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif !important;
  --font-code: var(--xr-mono) !important;

  /* The backdrop: near-black glass. A very dim dot grid, one soft neutral
     light from the top (like light falling on smoked glass) and a heavy
     vignette that pulls the eye to the center. No color cast. */
  background:
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.022) 1px, transparent 1.5px) 0 0 / 26px 26px,
    radial-gradient(1200px 700px at 50% -22%, rgba(255, 255, 255, 0.07), transparent 60%),
    radial-gradient(140% 120% at 50% 42%, transparent 50%, rgba(0, 0, 0, 0.6) 100%),
    #050505 !important;
  background-attachment: fixed !important;

  body { background: transparent !important; }
  /* Only clear #app-mount once Discord's app has mounted, so Discord's own
     loading screen (seasonal art and all) shows first, not the backdrop. */
  &[data-xray-loaded] #app-mount { background: transparent !important; }
  ::selection { background: rgba(255, 255, 255, 0.22); color: #ffffff; }

  /* ---------- the grid: a gap around every pane ---------- */
  [class*="baseLayer_"] [class*="base_"] { column-gap: 0 !important; }
  [class*="base_"] > [class*="content_"] { padding: 0 var(--xr-gap) var(--xr-gap) 0; }

  /* ---------- command bar ---------- */
  [class*="base_"] > [class^="bar_"] {
    position: relative !important;
    background: transparent !important;
    /* Reserve room at the right for xray's own window buttons (frame.ts). */
    padding-inline: 0 128px !important;
  }
  /* When the title-bar voice controls are on, reserve room for them too. */
  &[data-xray-vbar] [class*="base_"] > [class^="bar_"] { padding-inline-end: 248px !important; }
  [class*="base_"] > [class^="bar_"]::before {
    content: "xray";
    position: absolute;
    left: 22px;
    top: 50%;
    transform: translateY(-50%);
    height: 22px;
    padding-left: 32px;
    line-height: 22px;
    font: 650 14px var(--font-display);
    color: var(--xr-strong);
    background: no-repeat left center / 22px 22px url("${MARK}");
    pointer-events: none;
  }
  /* Discord's centered page title becomes a mono breadcrumb after the mark. */
  [class*="base_"] > [class^="bar_"] > [class*="title_"] {
    justify-content: flex-start !important;
    padding-left: 96px !important;
    pointer-events: none;
  }
  /* Long server names stop short of the search bar in the middle. */
  [class*="base_"] > [class^="bar_"] > [class*="title_"] [class*="title_"] {
    gap: 8px;
    min-width: 0;
    max-width: calc(50vw - 340px);
    overflow: hidden;
  }
  [class*="base_"] > [class^="bar_"] > [class*="title_"] [class*="title_"] > * { min-width: 0; }
  [class*="base_"] > [class^="bar_"] > [class*="title_"] [class*="title_"]::before {
    content: "/";
    margin-right: 2px;
    font: 400 13px var(--xr-mono);
    color: rgba(255, 255, 255, 0.22);
  }
  [class*="base_"] > [class^="bar_"] [class*="title_"] [class*="lineClamp1_"] {
    font: 500 11px var(--xr-mono) !important;
    letter-spacing: 0.16em !important;
    text-transform: uppercase !important;
    color: var(--xr-muted) !important;
  }
  [class*="base_"] > [class^="bar_"] [class*="title_"] svg { opacity: 0.6; }

  /* ---------- server dock ---------- */
  nav[class*="guilds_"] {
    width: 64px !important;
    margin: 0 var(--xr-gap) calc(52px + var(--xr-gap) * 2) var(--xr-gap) !important;
    border-radius: 22px !important;
    background: rgba(255, 255, 255, 0.028) !important;
    box-shadow: var(--xr-card-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
  }
  /* Center each icon in the narrowed dock (the pill stays pinned at the left edge). */
  nav[class*="guilds_"] [class*="listItem_"],
  nav[class*="guilds_"] [class*="folderGroup_"] { width: 64px !important; }
  nav[class*="guilds_"] [class*="listItem_"] > span,
  nav[class*="guilds_"] [class*="folderHeader_"],
  nav[class*="guilds_"] [class*="folderGroup_"] > div { margin-inline: auto !important; }
  /* The pill behind an open folder is absolutely positioned; center it on the narrowed dock. */
  nav[class*="guilds_"] [class*="folderGroupBackground_"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
  }
  /* The selection pill becomes a short glowing tick. */
  nav[class*="guilds_"] [class*="wrapper_"][class*="overlay_"] [class*="item_"] {
    width: 4px !important;
    border-radius: 0 4px 4px 0 !important;
    background: #ffffff !important;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.55) !important;
  }
  /* Squircles instead of Discord's masked circles. */
  nav[class*="guilds_"] foreignObject { mask: none !important; }
  nav[class*="guilds_"] foreignObject > div {
    overflow: hidden;
    border-radius: 13px !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
  nav[class*="guilds_"] [class*="folderGroup_"][class*="isExpanded_"] { border-radius: 16px; }
  nav[class*="guilds_"] [class*="guildSeparator_"] { width: 28px !important; background: var(--xr-edge-hi) !important; }
  /* Home is xray's mark, not Discord's logo. */
  nav[class*="guilds_"] [class*="scroller_"] > [class*="tutorialContainer_"]:first-child [class*="childWrapper_"] {
    background: no-repeat center / 22px 22px url("${MARK_GLYPH}") !important;
  }
  nav[class*="guilds_"] [class*="scroller_"] > [class*="tutorialContainer_"]:first-child [class*="childWrapper_"] > svg { opacity: 0; }

  /* ---------- floating cards ---------- */
  [class*="sidebarList_"] {
    margin: 0 var(--xr-gap) calc(52px + var(--xr-gap) * 2) 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--xr-radius) !important;
    background: var(--xr-card) !important;
    box-shadow: var(--xr-card-shadow), 0 18px 50px rgba(0, 0, 0, 0.4) !important;
  }
  [class*="sidebar_"] + [class*="page_"] {
    margin: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--xr-radius) !important;
    background: var(--xr-panel) !important;
    box-shadow: var(--xr-card-shadow), 0 24px 70px rgba(0, 0, 0, 0.5) !important;
  }
  [class*="sidebar_"] + [class*="page_"]::after {
    content: "";
    position: absolute;
    inset: 7px;
    z-index: 1;
    pointer-events: none;
    background:
    ${HUD_TICKS};
  }
  /* Your account: a pill under the dock and the channel list. */
  section[class*="panels_"] {
    left: var(--xr-gap) !important;
    right: var(--xr-gap) !important;
    bottom: var(--xr-gap) !important;
    border-radius: 16px !important;
    background: rgba(20, 20, 20, 0.82) !important;
    box-shadow: inset 0 0 0 1px var(--xr-edge-hi), inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 12px 32px rgba(0, 0, 0, 0.45) !important;
  }

  /* ---------- channel and DM lists ---------- */
  [class*="sidebarList_"] li[class*="channel_"] [class*="interactive_"],
  [class*="sidebarList_"] [class*="containerDefault_"] [class*="link_"] { border-radius: 10px !important; }
  /* The selected row turns white with dark text. */
  [class*="sidebarList_"] [class*="selected_"] > [class*="interactive_"],
  [class*="sidebarList_"] [class*="interactive_"][class*="selected_"],
  [class*="sidebarList_"] [class*="modeSelected_"] [class*="link_"] { background: var(--xr-pill) !important; }
  [class*="sidebarList_"] [class*="selected_"] > [class*="interactive_"] *,
  [class*="sidebarList_"] [class*="interactive_"][class*="selected_"] *,
  [class*="sidebarList_"] [class*="modeSelected_"] [class*="link_"] * { color: var(--xr-on-pill) !important; fill: var(--xr-on-pill); }
  [class*="privateChannelsHeaderContainer_"] {
    font: 500 10.5px var(--xr-mono) !important;
    letter-spacing: 0.16em !important;
    text-transform: uppercase !important;
    color: var(--xr-faint) !important;
  }
  /* "Find or start a conversation" reads as a search field. */
  [class*="sidebarList_"] [class*="searchBar_"] button {
    justify-content: flex-start !important;
    border-radius: 10px !important;
    background: rgba(255, 255, 255, 0.045) !important;
    box-shadow: inset 0 0 0 1px var(--xr-edge) !important;
    color: var(--xr-faint) !important;
    font-weight: 400 !important;
  }
  [class*="sidebarList_"] [class*="searchBar_"] button [class*="buttonChildrenWrapper_"] { justify-content: flex-start !important; padding-left: 10px !important; }
  [class*="sidebarList_"] [class*="searchBar_"] button [class*="buttonChildren_"] { gap: 8px; }
  [class*="sidebarList_"] [class*="searchBar_"] button [class*="buttonChildren_"]::before {
    content: "";
    flex: none;
    width: 14px;
    height: 14px;
    background: no-repeat center / contain url("${SEARCH_ICON}");
  }
  /* Favorite-DM pins only show while you point at the row. */
  li[class*="dm_"] [class*="favoriteIcon_"] { opacity: 0; transition: opacity 120ms ease; }
  li[class*="dm_"]:hover [class*="favoriteIcon_"] { opacity: 0.6; }
  [class*="numberBadge_"] { font-family: var(--xr-mono) !important; font-weight: 600 !important; }

  /* ---------- chat ---------- */
  [class*="subtitleContainer_"] section[class*="title_"] {
    background: transparent !important;
    border-bottom: 1px solid var(--xr-edge) !important;
    box-shadow: none !important;
  }
  [class*="subtitleContainer_"] [class*="titleWrapper_"] h1 {
    font-family: var(--font-display) !important;
    font-size: 16px !important;
    font-weight: 650 !important;
  }
  /* Other people's messages stay flat and clean; only yours get a bubble. */
  [class*="messageListItem_"] [class*="messageContent_"] { line-height: 1.5; }
  /* Yours are an accent bubble, marked by ownMessages.ts. */
  [data-xray-mine] [class*="messageContent_"]:not(:empty):not(:has([class*="emojiJumbo_"])) {
    display: inline-block;
    max-width: 100%;
    margin: 1px 0;
    padding: 5px 12px;
    border-radius: 4px 14px 14px 14px;
    background: var(--xr-pill);
    box-shadow: none;
    color: var(--xr-on-pill) !important;
  }
  [data-xray-mine] [class*="messageContent_"]:has([class*="emojiJumbo_"]),
  [class*="messageListItem_"] [class*="repliedTextContent_"] { margin-left: 0; padding: 0; background: none; box-shadow: none; }
  [data-xray-mine] [class*="messageContent_"] a { color: #111111 !important; }
  /* Links are near-white now, not blue, so an underline marks them instead. */
  [class*="markup_"] a[href] {
    text-decoration: underline !important;
    text-decoration-color: rgba(255, 255, 255, 0.28) !important;
    text-underline-offset: 2px;
  }
  [class*="markup_"] a[href]:hover { text-decoration-color: currentColor !important; }
  [data-xray-mine] [class*="markup_"] a[href] { text-decoration-color: rgba(0, 0, 0, 0.35) !important; }
  [data-xray-mine] [class*="messageContent_"] code.inline,
  [data-xray-mine] [class*="messageContent_"] [class*="mention"] { background: rgba(11, 11, 13, 0.08) !important; color: var(--xr-on-pill) !important; }
  [data-xray-mine] [class*="messageContent_"] [class*="edited_"] { color: rgba(11, 11, 13, 0.5) !important; }
  [class*="messageListItem_"] > [class*="message_"]:hover { background: transparent !important; }
  [class*="messageListItem_"] h3 [class*="username_"] { font-weight: 650 !important; }
  /* Squircle avatars, to match the dock. */
  [class*="messageListItem_"] img[class*="avatar_"] { border-radius: 12px !important; }
  [class*="messageListItem_"] time,
  [class*="messageListItem_"] [class*="timestamp_"] {
    font-family: var(--xr-mono) !important;
    font-size: 10.5px !important;
    letter-spacing: 0.04em !important;
    color: var(--xr-faint) !important;
  }
  [class*="divider_"][class*="hasContent_"] [class*="content_"] {
    font: 500 10.5px var(--xr-mono) !important;
    letter-spacing: 0.14em !important;
    text-transform: uppercase !important;
  }
  /* The hover toolbar as a glass pill. */
  [class*="messageListItem_"] [class*="buttonsInner_"] {
    border: 0 !important;
    border-radius: 12px !important;
    background: rgba(22, 22, 22, 0.92) !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 10px 26px rgba(0, 0, 0, 0.5) !important;
  }
  [class*="embedFull_"] {
    border-radius: 14px !important;
    background: rgba(255, 255, 255, 0.035) !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  [class*="messageListItem_"] [class*="imageWrapper_"],
  [class*="messageListItem_"] [class*="mosaicItem_"],
  [class*="embedFull_"] [class*="embedMedia_"] { border-radius: 12px !important; }
  [class*="markup_"] pre,
  [class*="markup_"] pre code { border-radius: 10px !important; }
  [class*="reaction_"] {
    border: 0 !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.05) !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
  }
  [class*="reaction_"][class*="reactionMe_"] {
    background: rgba(255, 255, 255, 0.14) !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.32) !important;
  }
  [class*="reactionCount_"] { font-family: var(--xr-mono) !important; color: var(--xr-strong) !important; }

  /* The message box: a floating glass pill. */
  form[class*="form_"] { padding: 0 20px 16px !important; }
  form[class*="form_"] [class*="channelTextArea_"] {
    border: 0 !important;
    border-radius: 22px !important;
    background: rgba(255, 255, 255, 0.05) !important;
    box-shadow: inset 0 0 0 1px var(--xr-edge-hi), inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 30px rgba(0, 0, 0, 0.35) !important;
  }
  form[class*="form_"] [class*="channelTextArea_"]:focus-within {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 0 0 4px rgba(255, 255, 255, 0.05), 0 10px 30px rgba(0, 0, 0, 0.35) !important;
  }
  form[class*="form_"] [class*="scrollableContainer_"] { border-radius: 22px !important; background: transparent !important; }

  /* Member list and profile panel: part of the chat card, split by a hairline. */
  aside[class*="aside_"],
  [class*="membersWrap_"],
  [class*="members_"] { background: transparent !important; }
  aside[class*="aside_"],
  [class*="membersWrap_"] { border-left: 1px solid var(--xr-edge) !important; }

  /* ---------- Settings and other full modals ---------- */
  [class*="container_"][class*="modal_"] {
    overflow: hidden;
    border-radius: 20px !important;
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
  }
  [class*="modal_"] nav[class*="nav_"] [class*="item_"] { border-radius: 10px !important; }
  /* Top-level sections (the ones with an icon) turn white when open; sub-pages keep a quiet tint. */
  [class*="modal_"] nav[class*="nav_"] [class*="item_"][class*="active_"]:has(svg) { background: var(--xr-pill) !important; }
  [class*="modal_"] nav[class*="nav_"] [class*="item_"][class*="active_"]:has(svg),
  [class*="modal_"] nav[class*="nav_"] [class*="item_"][class*="active_"]:has(svg) * { color: var(--xr-on-pill) !important; }
  [class*="modal_"] nav[class*="nav_"] h3[class*="label_"] {
    font: 500 10.5px var(--xr-mono) !important;
    letter-spacing: 0.16em !important;
    text-transform: uppercase !important;
    color: var(--xr-faint) !important;
  }

  /* ---------- menus ---------- */
  [class*="menu_"][role="menu"] {
    padding: 6px !important;
    border-radius: 14px !important;
    background: rgba(18, 18, 18, 0.86) !important;
    backdrop-filter: saturate(160%) blur(20px);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.07) !important;
  }
  [role="menu"] [class*="item_"] { border-radius: 8px !important; }
  [role="menu"] [class*="item_"][class*="focused_"]:not([class*="colorDanger_"]),
  [role="menu"] [class*="item_"][class*="focused_"]:not([class*="colorDanger_"]) * {
    background: #f2f2f2 !important;
    color: #0b0b0b !important;
  }
  [role="menu"] [class*="item_"][class*="focused_"]:not([class*="colorDanger_"]) * { background: transparent !important; }

  /* ---------- quiet scrollbars ---------- */
  ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
  ::-webkit-scrollbar-thumb { border: 0 !important; border-radius: 3px !important; background: rgba(255, 255, 255, 0.1) !important; }
  ::-webkit-scrollbar-track { background: transparent !important; }
}
`;
