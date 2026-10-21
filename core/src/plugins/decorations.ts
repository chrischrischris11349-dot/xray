/**
 * Small additions to message headers and the channel list: a person's
 * @username next to their nickname, which devices they're on, whether
 * they're in voice, when a replied-to message was sent, and who's typing in
 * channels you aren't looking at.
 *
 * They decorate Discord's own elements: a watcher (api/dom.ts) finds new
 * headers as they appear, and the few actions that change a badge redraw
 * only the headers on screen. Each decoration is one span xray owns, marked
 * with the plugin's id, so redrawing replaces it rather than stacking.
 */
import { displayName, myId, stores } from "../discord";
import { definePlugin, type Plugin, type PluginContext } from "./types";

const ROW = /^chat-messages-(\d+)-(\d+)$/;
const HEADER = 'li[id^="chat-messages-"] h3[class*="header_"]';
const REDRAW_MS = 250;

function rowMessage(element: Element): any {
  const ids = ROW.exec(element.closest('li[id^="chat-messages-"]')?.id ?? "");
  return ids ? stores.messages?.getMessage?.(ids[1], ids[2]) : null;
}

/** Puts `content` in the header as this plugin's one decoration, or removes it when null. */
function setDecoration(header: Element, owner: string, content: HTMLElement | null): void {
  const old = header.querySelector(`:scope [data-xray-deco="${owner}"]`);
  if (!content) {
    old?.remove();
    return;
  }
  content.dataset.xrayDeco = owner;
  if (old) {
    if (old.outerHTML !== content.outerHTML) old.replaceWith(content);
    return;
  }
  (header.querySelector('[class*="headerText_"]') ?? header).append(content);
}

/** Watches message headers and redraws them on the given actions. */
function decorateHeaders(ctx: PluginContext<any>, owner: string, build: (message: any, header: Element) => HTMLElement | null, redrawOn: string[] = []): void {
  const draw = (header: Element) => {
    const message = rowMessage(header);
    if (message) setDecoration(header, owner, build(message, header));
  };
  ctx.watch(HEADER, draw);
  let timer: number | undefined;
  const redraw = () => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      document.querySelectorAll(HEADER).forEach(draw);
    }, REDRAW_MS);
  };
  for (const type of redrawOn) ctx.onAction(type, redraw);
  ctx.onStop(() => {
    clearTimeout(timer);
    document.querySelectorAll(`[data-xray-deco="${owner}"]`).forEach((el) => el.remove());
  });
}

function span(className: string, text: string, title?: string): HTMLElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  if (title) el.title = title;
  return el;
}

const BADGE_CSS = `
  .xray-badge { margin-left: 6px; font-size: 12px; font-weight: 500; color: var(--text-muted); white-space: nowrap; }
  .xray-icons { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: -2px; }
  .xray-icons svg { width: 14px; height: 14px; }
`;

const showMeYourName = definePlugin({
  id: "showMeYourName",
  name: "Show Usernames",
  description: "Shows a person's @username next to their nickname in chat, so you always know who's who.",
  category: "Chat",
  impact: "light",
  impactReason: "Adds one label per message header",
  needsReload: false,
  enabledByDefault: false,
  options: {
    mode: {
      type: "select",
      label: "Show",
      default: "username",
      choices: [
        { value: "username", label: "@username" },
        { value: "both", label: "Display name and @username" },
      ],
    },
  },
  start(ctx) {
    ctx.css(BADGE_CSS);
    const mode = ctx.options.mode;
    decorateHeaders(ctx, "username", (message) => {
      const author = message.author;
      if (!author?.username) return null;
      const guildId = stores.channels?.getChannel?.(message.channel_id)?.guild_id;
      const shown = displayName(author.id, guildId);
      if (shown === author.username) return null;
      const global = author.globalName && author.globalName !== shown ? author.globalName : null;
      return span("xray-badge", mode === "both" && global ? `${global} · @${author.username}` : `@${author.username}`);
    });
  },
});

const ICON_PATHS: Record<string, string> = {
  desktop: "M4 5h16v10H4zM9 19h6M12 15v4",
  mobile: "M8 3h8v18H8zM11 18h2",
  web: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18",
};
const STATUS_COLORS: Record<string, string> = { online: "#3dd68c", idle: "#f5b84a", dnd: "#ff6b5b" };

function clientStatus(userId: string): Record<string, string> {
  try {
    const presences = stores.presences;
    return presences?.getClientStatus?.(userId) ?? presences?.getState?.()?.clientStatuses?.[userId] ?? {};
  } catch {
    return {};
  }
}

function icon(kind: string, color: string, title: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const label = document.createElementNS("http://www.w3.org/2000/svg", "title");
  label.textContent = title;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICON_PATHS[kind]);
  svg.append(label, path);
  return svg;
}

const platformIndicators = definePlugin({
  id: "platformIndicators",
  name: "Device Indicators",
  description: "Small icons in chat show whether someone is on desktop, phone or web, colored by their status.",
  category: "Friends",
  impact: "light",
  impactReason: "Redraws visible headers when someone's status changes",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.css(BADGE_CSS);
    decorateHeaders(
      ctx,
      "platform",
      (message) => {
        const statuses = clientStatus(message.author?.id);
        const kinds = Object.keys(ICON_PATHS).filter((kind) => statuses[kind] && statuses[kind] !== "offline");
        if (!kinds.length || message.author?.bot) return null;
        const box = document.createElement("span");
        box.className = "xray-icons";
        for (const kind of kinds) box.append(icon(kind, STATUS_COLORS[statuses[kind]] ?? "#9a9ca5", `${kind[0].toUpperCase()}${kind.slice(1)}: ${statuses[kind]}`));
        return box;
      },
      ["PRESENCE_UPDATES"],
    );
  },
});

const userVoiceShow = definePlugin({
  id: "userVoiceShow",
  name: "In Voice Badge",
  description: "A small speaker next to someone's name in chat when they're in a voice channel. Point at it to see which.",
  category: "Voice",
  impact: "light",
  impactReason: "Redraws visible headers when voice changes",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.css(BADGE_CSS);
    decorateHeaders(
      ctx,
      "voice",
      (message) => {
        const channelId = stores.voiceStates?.getVoiceStateForUser?.(message.author?.id)?.channelId;
        if (!channelId) return null;
        const channel = stores.channels?.getChannel?.(channelId);
        const box = document.createElement("span");
        box.className = "xray-icons";
        const svg = icon("desktop", "#9a9ca5", `In voice: ${channel?.name ?? "a call"}`);
        svg.querySelector("path")!.setAttribute("d", "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13");
        box.append(svg);
        return box;
      },
      ["VOICE_STATE_UPDATES"],
    );
  },
});

function shortTime(date: Date): string {
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

const replyTimestamp = definePlugin({
  id: "replyTimestamp",
  name: "Reply Timestamps",
  description: "Shows when the message someone replied to was sent, right in the reply preview.",
  category: "Chat",
  impact: "light",
  impactReason: "Adds one label per reply",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`.xray-reply-time { margin-left: 6px; flex: none; font: 500 10.5px "Cascadia Mono", Consolas, monospace; color: var(--text-muted); opacity: .8; }`);
    ctx.watch('[class*="repliedMessage_"]', (reply) => {
      if (reply.querySelector(".xray-reply-time")) return;
      const message = rowMessage(reply);
      const ref = message?.messageReference;
      const id = ref?.message_id ?? ref?.messageId;
      const replied = id ? stores.messages?.getMessage?.(ref.channel_id ?? ref.channelId ?? message.channel_id, id) : null;
      const time = replied?.timestamp ? new Date(String(replied.timestamp)) : null;
      if (!time || Number.isNaN(time.getTime())) return;
      const label = span("xray-reply-time", shortTime(time), time.toLocaleString());
      const preview = reply.querySelector('[class*="repliedTextPreview_"]');
      if (preview) preview.insertAdjacentElement("afterend", label);
      else reply.append(label);
    });
    ctx.onStop(() => document.querySelectorAll(".xray-reply-time").forEach((el) => el.remove()));
  },
});

const typingIndicator = definePlugin({
  id: "typingIndicator",
  name: "Typing in Channel List",
  description: "A dot next to channels and DMs where someone is typing, so you can see it without opening them.",
  category: "Chat",
  impact: "light",
  impactReason: "Updates one row when typing starts or stops",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`
      [class*="sidebarList_"] a[data-xray-typing] { position: relative; }
      [class*="sidebarList_"] a[data-xray-typing]::after {
        content: ""; position: absolute; right: 10px; top: 50%; width: 6px; height: 6px; margin-top: -3px;
        border-radius: 50%; background: currentColor; opacity: .75; pointer-events: none;
      }
    `);
    const update = (channelId?: string) => {
      if (!channelId) return;
      let typing = false;
      try {
        const users = Object.keys(stores.typing?.getTypingUsers?.(channelId) ?? {});
        typing = users.some((id) => id !== myId());
      } catch {
        typing = false;
      }
      document.querySelectorAll(`[class*="sidebarList_"] a[href$="/${channelId}"]`).forEach((link) => link.toggleAttribute("data-xray-typing", typing));
    };
    // After the store updates, so the typing list is current.
    for (const type of ["TYPING_START", "TYPING_STOP", "MESSAGE_CREATE"]) {
      ctx.onAction(type, (action) => update(action.channelId ?? action.message?.channel_id));
    }
    // Discord lets typing lapse after about ten seconds without an action, so check again then.
    const lapses = new Map<string, number>();
    ctx.onAction("TYPING_START", ({ channelId }) => {
      if (!channelId) return;
      clearTimeout(lapses.get(channelId));
      lapses.set(channelId, window.setTimeout(() => {
        lapses.delete(channelId);
        update(channelId);
      }, 10_500));
    });
    ctx.onStop(() => lapses.forEach((timer) => clearTimeout(timer)));
    ctx.onStop(() => document.querySelectorAll("[data-xray-typing]").forEach((link) => link.removeAttribute("data-xray-typing")));
  },
});

export const decorationPlugins: readonly Plugin<any>[] = [replyTimestamp, typingIndicator, showMeYourName, platformIndicators, userVoiceShow];
