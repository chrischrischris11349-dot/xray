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

export const serverPlugins: readonly Plugin<any>[] = [serverInfo, readAll, newGuildSettings];
