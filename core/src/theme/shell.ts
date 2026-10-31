/**
 * The layout half of xray's theme ("mist and oak"; colors are in obsidian.ts,
 * values in tokens.ts). Discord's panes become solid blocks on a strict grid
 * over a misty backdrop:
 *
 *   - a command bar on top with the xray mark and the page title
 *   - the server list as a dock; the channel list and the chat as blocks
 *   - one signature: a hard oak edge on whatever is selected or yours
 *     (the selected server, channel and settings page, your own messages)
 *   - glass only on floating layers (menus), never on content
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
import { accent, edge, mist, motion, radius, space, type } from "./tokens";
import { discordDropdownCss } from "../ui/dropdownStyles";

const MARK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='2' width='20' height='20' rx='6' fill='%23EDE9E2'/%3E%3Cpath d='M8.5 8.5l7 7M15.5 8.5l-7 7' fill='none' stroke='%231B1206' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E";

/** The same mark without its tile, for the home button (which draws its own). */
const MARK_GLYPH =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 7l10 10M17 7L7 17' fill='none' stroke='%23EDE9E2' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E";

const SEARCH_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23A39C92' stroke-width='2.2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E";

export const shellCss = `
html.xray-obsidian {
  --custom-app-top-bar-height: 46px !important;
  /* The grid: every pane sits one gap from its neighbours. */
  --xr-gap: ${space.s3};
  --xr-radius: ${radius.m};
  /* The signature edge: oak, on whatever is selected or yours. The Accent Color plugin changes these two. */
  --xr-pill: ${accent.oak};
  --xr-on-pill: ${accent.onOak};
  --xr-mono: "Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, monospace;
  --xr-edge-line: inset 0 0 0 1px ${edge.soft};
  --font-code: var(--xr-mono) !important;
  --focus-primary: var(--xr-pill) !important;

  /* Dark mist: slate light from the top left, a trace of oak warmth low on
     the right, over charcoal. Painted once (fixed), never animated. */
  background:
    radial-gradient(1100px 640px at 8% -12%, rgba(124, 138, 146, 0.11), transparent 62%),
    radial-gradient(900px 620px at 104% 112%, rgba(150, 104, 58, 0.08), transparent 60%),
    linear-gradient(180deg, #111314 0%, ${mist.m0} 55%, #090A0B 100%) !important;
  background-attachment: fixed !important;

  body { background: transparent !important; }
  /* Only clear #app-mount once Discord's app has mounted, so Discord's own
     loading screen (seasonal art and all) shows first, not the backdrop. */
  &[data-xray-loaded] #app-mount { background: transparent !important; }

  /* ---------- the grid ---------- */
  [class*="baseLayer_"] [class*="base_"] { column-gap: 0 !important; }
  [class*="base_"] > [class*="content_"] { padding: 0 var(--xr-gap) var(--xr-gap) 0; }

  /* ---------- command bar ---------- */
  [class*="base_"] > [class^="bar_"] {
    position: relative !important;
    background: transparent !important;
    /* Room at the right for xray's own window buttons (frame.ts). */
    padding-inline: 0 168px !important;
  }
  /* With the title-bar voice controls on, room for them too. */
  &[data-xray-vbar]:not([data-xray-presentation]) [class*="base_"] > [class^="bar_"] { padding-inline-end: 288px !important; }
  [class*="base_"] > [class^="bar_"]::before {
    content: "xray";
    position: absolute;
    left: 22px;
    top: 50%;
    transform: translateY(-50%);
    height: 22px;
    padding-left: 30px;
    line-height: 22px;
    font: ${type.heavy} 14px ${type.family};
    letter-spacing: -0.01em;
    color: var(--xr-strong);
    background: no-repeat left center / 22px 22px url("${MARK}");
    pointer-events: none;
  }
  /* Back and forward (Equicord's WebKeybinds) sit just after the mark, not under it. */
  /* A transform, not repositioning: the bar is a grid, and moving the group out of it reshuffles the Inbox. */
  [class*="base_"] > [class^="bar_"] > [class*="leading_"] { transform: translateX(112px); position: relative; z-index: 1; }
  [class*="base_"] > [class^="bar_"]:has(> [class*="leading_"] [class*="backForwardButtons_"]) > [class*="title_"] { padding-left: 196px !important; }
  /* Discord's centered page title moves next to the mark. */
  [class*="base_"] > [class^="bar_"] > [class*="title_"] {
    justify-content: flex-start !important;
    padding-left: 96px !important;
    pointer-events: none;
  }
  /* Long server names stop short of the search bar in the middle. */
  [class*="base_"] > [class^="bar_"] > [class*="title_"] [class*="title_"] {
    gap: ${space.s2};
    min-width: 0;
    max-width: calc(50vw - 340px);
    overflow: hidden;
  }
  [class*="base_"] > [class^="bar_"] > [class*="title_"] [class*="title_"] > * { min-width: 0; }
  [class*="base_"] > [class^="bar_"] > [class*="title_"] [class*="title_"]::before {
    content: "/";
    margin-right: 2px;
    font-weight: 400;
    color: var(--xr-line-2);
  }
  [class*="base_"] > [class^="bar_"] [class*="title_"] [class*="lineClamp1_"] {
    font-weight: ${type.bold} !important;
    color: var(--xr-muted) !important;
  }
  [class*="base_"] > [class^="bar_"] [class*="title_"] svg { opacity: 0.7; }

  /* ---------- server dock ---------- */
  /* ChannelTabs keeps its own drag/resize behavior; share the quiet tab finish. */
  .vc-channeltabs-container { background:transparent!important;box-shadow:none!important; }
  .vc-channeltabs-tab { border-radius:${radius.l}!important;min-height:32px!important;padding-block:4px!important;border-color:transparent!important;background:transparent!important;box-shadow:none!important; }
  .vc-channeltabs-tab.vc-channeltabs-tab-selected { background:linear-gradient(${edge.hover},transparent),var(--xr-raised,${mist.m3})!important;border-color:${edge.soft}!important;box-shadow:0 2px 6px rgba(0,0,0,.16),inset 0 1px ${edge.soft}!important; }
  .vc-channeltabs-tab.vc-channeltabs-tab-selected .vc-channeltabs-name-text { color:var(--xr-strong)!important;font-weight:${type.bold}!important; }
  .vc-channeltabs-tab:not(.vc-channeltabs-tab-selected):hover { background:${edge.hover}!important; }
  .vc-channeltabs-tab:focus-visible { outline:2px solid var(--xr-strong)!important;outline-offset:2px; }
  nav[class*="guilds_"] {
    width: 64px !important;
    margin: 0 var(--xr-gap) calc(52px + var(--xr-gap) * 2) var(--xr-gap) !important;
    border-radius: var(--xr-radius) !important;
    background: var(--xr-side) !important;
    box-shadow: var(--xr-edge-line) !important;
  }
  /* Center each icon in the narrowed dock (the selection edge stays pinned at the left). */
  nav[class*="guilds_"] [class*="listItem_"],
  nav[class*="guilds_"] [class*="folderGroup_"] { width: 64px !important; }
  nav[class*="guilds_"] [class*="listItem_"] > span,
  nav[class*="guilds_"] [class*="folderHeader_"],
  nav[class*="guilds_"] [class*="folderGroup_"] > div { margin-inline: auto !important; }
  /* The plate behind an open folder is absolutely positioned; center it on the narrowed dock. */
  nav[class*="guilds_"] [class*="folderGroupBackground_"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    border-radius: ${radius.l} !important;
  }
  /* The selection pill becomes the oak edge: square, no glow. */
  nav[class*="guilds_"] [class*="wrapper_"][class*="overlay_"] [class*="item_"] {
    width: 4px !important;
    border-radius: 0 !important;
    background: var(--xr-pill) !important;
  }
  /* Server icons as firm rounded squares instead of Discord's masked circles. */
  nav[class*="guilds_"] foreignObject { mask: none !important; }
  nav[class*="guilds_"] foreignObject > div {
    overflow: hidden;
    border-radius: ${radius.l} !important;
    box-shadow: inset 0 0 0 1px ${edge.soft};
  }
  nav[class*="guilds_"] [class*="guildSeparator_"] { width: 28px !important; height: 2px !important; background: var(--xr-line-2) !important; }
  /* Home is xray's mark, not Discord's logo. */
  nav[class*="guilds_"] [class*="scroller_"] > [class*="tutorialContainer_"]:first-child [class*="childWrapper_"] {
    background: no-repeat center / 22px 22px url("${MARK_GLYPH}") !important;
  }
  nav[class*="guilds_"] [class*="scroller_"] > [class*="tutorialContainer_"]:first-child [class*="childWrapper_"] > svg { opacity: 0; }

  /* ---------- blocks ---------- */
  [class*="sidebarList_"] {
    margin: 0 var(--xr-gap) calc(52px + var(--xr-gap) * 2) 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--xr-radius) !important;
    background: var(--xr-side) !important;
    box-shadow: var(--xr-edge-line), 0 10px 30px rgba(0, 0, 0, 0.28) !important;
  }
  [class*="sidebar_"] + [class*="page_"] {
    margin: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--xr-radius) !important;
    background: var(--xr-chat) !important;
    box-shadow: var(--xr-edge-line), 0 14px 40px rgba(0, 0, 0, 0.32) !important;
  }
  /* Your account: a block under the dock and the channel list. */
  section[class*="panels_"] {
    left: var(--xr-gap) !important;
    right: var(--xr-gap) !important;
    bottom: var(--xr-gap) !important;
    border-radius: var(--xr-radius) !important;
    background: var(--xr-side) !important;
    box-shadow: inset 0 0 0 1px ${edge.strong}, 0 10px 28px rgba(0, 0, 0, 0.3) !important;
  }

  /* ---------- channel and DM lists ---------- */
  [class*="sidebarList_"] li[class*="channel_"] [class*="interactive_"],
  [class*="sidebarList_"] [class*="containerDefault_"] [class*="link_"] {
    border-radius: ${radius.s} !important;
    transition: background-color ${motion.fast} ease;
  }
  /* Selected: an oak wash with the hard oak edge. Text stays light. */
  [class*="sidebarList_"] [class*="selected_"] > [class*="interactive_"],
  [class*="sidebarList_"] [class*="interactive_"][class*="selected_"],
  [class*="sidebarList_"] [class*="modeSelected_"] [class*="link_"] {
    background: var(--xr-selected) !important;
    box-shadow: inset 3px 0 0 var(--xr-pill) !important;
  }
  [class*="sidebarList_"] [class*="selected_"] > [class*="interactive_"] [class*="name_"],
  [class*="sidebarList_"] [class*="interactive_"][class*="selected_"] [class*="name_"],
  [class*="sidebarList_"] [class*="modeSelected_"] [class*="link_"] [class*="name_"] { color: var(--xr-strong) !important; font-weight: ${type.bold} !important; }
  /* Category headers: heavy and plain, not shouted. */
  [class*="sidebarList_"] li[class*="containerDefault_"] h3,
  [class*="privateChannelsHeaderContainer_"] {
    font-weight: ${type.heavy} !important;
    color: var(--xr-faint) !important;
  }
  /* "Find or start a conversation" reads as a search field. */
  [class*="sidebarList_"] [class*="searchBar_"] button {
    justify-content: flex-start !important;
    border-radius: ${radius.s} !important;
    background: #202427 !important;
    box-shadow: var(--xr-edge-line) !important;
    color: var(--xr-faint) !important;
    font-weight: 500 !important;
  }
  [class*="sidebarList_"] [class*="searchBar_"] button [class*="buttonChildrenWrapper_"] { justify-content: flex-start !important; padding-left: 10px !important; }
  [class*="sidebarList_"] [class*="searchBar_"] button [class*="buttonChildren_"] { gap: ${space.s2}; }
  [class*="sidebarList_"] [class*="searchBar_"] button [class*="buttonChildren_"]::before {
    content: "";
    flex: none;
    width: 14px;
    height: 14px;
    background: no-repeat center / contain url("${SEARCH_ICON}");
  }
  /* Favorite-DM pins only show while you point at the row. */
  li[class*="dm_"] [class*="favoriteIcon_"] { opacity: 0; transition: opacity ${motion.fast} ease; }
  li[class*="dm_"]:hover [class*="favoriteIcon_"] { opacity: 0.7; }

  /* ---------- chat ---------- */
  [class*="subtitleContainer_"] section[class*="title_"] {
    background: transparent !important;
    border-bottom: 1px solid var(--xr-line) !important;
    box-shadow: none !important;
  }
  /* The channel name is the one heavy headline on screen. */
  [class*="subtitleContainer_"] [class*="titleWrapper_"] h1 {
    font-size: 17px !important;
    font-weight: ${type.heavy} !important;
    letter-spacing: -0.01em;
  }
  [class*="messageListItem_"] [class*="messageContent_"] { line-height: 1.5; }
  /* Your own messages carry the oak edge (marked by ownMessages.ts). */
  [data-xray-mine] [class*="messageContent_"]:not(:empty) {
    border-left: 0;
    text-decoration-color: var(--xr-pill);
  }
  [class*="messageListItem_"] > [class*="message_"]:hover { background: var(--message-background-hover) !important; }
  [class*="messageListItem_"] h3 [class*="username_"] { font-weight: ${type.bold} !important; }
  [class*="messageListItem_"] time,
  [class*="messageListItem_"] [class*="timestamp_"] { color: var(--xr-faint) !important; }
  /* Links are a warm light tone, so an underline marks them too (not color alone). */
  [class*="markup_"] a[href] {
    text-decoration: underline !important;
    text-decoration-color: rgba(226, 185, 138, 0.4) !important;
    text-underline-offset: 2px;
  }
  [class*="markup_"] a[href]:hover { text-decoration-color: currentColor !important; }
  /* The hover toolbar: a small raised block. */
  [class*="messageListItem_"] [class*="buttonsInner_"] {
    border: 0 !important;
    border-radius: var(--xr-radius) !important;
    background: ${mist.m3} !important;
    box-shadow: inset 0 0 0 1px ${edge.strong}, 0 8px 22px rgba(0, 0, 0, 0.4) !important;
  }
  [class*="embedFull_"] {
    border-radius: var(--xr-radius) !important;
    background: ${mist.m3} !important;
  }
  [class*="messageListItem_"] [class*="imageWrapper_"],
  [class*="messageListItem_"] [class*="mosaicItem_"],
  [class*="embedFull_"] [class*="embedMedia_"] { border-radius: var(--xr-radius) !important; }
  [class*="markup_"] pre,
  [class*="markup_"] pre code { border-radius: ${radius.s} !important; }
  [class*="reaction_"] {
    border: 0 !important;
    border-radius: ${radius.s} !important;
    background: rgba(237, 233, 226, 0.06) !important;
    box-shadow: inset 0 0 0 1px ${edge.soft} !important;
  }
  [class*="reaction_"][class*="reactionMe_"] {
    background: var(--xr-selected) !important;
    box-shadow: inset 0 0 0 1px var(--xr-pill) !important;
  }
  [class*="reactionCount_"] { color: var(--xr-strong) !important; font-weight: ${type.bold} !important; }

  /* The message box: a firm field; focus draws the oak edge around it. */
  form[class*="form_"] { padding: 0 ${space.s4} ${space.s4} !important; }
  form[class*="form_"] [class*="channelTextArea_"] {
    border: 0 !important;
    border-radius: var(--xr-radius) !important;
    background: #202427 !important;
    box-shadow: inset 0 0 0 1px ${edge.strong} !important;
    transition: box-shadow ${motion.fast} ease;
  }
  form[class*="form_"] [class*="channelTextArea_"]:focus-within {
    box-shadow: inset 0 0 0 1px var(--xr-pill), 0 0 0 3px var(--xr-selected) !important;
  }
  form[class*="form_"] [class*="scrollableContainer_"] { border-radius: var(--xr-radius) !important; background: transparent !important; }

  /* Member list and profile panel: part of the chat block, split by a hairline. */
  aside[class*="aside_"],
  [class*="membersWrap_"],
  [class*="members_"] { background: transparent !important; }
  aside[class*="aside_"],
  [class*="membersWrap_"] { border-left: 1px solid var(--xr-line) !important; }

  /* ---------- Settings and other full modals ---------- */
  [class*="container_"][class*="modal_"] {
    overflow: hidden;
    border-radius: ${radius.l} !important;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 0 0 1px ${edge.strong} !important;
  }
  [class*="modal_"] nav[class*="nav_"] [class*="item_"] { border-radius: ${radius.s} !important; }
  /* The open section gets the same oak wash and edge as a selected channel. */
  [class*="modal_"] nav[class*="nav_"] [class*="item_"][class*="active_"] {
    background: var(--xr-selected) !important;
    box-shadow: inset 3px 0 0 var(--xr-pill) !important;
    color: var(--xr-strong) !important;
  }
  [class*="modal_"] nav[class*="nav_"] h3[class*="label_"] { font-weight: ${type.heavy} !important; color: var(--xr-faint) !important; }

  /* ---------- menus: the floating layer, the one place with glass ---------- */
  [class*="menu_"][role="menu"] {
    padding: ${space.s1} !important;
    border-radius: 8px !important;
    background: rgba(34, 38, 42, 0.9) !important;
    backdrop-filter: saturate(140%) blur(18px);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5), inset 0 0 0 1px ${edge.strong} !important;
  }
  [role="menu"] [class*="item_"] { border-radius: ${radius.s} !important; }
  [role="menu"] [class*="item_"][class*="focused_"]:not([class*="colorDanger_"]),
  [role="menu"] [class*="item_"][class*="focused_"]:not([class*="colorDanger_"]) * {
    background: var(--xr-pill) !important;
    color: var(--xr-on-pill) !important;
  }
  [role="menu"] [class*="item_"][class*="focused_"]:not([class*="colorDanger_"]) * { background: transparent !important; }

  /* ---------- quiet scrollbars ---------- */
  ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
  ::-webkit-scrollbar-thumb { border: 0 !important; border-radius: 3px !important; background: rgba(237, 233, 226, 0.12) !important; }
  ::-webkit-scrollbar-track { background: transparent !important; }
}

/* Reduce transparency: the floating layer turns solid. */
@media (prefers-reduced-transparency: reduce) {
  html.xray-obsidian [class*="menu_"][role="menu"] { background: ${mist.m3} !important; backdrop-filter: none; }
}
` + discordDropdownCss;
