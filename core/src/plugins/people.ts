/**
 * Right-click helpers for people and things: when you became friends, a
 * friend's local time (from a timezone you note yourself), and Copy ID
 * without Developer Mode.
 */
import { menu, type MenuTarget } from "../api/menus";
import { displayName, http, snowflakeDate, stores } from "../discord";
import { pluginState, save } from "../settings";
import { copyText, promptText, showDialog } from "../ui/dialog";
import { definePlugin, type Plugin } from "./types";

const FRIEND = 1;

/** Discord's badge flags that show on a profile. */
const BADGES: readonly [bit: number, name: string][] = [
  [0, "Discord Staff"], [1, "Partner"], [2, "HypeSquad Events"], [3, "Bug Hunter"], [6, "HypeSquad Bravery"],
  [7, "HypeSquad Brilliance"], [8, "HypeSquad Balance"], [9, "Early Supporter"], [14, "Bug Hunter Gold"],
  [17, "Early Verified Bot Developer"], [18, "Moderator Programs Alumni"], [22, "Active Developer"],
];

function badgeNames(flags: number): string[] {
  return BADGES.filter(([bit]) => flags & (1 << bit)).map(([, name]) => name);
}

/** "3 years, 2 months" from a date in the past. */
function ageSince(date: Date): string {
  const now = Date.now();
  let months = Math.max(0, Math.floor((now - date.getTime()) / (30.44 * 864e5)));
  const years = Math.floor(months / 12);
  months -= years * 12;
  const parts = [years && `${years} year${years === 1 ? "" : "s"}`, months && `${months} month${months === 1 ? "" : "s"}`].filter(Boolean);
  return parts.join(", ") || "less than a month";
}

const accountDetails = definePlugin({
  id: "accountDetails",
  name: "Profile Details",
  description: "Right-click someone for extra profile info Discord buries: account age, when they joined the server, mutuals and badges.",
  category: "Friends",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("user-context", (items, { user, guildId }) => {
      if (!user) return;
      items.push(
        menu.item({
          id: "account-details",
          label: "Profile details",
          action: () => {
            const created = snowflakeDate(user.id);
            const facts: [string, string][] = [
              ["Username", `@${user.username}${user.discriminator && user.discriminator !== "0" ? `#${user.discriminator}` : ""}`],
              ["Account made", `${created.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · ${ageSince(created)} ago`],
            ];
            if (user.bot) facts.push(["Type", "Bot"]);
            // Server-specific, when you opened this from a server.
            const member = guildId ? stores.members?.getMember?.(guildId, user.id) : null;
            if (member?.joinedAt) {
              const joined = new Date(member.joinedAt);
              facts.push(["Joined server", `${joined.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · ${ageSince(joined)} ago`]);
              const roles = (member.roles ?? []).map((id: string) => stores.roles?.getRole?.(guildId!, id)?.name).filter(Boolean);
              if (roles.length) facts.push(["Roles", roles.join(", ")]);
            }
            // Mutuals, if Discord has loaded this profile (opening the profile does that).
            const profile = stores.profiles?.getUserProfile?.(user.id);
            const mutualGuilds = stores.profiles?.getMutualGuilds?.(user.id);
            const mutualFriends = stores.profiles?.getMutualFriendsCount?.(user.id);
            if (Array.isArray(mutualGuilds)) facts.push(["Mutual servers", String(mutualGuilds.length)]);
            if (typeof mutualFriends === "number") facts.push(["Mutual friends", String(mutualFriends)]);
            const badges = badgeNames(user.publicFlags ?? profile?.flags ?? 0);
            if (badges.length) facts.push(["Badges", badges.join(", ")]);
            facts.push(["ID", user.id]);
            showDialog({
              title: displayName(user.id, guildId),
              body: facts,
              actions: [{ label: "Copy ID", run: () => (copyText(user.id), false) }, { label: "Close", primary: true }],
            });
          },
        }),
      );
    });
  },
});

/** When you became friends with someone, in ms, or null if you aren't friends. */
export function friendsSince(userId: string): number | null {
  try {
    const relationships = stores.relationships;
    if (relationships?.getRelationshipType?.(userId) !== FRIEND) return null;
    const ms = Date.parse(relationships.getSince?.(userId) ?? "");
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

const friendsSincePlugin = definePlugin({
  id: "friendsSince",
  name: "Friends Since",
  description: "Right-click a friend to see when you became friends.",
  category: "Friends",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("user-context", (items, { user }) => {
      const ms = user ? friendsSince(user.id) : null;
      if (!ms) return;
      const date = new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
      items.push(menu.item({ id: "friends-since", label: `Friends since ${date}`, disabled: true }));
    });
  },
});

const TIMEZONES_ID = "timezones";

function zones(): Record<string, string> {
  const data = pluginState(TIMEZONES_ID).data;
  return data && typeof data.zones === "object" && data.zones ? (data.zones as Record<string, string>) : {};
}

function setZone(userId: string, zone: string | null): void {
  const next = { ...zones() };
  if (zone) next[userId] = zone;
  else delete next[userId];
  (pluginState(TIMEZONES_ID).data ??= {}).zones = next;
  save();
}

/** The time now in a timezone, like "3:42 PM", or null if the zone isn't one. */
export function localTime(zone: string, now = new Date()): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(now);
  } catch {
    return null;
  }
}

/** "tokyo" or "new york" → "Asia/Tokyo" or "America/New_York", by the city part of the zone name. */
export function findZone(text: string): string | null {
  const wanted = text.trim().toLowerCase().replace(/\s+/g, "_");
  if (!wanted) return null;
  if (localTime(text.trim())) return text.trim();
  const all: string[] = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return all.find((zone) => zone.toLowerCase().split("/").pop() === wanted) ?? all.find((zone) => zone.toLowerCase().includes(wanted)) ?? null;
}

const timezones = definePlugin({
  id: TIMEZONES_ID,
  name: "Timezones",
  description: "Note a friend's timezone (right-click them) and see their local time before you ping them at 3am. Kept on this PC.",
  category: "Friends",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.menu("user-context", (items, { user }) => {
      if (!user) return;
      const zone = zones()[user.id];
      const time = zone ? localTime(zone) : null;
      items.push(
        menu.group(
          time ? menu.item({ id: "local-time", label: `Their time: ${time}`, subtext: zone!.replace(/_/g, " "), disabled: true }) : null,
          menu.item({
            id: "set-timezone",
            label: zone ? "Change timezone…" : "Set timezone…",
            action: async () => {
              const text = await promptText({ title: "Their timezone", value: zone ?? "", placeholder: "A city, like Tokyo or New York", confirm: "Save" });
              if (text === null) return;
              if (!text.trim()) return setZone(user.id, null);
              const found = findZone(text);
              if (found) setZone(user.id, found);
              else showDialog({ title: "Timezone not found", body: `Couldn't find a timezone for “${text}”. Try a big city nearby, like London or Los Angeles.` });
            },
          }),
        ),
      );
    });
  },
});

/** Whether Discord's own Developer Mode "Copy ID" is already in the menu. */
function hasOwnCopyId(items: readonly any[]): boolean {
  const stack = [...items];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    if (typeof item.props?.id === "string" && item.props.id.includes("devmode-copy-id")) return true;
    const children = item.props?.children;
    if (Array.isArray(children)) stack.push(...children);
    else if (children) stack.push(children);
  }
  return false;
}

function idFor(target: MenuTarget, kind: string): string | undefined {
  if (kind === "message") return target.message?.id;
  if (kind === "user-context") return target.user?.id;
  if (kind === "guild-context") return target.guild?.id ?? target.guildId;
  return target.channel?.id;
}

const quickCopy = definePlugin({
  id: "quickCopy",
  name: "Copy ID",
  description: "“Copy ID” on messages, people, channels and servers without turning on Developer Mode, plus a person's avatar link.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    for (const kind of ["message", "user-context", "channel-context", "thread-context", "gdm-context", "guild-context"]) {
      ctx.menu(kind, (items, target) => {
        const id = idFor(target, kind);
        if (!id || hasOwnCopyId(items)) return;
        items.push(menu.item({ id: `copy-id-${kind}`, label: "Copy ID", action: () => copyText(id) }));
      });
    }
    ctx.menu("user-context", (items, { user }) => {
      let avatar: string | null = null;
      try {
        avatar = user?.getAvatarURL?.(undefined, 1024, true) ?? null;
      } catch {
        avatar = null;
      }
      if (avatar) items.push(menu.item({ id: "copy-avatar", label: "Copy avatar link", action: () => copyText(avatar!) }));
    });
  },
});

function bannerUrl(kind: "banners", id: string, hash: string | null | undefined): string | null {
  if (!hash) return null;
  return `https://cdn.discordapp.com/${kind}/${id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=4096`;
}

const viewBanners = definePlugin({
  id: "viewBanners",
  name: "View Banners",
  description: "Right-click someone or a server to open their banner full size.",
  category: "Media",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("user-context", (items, { user }) => {
      if (!user) return;
      // The profile is only known once Discord has loaded it (opening their profile does that).
      const url = bannerUrl("banners", user.id, stores.profiles?.getUserProfile?.(user.id)?.banner ?? user.banner);
      if (url) items.push(menu.item({ id: "open-banner", label: "Open banner", action: () => window.open(url, "_blank", "noopener,noreferrer") }));
    });
    ctx.menu("guild-context", (items, { guild, guildId }) => {
      const g = guild ?? (guildId ? stores.guilds?.getGuild?.(guildId) : null);
      const url = g ? bannerUrl("banners", g.id, g.banner) : null;
      if (url) items.push(menu.item({ id: "open-server-banner", label: "Open server banner", action: () => window.open(url, "_blank", "noopener,noreferrer") }));
    });
  },
});

/** Discord's relationship type for a friend request you sent that's still waiting. */
const OUTGOING_REQUEST = 4;

const cancelFriendRequest = definePlugin({
  id: "cancelFriendRequest",
  name: "Cancel Friend Request",
  description: "Right-click someone you've sent a friend request to and take it back.",
  category: "Friends",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("user-context", (items, { user }) => {
      if (!user || stores.relationships?.getRelationshipType?.(user.id) !== OUTGOING_REQUEST) return;
      items.push(
        menu.item({
          id: "cancel-friend-request",
          label: "Cancel friend request",
          color: "danger",
          action: () => void http()?.del?.({ url: `/users/@me/relationships/${user.id}` })?.catch?.(() => {}),
        }),
      );
    });
  },
});

export const peoplePlugins: readonly Plugin<any>[] = [accountDetails, quickCopy, friendsSincePlugin, timezones, viewBanners, cancelFriendRequest];
