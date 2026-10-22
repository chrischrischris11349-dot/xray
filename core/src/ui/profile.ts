/**
 * The extended profile: a sheet with more about someone than Discord's own
 * profile shows at once. Opened from a person's right-click menu ("Profile
 * details") and from the Details button on their profile popout.
 *
 * Everything shown is what Discord itself knows and shows somewhere:
 * names, avatar and banner, status, bio, pronouns, badges, roles, when the
 * account was made, when they joined the server and when you became
 * friends, mutual servers and friends, and connected accounts.
 *
 * Three steps, so each can be tested on its own (core/test/core.test.ts):
 *   1. gather: what Discord's stores already hold, so the sheet opens at once;
 *      then mergeProfile() adds the profile request Discord makes when you
 *      open a profile (mutuals, connections, bio).
 *   2. profileSections(): decides what to show, and what to say when a piece
 *      is missing, still loading, or failed to load.
 *   3. renderProfile(): builds the sheet. Nothing here parses HTML; all
 *      text goes in as text.
 */
import { displayName, http, privateChannelActions, safeImage, snowflakeDate, stores } from "../discord";
import { warn } from "../env";
import { copyText, showSheet, closeDialog } from "./dialog";
import { h } from "./dom";

export type Presence = "online" | "idle" | "dnd" | "offline" | "unknown";
/** Where a piece of data stands: shown, still coming, or unavailable. */
export type Loaded<T> = { state: "ready"; value: T } | { state: "loading" } | { state: "failed" };

export interface ProfileRole {
  name: string;
  /** #RRGGBB, or null for roles without a color. */
  color: string | null;
}

export interface ProfileServer {
  id: string;
  name: string;
  icon: string | null;
  /** Their nickname there, if they have one. */
  nick: string | null;
}

export interface ProfileConnection {
  type: string;
  name: string;
  verified: boolean;
}

/** Everything the sheet can show. Only id and the names are always there. */
export interface ProfileData {
  id: string;
  /** What people see: server nickname, display name or username. */
  name: string;
  username: string;
  bot: boolean;
  avatar: string | null;
  banner: string | null;
  /** The profile's own accent, used to tint a missing banner. */
  accentColor: string | null;
  pronouns: string | null;
  bio: string | null;
  presence: Presence;
  customStatus: string | null;
  badges: string[];
  createdAt: Date;
  joinedServerAt: Date | null;
  boostingSince: Date | null;
  friendsSince: Date | null;
  roles: ProfileRole[];
  /** Only set when opened from a server. */
  serverName: string | null;
  mutualServers: Loaded<ProfileServer[]>;
  mutualFriends: Loaded<string[]>;
  connections: Loaded<ProfileConnection[]>;
}

const PRESENCE_LABEL: Record<Presence, string> = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline", unknown: "Status unknown" };

/** Discord's badge flags that show on a profile. */
const BADGE_FLAGS: readonly [bit: number, name: string][] = [
  [0, "Discord Staff"], [1, "Partner"], [2, "HypeSquad Events"], [3, "Bug Hunter"], [6, "HypeSquad Bravery"],
  [7, "HypeSquad Brilliance"], [8, "HypeSquad Balance"], [9, "Early Supporter"], [14, "Bug Hunter Gold"],
  [17, "Early Verified Bot Developer"], [18, "Moderator Programs Alumni"], [22, "Active Developer"],
];

const CONNECTION_NAMES: Record<string, string> = {
  battlenet: "Battle.net", bluesky: "Bluesky", bungie: "Bungie.net", crunchyroll: "Crunchyroll", domain: "Domain", ebay: "eBay",
  epicgames: "Epic Games", facebook: "Facebook", github: "GitHub", instagram: "Instagram", leagueoflegends: "League of Legends",
  mastodon: "Mastodon", paypal: "PayPal", playstation: "PlayStation", reddit: "Reddit", riotgames: "Riot Games", roblox: "Roblox",
  spotify: "Spotify", skype: "Skype", steam: "Steam", tiktok: "TikTok", twitch: "Twitch", twitter: "X", xbox: "Xbox", youtube: "YouTube",
};

// ---------- 1. gather ----------

/** What Discord already holds for this person. Opens instantly; mutuals start as loading. */
export function gatherProfile(user: any, guildId?: string | null): ProfileData {
  const id: string = user.id;
  const profile = safely(() => stores.profiles?.getUserProfile?.(id));
  const guildProfile = guildId ? safely(() => stores.profiles?.getGuildMemberProfile?.(id, guildId)) : null;
  const member = guildId ? safely(() => stores.members?.getMember?.(guildId, id)) : null;
  const activities: any[] = safely(() => stores.presences?.getActivities?.(id)) ?? [];
  const custom = activities.find((a) => a?.type === 4);
  const roles: ProfileRole[] = guildId
    ? ((member?.roles ?? []) as string[])
        .map((roleId) => safely(() => stores.roles?.getRole?.(guildId, roleId)))
        .filter(Boolean)
        .sort((a: any, b: any) => (b.position ?? 0) - (a.position ?? 0))
        .map((role: any) => ({ name: String(role.name), color: hexColor(role.color) }))
    : [];
  const friends = friendsSinceDate(id);
  return {
    id,
    name: displayName(id, guildId),
    username: user.username ?? "unknown",
    bot: !!user.bot,
    avatar: safely(() => safeImage(user.getAvatarURL?.(guildId ?? undefined, 160))) ?? null,
    banner: bannerUrl(id, guildProfile?.banner ?? profile?.banner ?? user.banner),
    accentColor: hexColor(profile?.accentColor ?? user.accentColor),
    pronouns: nonEmpty(guildProfile?.pronouns) ?? nonEmpty(profile?.pronouns),
    bio: nonEmpty(guildProfile?.bio) ?? nonEmpty(profile?.bio),
    presence: presenceOf(safely(() => stores.presences?.getStatus?.(id))),
    customStatus: nonEmpty([custom?.emoji?.name, custom?.state].filter(Boolean).join(" ")),
    badges: badgeNames(user.publicFlags ?? profile?.flags ?? 0),
    createdAt: snowflakeDate(id),
    joinedServerAt: dateOrNull(member?.joinedAt),
    boostingSince: dateOrNull(member?.premiumSince),
    friendsSince: friends,
    roles,
    serverName: guildId ? (safely(() => stores.guilds?.getGuild?.(guildId)?.name) ?? null) : null,
    mutualServers: { state: "loading" },
    mutualFriends: { state: "loading" },
    connections: { state: "loading" },
  };
}

/**
 * Adds Discord's profile response (GET /users/{id}/profile) to what the
 * stores gave. Pure: takes the response body, returns a new ProfileData.
 * A missing or malformed piece becomes "failed", never made up.
 */
export function mergeProfile(data: ProfileData, body: any): ProfileData {
  if (!body || typeof body !== "object") return markFailed(data);
  const profile = body.user_profile ?? {};
  const guildProfile = body.guild_member_profile ?? {};
  const member = body.guild_member ?? {};
  const servers: ProfileServer[] | null = Array.isArray(body.mutual_guilds)
    ? body.mutual_guilds
        .filter((g: any) => typeof g?.id === "string")
        .map((g: any) => {
          const guild = safely(() => stores.guilds?.getGuild?.(g.id));
          return {
            id: g.id,
            name: guild?.name ?? "A server you're in",
            icon: guild?.icon ? safeImage(`https://cdn.discordapp.com/icons/${g.id}/${guild.icon}.webp?size=64`) : null,
            nick: nonEmpty(g.nick),
          };
        })
    : null;
  const friends: string[] | null = Array.isArray(body.mutual_friends)
    ? body.mutual_friends.map((u: any) => nonEmpty(u?.global_name) ?? nonEmpty(u?.username)).filter((n: string | null): n is string => !!n)
    : null;
  const connections: ProfileConnection[] | null = Array.isArray(body.connected_accounts)
    ? body.connected_accounts
        .filter((c: any) => typeof c?.type === "string" && typeof c?.name === "string")
        .map((c: any) => ({ type: c.type, name: c.name, verified: c.verified === true }))
    : null;
  const badges = Array.isArray(body.badges) ? body.badges.map((b: any) => nonEmpty(b?.description)).filter(Boolean) : [];
  return {
    ...data,
    bio: nonEmpty(guildProfile.bio) ?? nonEmpty(profile.bio) ?? data.bio,
    pronouns: nonEmpty(guildProfile.pronouns) ?? nonEmpty(profile.pronouns) ?? data.pronouns,
    banner: bannerUrl(data.id, guildProfile.banner ?? profile.banner) ?? data.banner,
    accentColor: hexColor(profile.accent_color) ?? data.accentColor,
    badges: badges.length ? (badges as string[]) : data.badges,
    joinedServerAt: dateOrNull(member.joined_at) ?? data.joinedServerAt,
    boostingSince: dateOrNull(member.premium_since) ?? data.boostingSince,
    mutualServers: servers ? { state: "ready", value: servers } : { state: "failed" },
    mutualFriends: friends ? { state: "ready", value: friends } : { state: "failed" },
    connections: connections ? { state: "ready", value: connections } : { state: "failed" },
  };
}

function markFailed(data: ProfileData): ProfileData {
  const fail = <T,>(l: Loaded<T>): Loaded<T> => (l.state === "loading" ? { state: "failed" } : l);
  return { ...data, mutualServers: fail(data.mutualServers), mutualFriends: fail(data.mutualFriends), connections: fail(data.connections) };
}

// ---------- 2. decide ----------

export type ProfileSection =
  | { id: "about"; title: string; text: string }
  | { id: "dates"; title: string; facts: [label: string, value: string][] }
  | { id: "roles"; title: string; roles: ProfileRole[] }
  | { id: "servers"; title: string; servers: ProfileServer[]; note?: string }
  | { id: "friends"; title: string; names: string[]; note?: string }
  | { id: "connections"; title: string; connections: ProfileConnection[]; note?: string };

/** Up to this many names before "and N more". */
const LIST_LIMIT = 12;

/** What the sheet's body shows, in order. Sections with nothing to say are left out. */
export function profileSections(data: ProfileData, now = new Date()): ProfileSection[] {
  const sections: ProfileSection[] = [];
  // Full-width blocks first, then the half-width ones (the renderer keeps the grid free of holes).
  if (data.bio) sections.push({ id: "about", title: "About", text: data.bio });
  if (data.roles.length) sections.push({ id: "roles", title: `Roles · ${data.roles.length}`, roles: data.roles });

  const facts: [string, string][] = [["Account created", dated(data.createdAt, now)]];
  if (data.joinedServerAt) facts.push([data.serverName ? `Joined ${data.serverName}` : "Joined this server", dated(data.joinedServerAt, now)]);
  if (data.friendsSince) facts.push(["Friends since", dated(data.friendsSince, now)]);
  if (data.boostingSince) facts.push(["Boosting since", dated(data.boostingSince, now)]);
  sections.push({ id: "dates", title: "Dates", facts });

  sections.push(listSection("servers", "Mutual servers", data.mutualServers, "No servers in common.", (servers) => ({ servers })));
  sections.push(listSection("friends", "Mutual friends", data.mutualFriends, "No friends in common.", (names) => ({ names })));

  const connections = data.connections;
  // Connections are optional on a profile: when there are none, the section isn't worth the space.
  if (connections.state !== "ready" || connections.value.length) {
    sections.push(listSection("connections", "Connections", connections, "", (list) => ({ connections: list })));
  }
  return sections;
}

function listSection<T, S extends ProfileSection>(
  id: S["id"],
  title: string,
  loaded: Loaded<T[]>,
  empty: string,
  wrap: (items: T[]) => object,
): S {
  if (loaded.state === "loading") return { id, title, ...wrap([]), note: "Loading…" } as S;
  if (loaded.state === "failed") return { id, title, ...wrap([]), note: "Couldn't load this. Close and reopen to try again." } as S;
  const items = loaded.value;
  const shown = items.slice(0, LIST_LIMIT);
  const more = items.length - shown.length;
  return { id, title: items.length ? `${title} · ${items.length}` : title, ...wrap(shown), note: items.length ? (more > 0 ? `and ${more} more` : undefined) : empty } as S;
}

/** "12 March 2021 · 3 years, 7 months ago" */
export function dated(date: Date, now = new Date()): string {
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `${day} · ${ageBetween(date, now)}`;
}

export function ageBetween(from: Date, now: Date): string {
  let months = Math.max(0, Math.floor((now.getTime() - from.getTime()) / (30.44 * 864e5)));
  if (months === 0) {
    const days = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 864e5));
    return days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(months / 12);
  months -= years * 12;
  return `${[years && `${years} year${years === 1 ? "" : "s"}`, months && `${months} month${months === 1 ? "" : "s"}`].filter(Boolean).join(", ")} ago`;
}

// ---------- 3. render ----------

export interface ProfileActions {
  close(): void;
  copyId(): void;
  message?(): void;
}

/** Builds the sheet for this data. */
export function renderProfile(data: ProfileData, actions: ProfileActions, now = new Date()): HTMLElement {
  const titleId = `xray-profile-${data.id}`;
  const banner = h("div", { class: data.banner ? "pf-banner" : "pf-banner mist", attrs: { "aria-hidden": "true" } });
  if (data.banner) banner.style.backgroundImage = `url("${data.banner}")`;
  else if (data.accentColor) banner.style.setProperty("--pf-tint", data.accentColor);

  const avatar = data.avatar
    ? h("img", { class: "pf-avatar", attrs: { src: data.avatar, alt: "", referrerpolicy: "no-referrer" } })
    : h("div", { class: "pf-avatar pf-initial", attrs: { "aria-hidden": "true" }, text: initial(data.name) });

  const status = h(
    "span",
    { class: `pf-status ${data.presence}` },
    h("span", { class: "pf-dot", attrs: { "aria-hidden": "true" } }),
    PRESENCE_LABEL[data.presence],
  );

  const handle = [`@${data.username}`, data.pronouns].filter(Boolean).join(" · ");
  const head = h(
    "div",
    { class: "pf-head" },
    h("div", { class: "pf-avatar-wrap" }, avatar),
    h(
      "div",
      { class: "pf-names" },
      h("h2", { class: "pf-name", attrs: { id: titleId } }, data.name, data.bot ? h("span", { class: "pf-tag", text: "Bot" }) : null),
      h("div", { class: "pf-handle", text: handle }),
      h("div", { class: "pf-meta" }, status, data.customStatus ? h("span", { class: "pf-custom", text: data.customStatus }) : null),
      data.badges.length ? h("div", { class: "pf-badges" }, ...data.badges.map((b) => h("span", { class: "pf-badge", text: b }))) : null,
    ),
  );

  const blocks = profileSections(data, now).map(renderSection);
  // Half-width blocks pair up; an odd one out spans the row instead of leaving a hole.
  const halves = blocks.filter((block) => !block.classList.contains("wide"));
  if (halves.length % 2 === 1) halves[halves.length - 1].classList.add("wide");
  const body = h("div", { class: "pf-body" }, ...blocks);

  const foot = h(
    "div",
    { class: "pf-foot" },
    h("span", { class: "pf-id mono", text: data.id }),
    h("span", { class: "pf-spacer" }),
    h("button", { class: "btn ghost", attrs: { type: "button" }, text: "Copy ID", on: { click: actions.copyId } }),
    actions.message ? h("button", { class: "btn ghost", attrs: { type: "button" }, text: "Message", on: { click: actions.message } }) : null,
    h("button", { class: "btn pf-close", attrs: { type: "button" }, text: "Close", on: { click: actions.close } }),
  );

  return h("div", { class: "profile", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId } }, banner, head, body, foot);
}

function renderSection(section: ProfileSection): HTMLElement {
  const wide = section.id === "about" || section.id === "roles";
  const block = h("section", { class: wide ? "pf-block wide" : "pf-block", attrs: { "aria-label": section.title } }, h("h3", { class: "pf-title", text: section.title }));
  switch (section.id) {
    case "about":
      block.append(h("p", { class: "pf-bio", text: section.text }));
      break;
    case "dates":
      block.append(h("dl", { class: "pf-facts" }, ...section.facts.flatMap(([label, value]) => [h("dt", { text: label }), h("dd", { text: value })])));
      break;
    case "roles":
      block.append(
        h(
          "ul",
          { class: "pf-roles" },
          ...section.roles.map((role) => {
            const dot = h("span", { class: "pf-role-dot", attrs: { "aria-hidden": "true" } });
            if (role.color) dot.style.background = role.color;
            return h("li", { class: "pf-role" }, dot, role.name);
          }),
        ),
      );
      break;
    case "servers":
      block.append(
        h(
          "ul",
          { class: "pf-list" },
          ...section.servers.map((server) =>
            h(
              "li",
              { class: "pf-item" },
              server.icon
                ? h("img", { class: "pf-icon", attrs: { src: server.icon, alt: "", referrerpolicy: "no-referrer" } })
                : h("span", { class: "pf-icon pf-initial", attrs: { "aria-hidden": "true" }, text: initial(server.name) }),
              h("span", { class: "pf-item-text" }, h("span", { class: "pf-item-name", text: server.name }), server.nick ? h("span", { class: "pf-item-sub", text: `as ${server.nick}` }) : null),
            ),
          ),
        ),
      );
      break;
    case "friends":
      block.append(h("ul", { class: "pf-list compact" }, ...section.names.map((name) => h("li", { class: "pf-item", text: name }))));
      break;
    case "connections":
      block.append(
        h(
          "ul",
          { class: "pf-list compact" },
          ...section.connections.map((c) =>
            h(
              "li",
              { class: "pf-item" },
              h("span", { class: "pf-item-text" }, h("span", { class: "pf-item-name", text: c.name }), h("span", { class: "pf-item-sub", text: CONNECTION_NAMES[c.type] ?? c.type })),
              c.verified ? h("span", { class: "pf-verified", text: "Verified" }) : null,
            ),
          ),
        ),
      );
      break;
  }
  if ("note" in section && section.note) block.append(h("p", { class: "pf-note", text: section.note }));
  return block;
}

// ---------- opening it ----------

/** Opens the sheet for this person, then fills in what Discord's profile request adds. */
export function showProfile(user: any, guildId?: string | null): void {
  if (!user?.id) return;
  let data = gatherProfile(user, guildId);
  let sheet: HTMLElement | undefined;
  let open = true;
  const actions: ProfileActions = {
    close: () => closeDialog(),
    copyId: () => copyText(user.id),
    message: user.bot ? undefined : () => {
      closeDialog();
      privateChannelActions()?.openPrivateChannel?.(user.id);
    },
  };
  const draw = () => {
    const next = renderProfile(data, actions);
    if (sheet) sheet.replaceWith(next);
    sheet = next;
  };
  draw();
  showSheet(sheet!, () => (open = false));
  sheet!.querySelector<HTMLButtonElement>(".pf-close")?.focus();

  const client = http();
  if (!client?.get) {
    data = markFailed(data);
    draw();
    return;
  }
  Promise.resolve(
    client.get({ url: `/users/${user.id}/profile`, query: { with_mutual_guilds: true, with_mutual_friends: true, ...(guildId ? { guild_id: guildId } : {}) } }),
  )
    .then((response: any) => (data = mergeProfile(data, response?.body)))
    .catch((err: unknown) => {
      warn("couldn't load a profile", err);
      data = markFailed(data);
    })
    .finally(() => {
      if (!open) return;
      // Redrawing replaces the buttons, so keep keyboard focus inside the sheet.
      const root = sheet?.getRootNode() as Document | ShadowRoot | undefined;
      const hadFocus = !!root && !!sheet?.contains(root.activeElement);
      draw();
      if (hadFocus) sheet!.querySelector<HTMLButtonElement>(".pf-close")?.focus();
    });
}

// ---------- helpers ----------

function safely<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOrNull(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hexColor(value: unknown): string | null {
  return typeof value === "number" && value > 0 ? `#${value.toString(16).padStart(6, "0")}` : null;
}

function bannerUrl(id: string, hash: unknown): string | null {
  if (typeof hash !== "string" || !hash) return null;
  return safeImage(`https://cdn.discordapp.com/banners/${id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=600`);
}

function presenceOf(status: unknown): Presence {
  return status === "online" || status === "idle" || status === "dnd" || status === "offline" ? status : "unknown";
}

function badgeNames(flags: number): string[] {
  return BADGE_FLAGS.filter(([bit]) => flags & (1 << bit)).map(([, name]) => name);
}

/** Discord's relationship type for a friend. */
const FRIEND = 1;

function friendsSinceDate(id: string): Date | null {
  if (safely(() => stores.relationships?.getRelationshipType?.(id)) !== FRIEND) return null;
  return dateOrNull(safely(() => stores.relationships?.getSince?.(id)));
}

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
