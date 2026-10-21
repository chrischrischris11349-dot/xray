/**
 * Server plugins: quiet new servers, read everything at once, and a proper
 * look at a server's details.
 */
import { dispatch } from "../api/flux";
import { menu } from "../api/menus";
import { displayName, snowflakeDate, stores } from "../discord";
import { find } from "../webpack";
import { copyText, showDialog } from "../ui/dialog";
import { definePlugin, type Plugin } from "./types";

const JOINED_RECENTLY_MS = 2 * 60_000;
/** Discord's read-state kind for an ordinary channel. */
const CHANNEL_READ_STATE = 0;
const ACK_BATCH = 100;

function notificationActions(): any {
  return find(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      "updateGuildNotificationSettings" in c &&
      String(c.updateGuildNotificationSettings).includes("updateGuildNotificationSettings("),
  );
}

const newGuildSettings = definePlugin({
  id: "newGuildSettings",
  name: "Quiet New Servers",
  description: "Servers you join start muted, with @everyone and role pings off. Change any of it later as usual.",
  category: "Servers",
  impact: "light",
  impactReason: "Only runs when you join a server",
  needsReload: false,
  enabledByDefault: false,
  options: {
    mute: { type: "boolean", label: "Mute the server", default: true },
    everyone: { type: "boolean", label: "Ignore @everyone and @here", default: true },
    roles: { type: "boolean", label: "Ignore role mentions", default: true },
  },
  start(ctx) {
    const { mute, everyone, roles } = ctx.options;
    ctx.onAction("GUILD_CREATE", ({ guild }) => {
      const joined = Date.parse(guild?.joined_at ?? guild?.joinedAt ?? "");
      if (!guild?.id || !Number.isFinite(joined) || Date.now() - joined > JOINED_RECENTLY_MS) return;
      const settings: Record<string, boolean> = {};
      if (mute) settings.muted = true;
      if (everyone) settings.suppress_everyone = true;
      if (roles) settings.suppress_roles = true;
      if (Object.keys(settings).length) notificationActions()?.updateGuildNotificationSettings?.(guild.id, settings);
    });
  },
});

function markServersRead(guildIds?: readonly string[]): number {
  const guilds = guildIds ?? Object.keys(stores.guilds?.getGuilds?.() ?? {});
  const readStates = stores.readStates;
  const channels: { channelId: string; readStateType: number; messageId: string }[] = [];
  for (const guildId of guilds) {
    const listed = stores.guildChannels?.getChannels?.(guildId);
    for (const { channel } of [...(listed?.SELECTABLE ?? []), ...(listed?.VOCAL ?? [])]) {
      if (!channel?.id || !readStates?.hasUnread?.(channel.id)) continue;
      const messageId = readStates.lastMessageId?.(channel.id);
      if (messageId) channels.push({ channelId: channel.id, readStateType: CHANNEL_READ_STATE, messageId });
    }
  }
  for (let i = 0; i < channels.length; i += ACK_BATCH) {
    void dispatch({ type: "BULK_ACK", channels: channels.slice(i, i + ACK_BATCH), context: "APP" }).catch(() => {});
  }
  return channels.length;
}

const readAll = definePlugin({
  id: "readAllServers",
  name: "Read All",
  description: "Mark every server as read at once, from Ctrl+K or any server's right-click menu.",
  category: "Servers",
  impact: "light",
  impactReason: "Only runs when you ask",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.command("Mark all servers as read", "Clears every unread server", () => markServersRead());
    ctx.menu("guild-context", (items) => {
      items.push(menu.item({ id: "read-all-servers", label: "Mark all servers as read", action: () => markServersRead() }));
    });
  },
});

const VERIFICATION = ["None", "Low", "Medium", "High", "Highest"];

function date(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const serverInfo = definePlugin({
  id: "serverInfo",
  name: "Server Info",
  description: "Right-click a server for its details: created, owner, members, boosts, features and its ID.",
  category: "Servers",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("guild-context", (items, { guild, guildId }) => {
      const g = guild ?? (guildId ? stores.guilds?.getGuild?.(guildId) : null);
      if (!g) return;
      items.push(
        menu.group(
          menu.item({
            id: "server-info",
            label: "Server info",
            action: () => {
              const members = stores.memberCounts?.getMemberCount?.(g.id);
              const facts: [string, string][] = [
                ["Name", g.name],
                ["Created", date(snowflakeDate(g.id))],
                ["Owner", g.ownerId ? displayName(g.ownerId, g.id) : "Unknown"],
                ["Members", typeof members === "number" ? members.toLocaleString() : "Unknown"],
                ["Boosts", `${g.premiumSubscriberCount ?? 0} · level ${g.premiumTier ?? 0}`],
                ["Verification", VERIFICATION[g.verificationLevel] ?? "Unknown"],
              ];
              if (g.vanityURLCode) facts.push(["Invite", `discord.gg/${g.vanityURLCode}`]);
              if (g.joinedAt) facts.push(["You joined", date(new Date(g.joinedAt))]);
              const features = g.features ? [...g.features] : [];
              if (features.length) facts.push(["Features", features.map((f: string) => f.toLowerCase().replace(/_/g, " ")).join(", ")]);
              facts.push(["ID", g.id]);
              showDialog({ title: g.name, body: facts, actions: [{ label: "Copy ID", run: () => (copyText(g.id), false) }, { label: "Close", primary: true }] });
            },
          }),
          (() => {
            let icon: string | null = null;
            try {
              icon = g.getIconURL?.(4096, true) ?? null;
            } catch {
              icon = null;
            }
            return icon ? menu.item({ id: "open-server-icon", label: "Open server icon", action: () => window.open(icon!, "_blank") }) : null;
          })(),
        ),
      );
    });
  },
});

/** Discord's permission bits, by name. */
const PERMISSIONS: readonly [bit: number, name: string][] = [
  [3, "Administrator"], [5, "Manage Server"], [28, "Manage Roles"], [4, "Manage Channels"], [1, "Kick Members"], [2, "Ban Members"],
  [40, "Timeout Members"], [13, "Manage Messages"], [27, "Manage Nicknames"], [29, "Manage Webhooks"], [30, "Manage Expressions"],
  [33, "Manage Events"], [34, "Manage Threads"], [7, "View Audit Log"], [19, "View Server Insights"], [17, "Mention @everyone"],
  [22, "Mute Members"], [23, "Deafen Members"], [24, "Move Members"], [8, "Priority Speaker"], [0, "Create Invite"],
  [26, "Change Nickname"], [10, "View Channels"], [11, "Send Messages"], [38, "Send Messages in Threads"], [35, "Create Public Threads"],
  [36, "Create Private Threads"], [14, "Embed Links"], [15, "Attach Files"], [6, "Add Reactions"], [18, "Use External Emoji"],
  [37, "Use External Stickers"], [16, "Read Message History"], [12, "Send Text-to-Speech"], [31, "Use App Commands"],
  [50, "Use External Apps"], [46, "Send Voice Messages"], [49, "Create Polls"], [51, "Pin Messages"], [20, "Connect"], [21, "Speak"],
  [9, "Video"], [25, "Use Voice Activity"], [42, "Use Soundboard"], [45, "Use External Sounds"], [39, "Use Activities"],
  [32, "Request to Speak"], [43, "Create Expressions"], [44, "Create Events"],
];

/** The permission names a combined bitfield grants, most powerful first. */
export function permissionNames(bits: bigint): string[] {
  if (bits & (1n << 3n)) return ["Administrator (every permission)"];
  return PERMISSIONS.filter(([bit]) => bits & (1n << BigInt(bit))).map(([, name]) => name);
}

function toBits(value: unknown): bigint {
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return 0n;
  }
}

const permissionsViewer = definePlugin({
  id: "permissionsViewer",
  name: "Permissions Viewer",
  description: "Right-click someone in a server to see their roles and what those roles let them do there.",
  category: "Servers",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("user-context", (items, { user, guildId }) => {
      if (!user || !guildId) return;
      items.push(
        menu.item({
          id: "view-permissions",
          label: "View permissions",
          action: () => {
            const guild = stores.guilds?.getGuild?.(guildId);
            const member = stores.members?.getMember?.(guildId, user.id);
            const everyone = stores.roles?.getEveryoneRole?.(guild) ?? stores.roles?.getRole?.(guildId, guildId);
            const roles = (member?.roles ?? []).map((id: string) => stores.roles?.getRole?.(guildId, id)).filter(Boolean);
            roles.sort((a: any, b: any) => (b.position ?? 0) - (a.position ?? 0));
            let bits = toBits(everyone?.permissions);
            for (const role of roles) bits |= toBits(role.permissions);
            const facts: [string, string][] = [
              ["Roles", roles.length ? roles.map((r: any) => r.name).join(", ") : "None"],
              ["Can", guild?.ownerId === user.id ? "Everything (server owner)" : permissionNames(bits).join(", ") || "Nothing beyond @everyone"],
            ];
            showDialog({ title: `${displayName(user.id, guildId)} in ${guild?.name ?? "this server"}`, body: facts });
          },
        }),
      );
    });
  },
});

function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString();
}

const memberCount = definePlugin({
  id: "memberCount",
  name: "Member Count",
  description: "Shows a server's member and online counts in its header, at the top of the channel list.",
  category: "Servers",
  impact: "light",
  impactReason: "Updates one label when you switch servers",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`
      .xray-members { margin-left: auto; margin-right: 6px; flex: none; display: flex; gap: 8px; align-items: center;
        font: 500 10.5px "Cascadia Mono", Consolas, monospace; letter-spacing: .06em; color: var(--text-muted); white-space: nowrap; }
      .xray-members b { font-weight: 500; color: var(--text-default); }
      .xray-members i { display: inline-block; width: 6px; height: 6px; margin-right: 4px; border-radius: 50%; background: #3dd68c; }
    `);
    const HEADER = '[class*="sidebarList_"] nav header [class*="headerContent_"]';
    const draw = () => {
      const guildId = stores.selectedGuild?.getGuildId?.();
      const header = document.querySelector(HEADER);
      header?.querySelector(".xray-members")?.remove();
      if (!header || !guildId) return;
      const total = stores.memberCounts?.getMemberCount?.(guildId);
      const online = stores.memberCounts?.getOnlineCount?.(guildId);
      if (typeof total !== "number") return;
      const label = document.createElement("span");
      label.className = "xray-members";
      label.title = `${total.toLocaleString()} members${typeof online === "number" ? `, ${online.toLocaleString()} online` : ""}`;
      if (typeof online === "number") {
        const on = document.createElement("span");
        on.append(document.createElement("i"), compact(online));
        label.append(on);
      }
      const all = document.createElement("b");
      all.textContent = compact(total);
      label.append(all);
      const dropdown = header.querySelector('[class*="guildDropdown_"]');
      if (dropdown) dropdown.insertAdjacentElement("afterend", label);
      else header.append(label);
    };
    ctx.watch(HEADER, () => window.setTimeout(draw, 0));
    ctx.onAction("CHANNEL_SELECT", () => window.setTimeout(draw, 50));
    ctx.every(60_000, draw);
    ctx.onStop(() => document.querySelectorAll(".xray-members").forEach((el) => el.remove()));
  },
});

const friendsOnline = definePlugin({
  id: "friendsOnline",
  name: "Friends Online",
  description: "A small count under the home button of how many friends are online.",
  category: "Friends",
  impact: "light",
  impactReason: "Recounts when someone's status changes",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const HOME = 'nav[class*="guilds_"] [class*="tutorialContainer_"]:first-child [class*="listItem_"]';
    ctx.css(`
      ${HOME} { position: relative; margin-bottom: 10px; }
      .xray-online { position: absolute; left: 0; right: 0; bottom: -11px; text-align: center; pointer-events: none;
        font: 600 9.5px "Cascadia Mono", Consolas, monospace; letter-spacing: .04em; color: #3dd68c; }
    `);
    const count = () => {
      const friends: string[] = stores.relationships?.getFriendIDs?.() ?? [];
      return friends.filter((id) => (stores.presences?.getStatus?.(id) ?? "offline") !== "offline").length;
    };
    let timer: number | undefined;
    const draw = () => {
      timer = undefined;
      const home = document.querySelector(HOME);
      if (!home) return;
      let label = home.querySelector<HTMLElement>(".xray-online");
      if (!label) {
        label = document.createElement("div");
        label.className = "xray-online";
        home.append(label);
      }
      const n = count();
      label.textContent = n ? `${n} on` : "";
      label.title = `${n} friend${n === 1 ? "" : "s"} online`;
    };
    const later = () => {
      timer ??= window.setTimeout(draw, 1000);
    };
    ctx.watch(HOME, later);
    ctx.onAction("PRESENCE_UPDATES", later);
    ctx.onAction("CONNECTION_OPEN", later);
    ctx.onStop(() => {
      clearTimeout(timer);
      document.querySelectorAll(".xray-online").forEach((el) => el.remove());
    });
  },
});

export const serverPlugins: readonly Plugin<any>[] = [serverInfo, permissionsViewer, memberCount, readAll, newGuildSettings, friendsOnline];
