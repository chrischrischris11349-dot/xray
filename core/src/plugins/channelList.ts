/**
 * Additions to the channel list: how many unread messages each channel has,
 * and small badges for channel kinds (age-restricted, announcements, rules,
 * forums). Each row carries its channel's id in its link, so the count and
 * badge come straight from Discord's stores.
 */
import { stores } from "../discord";
import { definePlugin, type Plugin, type PluginContext } from "./types";

const ROW_LINK = '[class*="sidebarList_"] li[class*="containerDefault_"] a[href^="/channels/"]';
const REDRAW_MS = 300;

function channelIdOf(link: Element): string | null {
  return /\/(\d+)$/.exec(link.getAttribute("href") ?? "")?.[1] ?? null;
}

/** One label xray owns at the end of a row's name, replaced on redraw. */
function setLabel(link: Element, owner: string, text: string | null, title?: string): void {
  const name = link.querySelector('[class*="name_"]') ?? link;
  let label = name.querySelector<HTMLElement>(`[data-xray-label="${owner}"]`);
  if (!text) {
    label?.remove();
    return;
  }
  if (!label) {
    label = document.createElement("span");
    label.dataset.xrayLabel = owner;
    name.append(label);
  }
  if (label.textContent !== text) label.textContent = text;
  if (title) label.title = title;
}

function rows(ctx: PluginContext<any>, owner: string, draw: (link: Element, channelId: string) => void, redrawOn: string[]): void {
  const one = (link: Element) => {
    const id = channelIdOf(link);
    if (id) draw(link, id);
  };
  ctx.watch(ROW_LINK, one);
  let timer: number | undefined;
  const all = () => {
    timer ??= window.setTimeout(() => {
      timer = undefined;
      document.querySelectorAll(ROW_LINK).forEach(one);
    }, REDRAW_MS);
  };
  redrawOn.forEach((type) => ctx.onAction(type, all));
  ctx.onStop(() => {
    clearTimeout(timer);
    document.querySelectorAll(`[data-xray-label="${owner}"]`).forEach((el) => el.remove());
  });
}

const LABEL_CSS = `
  [data-xray-label] { margin-left: 6px; flex: none; font: 600 10px "Cascadia Mono", Consolas, monospace; letter-spacing: .04em; }
  [data-xray-label="unread"] { padding: 0 5px; border-radius: 8px; background: rgba(255,255,255,.1); color: var(--text-default); line-height: 15px; }
  [data-xray-label="kind"] { text-transform: uppercase; color: var(--text-muted); opacity: .8; }
`;

const unreadCounts = definePlugin({
  id: "unreadCountBadge",
  name: "Unread Counts",
  description: "Shows how many unread messages each channel has, next to its name.",
  category: "Servers",
  impact: "light",
  impactReason: "Updates visible rows when messages arrive",
  needsReload: false,
  enabledByDefault: false,
  options: {
    muted: { type: "boolean", label: "Also in muted channels", default: false },
  },
  start(ctx) {
    ctx.css(LABEL_CSS);
    const alsoMuted = ctx.options.muted;
    rows(
      ctx,
      "unread",
      (link, id) => {
        const muted = link.closest('[class*="modeMuted_"]');
        const count = !muted || alsoMuted ? stores.readStates?.getUnreadCount?.(id) ?? 0 : 0;
        setLabel(link, "unread", count > 0 ? (count > 99 ? "99+" : String(count)) : null, `${count} unread`);
      },
      ["MESSAGE_CREATE", "CHANNEL_ACK", "BULK_ACK", "CHANNEL_SELECT", "LOAD_MESSAGES_SUCCESS"],
    );
  },
});

/** Discord's channel types worth a badge. */
const KINDS: Record<number, string> = { 5: "news", 15: "forum", 16: "media", 13: "stage" };

const channelBadges = definePlugin({
  id: "channelBadges",
  name: "Channel Badges",
  description: "Small badges on channels for what they are: age-restricted, announcements, forums, stages and rules.",
  category: "Servers",
  impact: "light",
  impactReason: "One label per channel row",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.css(LABEL_CSS);
    rows(
      ctx,
      "kind",
      (link, id) => {
        const channel = stores.channels?.getChannel?.(id);
        if (!channel) return setLabel(link, "kind", null);
        const guild = channel.guild_id ? stores.guilds?.getGuild?.(channel.guild_id) : null;
        const parts = [
          channel.nsfw || channel.isNSFW?.() ? "18+" : null,
          KINDS[channel.type] ?? null,
          guild?.rulesChannelId === channel.id ? "rules" : null,
        ].filter(Boolean);
        setLabel(link, "kind", parts.length ? parts.join(" · ") : null);
      },
      ["CHANNEL_UPDATES"],
    );
  },
});

export const channelListPlugins: readonly Plugin<any>[] = [unreadCounts, channelBadges];
