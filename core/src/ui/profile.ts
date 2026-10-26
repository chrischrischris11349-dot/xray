import { formatDateTime } from "../time";
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
import { displayName, http, myId, navigate, onStoresChanged, privateChannelActions, safeImage, snowflakeDate, stores } from "../discord";
import { icon } from "./icons";
import { warn } from "../env";
import { copyText, showSheet, closeDialog, showDialog } from "./dialog";
import { h } from "./dom";
import { oathnetSection } from "./oathnet";
import { availableMessages } from "./messageBrowser";
import { reportsFor } from "./reportCache";
import { renderImportedReport } from "./importedReport";
import { discordDate, memberJoinedAt } from "./memberDates";
import { profileJournal } from "./profileJournal";
import { observeProfileResponse } from "../history";
import { onAction } from "../api/flux";
import { linkedText, connectionUrl } from "./reportText";
import { reportPhoto } from "./importedReport";

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
  id?: string;
  url?: string;
}
export interface ProfileFriend { id: string; name: string; avatar: string | null; knownServers: string[]; }

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
  badgeIcons?: Record<string, string>;
  createdAt: Date;
  joinedServerAt: Date | null;
  boostingSince: Date | null;
  friendsSince: Date | null;
  relationship?: string | null;
  legacyUsername?: string | null;
  premiumSince?: Date | null;
  serverNickname?: string | null;
  mutualFriendCount?: number | null;
  roles: ProfileRole[];
  /** Only set when opened from a server. */
  serverName: string | null;
  guildId?: string | null;
  mutualServers: Loaded<ProfileServer[]>;
  mutualFriends: Loaded<string[]>;
  mutualFriendUsers?: ProfileFriend[];
  connections: Loaded<ProfileConnection[]>;
  profileState?:"loading"|"ready"|"failed";
  memberState?:"loading"|"ready"|"failed";
  profileError?:string;
  memberError?:string;
  profileFields?:{legacyUsername:boolean;premiumSince:boolean};
  memberFields?:{joined:boolean;boosting:boolean;nickname:boolean};
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
    avatar: safely(() => safeImage(user.getAvatarURL?.(guildId ?? undefined, 160))) ?? (user.avatar ? safeImage(`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`) : null),
    banner: bannerUrl(id, guildProfile?.banner ?? profile?.banner ?? user.banner),
    accentColor: hexColor(profile?.accentColor ?? user.accentColor),
    pronouns: nonEmpty(guildProfile?.pronouns) ?? nonEmpty(profile?.pronouns),
    bio: nonEmpty(guildProfile?.bio) ?? nonEmpty(profile?.bio),
    presence: presenceOf(safely(() => stores.presences?.getStatus?.(id))),
    customStatus: nonEmpty([custom?.emoji?.name, custom?.state].filter(Boolean).join(" ")),
    badges: badgeNames(user.publicFlags ?? profile?.flags ?? 0),
    createdAt: snowflakeDate(id),
    joinedServerAt: memberJoinedAt(member),
    boostingSince: discordDate(member?.premiumSince ?? member?.premium_since),
    friendsSince: friends,
    relationship: relationshipLabel(id),
    legacyUsername: nonEmpty(profile?.legacyUsername ?? profile?.legacy_username ?? user.legacyUsername ?? user.legacy_username),
    premiumSince: dateOrNull(profile?.premiumSince ?? profile?.premium_since),
    serverNickname: nonEmpty(member?.nick),
    mutualFriendCount: validCount(profile?.mutualFriendsCount ?? profile?.mutual_friends_count),
    roles,
    serverName: guildId ? (safely(() => stores.guilds?.getGuild?.(guildId)?.name) ?? null) : null,
    guildId: guildId ?? null,
    mutualServers: { state: "loading" },
    mutualFriends: { state: "loading" },
    connections: { state: "loading" },
    profileState:"loading",memberState:guildId?"loading":undefined,
    profileFields:{legacyUsername:hasAny(profile,["legacyUsername","legacy_username"]),premiumSince:hasAny(profile,["premiumSince","premium_since"])},
    memberFields:{joined:hasAny(member,["joinedAt","joined_at"]),boosting:hasAny(member,["premiumSince","premium_since"]),nickname:hasAny(member,["nick"])},
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
  const friendUsers: ProfileFriend[] | undefined = Array.isArray(body.mutual_friends) ? body.mutual_friends.filter((u: any) => typeof u?.id === "string").map((u: any) => {
    const cached = safely(() => stores.users?.getUser?.(u.id));
    return { id: u.id, name: nonEmpty(u.global_name) ?? nonEmpty(u.username) ?? cached?.username ?? "Unknown user",
      avatar: u.avatar ? safeImage(`https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=80`) : safely(() => safeImage(cached?.getAvatarURL?.(undefined, 80))) ?? null,
      knownServers: (servers ?? []).filter(server => !!safely(() => stores.members?.getMember?.(server.id, u.id))).map(server => server.name) };
  }) : data.mutualFriendUsers;
  const connections: ProfileConnection[] | null = Array.isArray(body.connected_accounts)
    ? body.connected_accounts
        .filter((c: any) => typeof c?.type === "string" && typeof c?.name === "string")
        .map((c: any) => ({ type: c.type, name: c.name, verified: c.verified === true, id: typeof c.id === "string" ? c.id : undefined, url: typeof c.url === "string" ? c.url : undefined }))
    : null;
  const badges = Array.isArray(body.badges) ? body.badges.map((b: any) => nonEmpty(b?.description)).filter(Boolean) : [];
  return {
    ...data,
    profileState:"ready",profileError:undefined,
    profileFields:{legacyUsername:data.profileFields?.legacyUsername===true||hasAny(body,["legacy_username"])||hasAny(profile,["legacy_username"])||hasAny(body.user,["legacy_username"]),premiumSince:data.profileFields?.premiumSince===true||hasAny(body,["premium_since"])||hasAny(profile,["premium_since"])},
    avatar: safeImage(body.user?.avatar_url) ?? (typeof body.user?.avatar === "string" && /^[a-zA-Z0-9_]+$/.test(body.user.avatar) ? safeImage(`https://cdn.discordapp.com/avatars/${data.id}/${body.user.avatar}.png?size=128`) : null) ?? data.avatar,
    bio: nonEmpty(guildProfile.bio) ?? nonEmpty(profile.bio) ?? data.bio,
    pronouns: nonEmpty(guildProfile.pronouns) ?? nonEmpty(profile.pronouns) ?? data.pronouns,
    banner: bannerUrl(data.id, guildProfile.banner ?? profile.banner) ?? data.banner,
    accentColor: hexColor(profile.accent_color) ?? data.accentColor,
    badges: Array.isArray(body.badges) ? (badges as string[]) : data.badges,
    badgeIcons: Array.isArray(body.badges) ? Object.fromEntries(body.badges.flatMap((b: any) => {
      const name = nonEmpty(b?.description);
      const icon = typeof b?.icon === "string" && /^[a-zA-Z0-9_-]+$/.test(b.icon)
        ? `https://cdn.discordapp.com/badge-icons/${b.icon}.png` : safeImage(b?.icon);
      return name && icon ? [[name, icon]] : [];
    })) : data.badgeIcons,
    ...mergeProfileMember(data, member),
    legacyUsername: Object.hasOwn(body,"legacy_username")?nonEmpty(body.legacy_username):Object.hasOwn(profile,"legacy_username")?nonEmpty(profile.legacy_username):hasAny(body.user,["legacy_username"])?nonEmpty(body.user.legacy_username):data.legacyUsername,
    premiumSince: body.premium_since !== undefined ? dateOrNull(body.premium_since) : profile.premium_since !== undefined ? dateOrNull(profile.premium_since) : data.premiumSince,
    mutualFriendCount: validCount(body.mutual_friends_count) ?? (friends ? friends.length : data.mutualFriendCount),
    mutualServers: servers ? { state: "ready", value: servers } : { state: "failed" },
    mutualFriends: friends ? { state: "ready", value: friends } : { state: "failed" },
    mutualFriendUsers: friendUsers,
    connections: connections ? { state: "ready", value: connections } : { state: "failed" },
  };
}

/** Member dates belong to the selected server, never the account or guild creation date. */
export function mergeProfileMember(data: ProfileData, member: any): Pick<ProfileData,"joinedServerAt" | "boostingSince" | "serverNickname"|"memberState"|"memberError"|"memberFields"> {
  const unchanged = { joinedServerAt:data.joinedServerAt, boostingSince:data.boostingSince, serverNickname:data.serverNickname,memberState:data.memberState,memberError:data.memberError,memberFields:data.memberFields };
  if (!member || typeof member !== "object" || member.guild_id && data.guildId && member.guild_id !== data.guildId || member.guildId && data.guildId && member.guildId !== data.guildId || member.user?.id && member.user.id !== data.id || member.userId && member.userId !== data.id) return unchanged;
  return {
    memberState:hasAny(member,["joined_at","joinedAt","premium_since","premiumSince","nick"])?"ready":data.memberState,
    memberError:hasAny(member,["joined_at","joinedAt","premium_since","premiumSince","nick"])?undefined:data.memberError,
    memberFields:{joined:data.memberFields?.joined===true||hasAny(member,["joined_at","joinedAt"]),boosting:data.memberFields?.boosting===true||hasAny(member,["premium_since","premiumSince"]),nickname:data.memberFields?.nickname===true||hasAny(member,["nick"])},
    joinedServerAt: (data.guildId || data.serverName) && ("joined_at" in member || "joinedAt" in member) ? memberJoinedAt(member) : data.joinedServerAt,
    boostingSince: "premium_since" in member || "premiumSince" in member ? discordDate(member.premium_since ?? member.premiumSince) : data.boostingSince,
    serverNickname: "nick" in member ? nonEmpty(member.nick) : data.serverNickname,
  };
}

function markFailed(data: ProfileData): ProfileData {
  const fail = <T,>(l: Loaded<T>): Loaded<T> => (l.state === "loading" ? { state: "failed" } : l);
  return { ...data, profileState:"failed",mutualServers: fail(data.mutualServers), mutualFriends: fail(data.mutualFriends), connections: fail(data.connections) };
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

  const countLabel = (loaded: Loaded<unknown[]>) => loaded.state === "ready" ? String(loaded.value.length) : loaded.state === "loading" ? "Loading…" : "Unavailable";
  const facts: [string, string][] = [
    ["User ID", data.id],
    ["Account created", dated(data.createdAt, now)],
    ["Presence", PRESENCE_LABEL[data.presence]],
    ["Relationship", data.relationship ?? "Unavailable"],
    ["Account type", data.bot ? "Bot" : "User"],
    ["Legacy username", data.legacyUsername ?? missingProfileField(data,"legacyUsername","No legacy username shared")],
    ["Mutual friends", data.mutualFriendCount != null ? String(data.mutualFriendCount) : countLabel(data.mutualFriends)],
    ["Mutual servers", countLabel(data.mutualServers)],
    ["Premium since", data.premiumSince ? dated(data.premiumSince, now) : missingProfileField(data,"premiumSince","No premium date shared")],
    ["Server nickname", data.serverNickname ?? missingMemberField(data,"nickname","No server nickname")],
  ];
  if (data.joinedServerAt) facts.push([data.serverName ? `Joined ${data.serverName}` : "Joined this server", dated(data.joinedServerAt, now)]);
  if (data.joinedServerAt) facts.push(["Server join timestamp", `${formatDateTime(data.joinedServerAt)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${data.joinedServerAt.toISOString()}`]);
  if (data.friendsSince) facts.push(["Friends since", dated(data.friendsSince, now)]);
  if (data.boostingSince) facts.push(["Boosting since", dated(data.boostingSince, now)]);
  else facts.push(["Boosting since", missingMemberField(data,"boosting","Not boosting this server")]);
  if (!data.joinedServerAt) facts.push(["Joined this server", missingMemberField(data,"joined","No join date returned")]);
  sections.push({ id: "dates", title: "Profile details", facts });

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
  openServer?(id: string): void;
  openFriend?(friend: ProfileFriend): void;
}

/** Builds the sheet for this data. */
export function renderProfile(data: ProfileData, actions: ProfileActions, now = new Date()): HTMLElement {
  const titleId = `xray-profile-${data.id}`;
  const banner = h("div", { class: data.banner ? "pf-banner" : "pf-banner mist", attrs: { "aria-hidden": "true" } });
  if (data.banner) banner.style.backgroundImage = `url("${data.banner}")`;
  else if (data.accentColor) banner.style.setProperty("--pf-tint", data.accentColor);

  const avatar = reportPhoto(data.avatar,data.name,"pf-avatar pf-initial");

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
      h("div", { class: "pf-meta" }, status, data.customStatus ? h("span", { class: "pf-custom", text: data.customStatus }) : null,
        h("span",{class:"pf-badge",attrs:{title:"Discord does not reliably expose another person's client modification. Presence device indicators do not prove Vencord or another client."}},h("span",{trustedHtml:icon("info",14)}),data.id===myId()?"XRay · this session":"Client undisclosed")),
      data.badges.length ? h("div", { class: "pf-badges" }, ...data.badges.map((b) => h("span", { class: "pf-badge" },
        data.badgeIcons?.[b] ? h("img", { attrs: { src: data.badgeIcons[b], alt: "", width: "22", height: "22", referrerpolicy: "no-referrer" } }) : null, b))) : null,
    ),
  );

  const blocks = profileSections(data, now).map(section => renderSection(section, data, actions));
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

function renderSection(section: ProfileSection, data: ProfileData, actions: ProfileActions): HTMLElement {
  const wide = section.id === "about" || section.id === "roles";
  const block = h("section", { class: wide ? "pf-block wide" : "pf-block", attrs: { "aria-label": section.title } }, h("h3", { class: "pf-title", text: section.title }));
  switch (section.id) {
    case "about":
      block.append(h("p", { class: "pf-bio" },linkedText(section.text)));
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
      {
      const serverRow = (server: ProfileServer) => {
        const row = h("li", { class: "pf-item" });
        const contents = [server.icon ? h("img", { class: "pf-icon", attrs: { src: server.icon, alt: "", referrerpolicy: "no-referrer", loading: "lazy" } }) : h("span", { class: "pf-icon pf-initial", text: initial(server.name) }),
          h("span", { class: "pf-item-text" }, h("span", { class: "pf-item-name", text: server.name }), server.nick ? h("span", { class: "pf-item-sub", text: `as ${server.nick}` }) : null)];
        row.append(actions.openServer ? h("button", { class: "pf-navigation", attrs: { type: "button", "aria-label": `Open ${server.name}` }, on: { click: () => actions.openServer!(server.id) } }, ...contents) : h("div", { class: "pf-navigation" }, ...contents));
        return row;
      };
      const all = data.mutualServers.state === "ready" ? data.mutualServers.value : section.servers;
      block.append(
        h("ul", { class: "pf-list" }, ...section.servers.map(serverRow)),
      );
      if (all.length > LIST_LIMIT) block.append(h("details", { class: "pf-report-details" }, h("summary", { text: `Show ${all.length - LIST_LIMIT} more shared servers` }), h("ul", { class: "pf-list" }, ...all.slice(LIST_LIMIT).map(serverRow))));
      break;
      }
    case "friends":
      {
      const friends = data.mutualFriendUsers;
      if (friends?.length) {
        const row = (friend: ProfileFriend) => h("li", { class: "pf-item" }, h("button", { class: "pf-navigation", attrs: { type: "button", "aria-label": `Open profile for ${friend.name}` }, on: { click: () => actions.openFriend?.(friend) } },
          friend.avatar ? h("img", { class: "pf-icon", attrs: { src: friend.avatar, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : h("span", { class: "pf-icon pf-initial", text: initial(friend.name) }),
          h("span", { class: "pf-item-text" }, h("span", { class: "pf-item-name", text: friend.name }), h("span", { class: "pf-item-sub", text: friend.knownServers.length ? `Known in: ${friend.knownServers.join(", ")}` : "Shared-server membership not loaded" }))));
        block.append(h("ul", { class: "pf-list" }, ...friends.slice(0, LIST_LIMIT).map(row)));
        if (friends.length > LIST_LIMIT) block.append(h("details", { class: "pf-report-details" }, h("summary", { text: `Show ${friends.length - LIST_LIMIT} more mutual friends` }), h("ul", { class: "pf-list" }, ...friends.slice(LIST_LIMIT).map(row))));
      } else block.append(h("ul", { class: "pf-list compact" }, ...section.names.map((name) => h("li", { class: "pf-item", text: name }))));
      break;
      }
    case "connections":
      block.append(
        h(
          "ul",
          { class: "pf-list compact" },
          ...section.connections.map((c) =>
            h(
              "li",
              { class: "pf-item" },
              h("span", { class: "pf-item-text" }, connectionUrl(c) ? h("a", { class: "pf-item-name",attrs:{href:connectionUrl(c)!,target:"_blank",rel:"noopener noreferrer"}, text: c.name }) : h("span", { class: "pf-item-name", text: c.name }), h("span", { class: "pf-item-sub", text: CONNECTION_NAMES[c.type] ?? c.type })),
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
  if (typeof user === "string" && /^\d{14,20}$/.test(user)) user = stores.users?.getUser?.(user) ?? {id:user,username:"User"};
  if (!user?.id) return;
  // A popout can omit guildId even when opened from a server message.
  if (!guildId) {
    const selected = safely(() => stores.selectedChannel?.getChannelId?.());
    const context = selected ? safely(() => {const channel=stores.channels?.getChannel?.(selected);return channel?.guild_id??channel?.guildId??channel?.getGuildId?.();}) : null;
    if (context) guildId = context;
  }
  let data = gatherProfile(user, guildId);
  let sheet: HTMLElement | undefined;
  let open = true;
  const oathnet = oathnetSection(user.id);
  const journal = profileJournal(data);
  const counts = h("section", { class: "pf-block wide", attrs: { "aria-label": "Loaded-message counts" } });
  counts.hidden = true;
  const actions: ProfileActions = {
    close: () => closeDialog(),
    copyId: () => copyText(user.id),
    openServer: id => {
      if (!stores.guilds?.getGuild?.(id)) { showDialog({ title: "Server unavailable", body: "This server is not available in the current account. XRay cannot open a server you do not have access to.", code: id }); return; }
      closeDialog(); navigate(`/channels/${id}`);
    },
    openFriend: friend => showProfile(stores.users?.getUser?.(friend.id) ?? { id: friend.id, username: friend.name, getAvatarURL: () => friend.avatar }, guildId),
    message: user.bot ? undefined : () => {
      closeDialog();
      privateChannelActions()?.openPrivateChannel?.(user.id);
    },
  };
  const draw = () => {
    const active = (sheet?.getRootNode() as ShadowRoot | undefined)?.activeElement;
    const keepFocus = active instanceof HTMLElement && journal.element.contains(active) ? active : null;
    const next = renderProfile(data, actions);
    journal.update(data);
    next.querySelector(".pf-body")?.prepend(journal.element,oathnet.element);
    if (data.mutualServers.state === "ready" && data.mutualServers.value.length) {
      const select = h("select",{class:"dialog-input",attrs:{"aria-label":"Profile server context"}},h("option",{attrs:{value:""},text:"Choose a shared server"}),...data.mutualServers.value.map(server=>h("option",{attrs:{value:server.id},text:server.name})));
      select.value=guildId ?? "";
      select.addEventListener("change",()=>{if(select.value) showProfile(user,select.value);});
      next.querySelector(".pf-body")?.prepend(h("section",{class:"pf-block wide pf-server-context"},h("span",{class:"pf-title",text:"Server context"}),select,h("span",{class:"pf-note",text:"Join dates, roles and nicknames belong to this server."})));
    }
    next.querySelector(".pf-body")?.append(counts);
    const countButton = h("button", { class:"btn ghost", attrs:{type:"button"},text:"Browse available messages",on:{click:()=>{counts.hidden=false;try{counts.replaceChildren(availableMessages(data.id));}catch{counts.replaceChildren(h("p",{class:"pf-note",text:"Message stores are unavailable. Open a conversation and try again."}));}counts.scrollIntoView({block:"nearest"});}}});
    const linkedReports=reportsFor(data.id);
    if(linkedReports.length){const section=h("section",{class:"pf-block wide"},h("h3",{class:"pf-title",text:"Saved results matching this profile query"}),h("p",{class:"pf-note",text:"Associated by the supplied/query subject ID. Provider matches are not independently verified identities."}));for(const report of linkedReports)section.append(renderImportedReport(report,data.id,data.avatar));next.querySelector(".pf-body")?.append(section);}
    next.querySelector(".pf-foot .pf-spacer")?.after(countButton);
    const reportButton = h("button", { class: "btn ghost", attrs: { type: "button" }, text: "Oathnet report", on: { click: () => {
      oathnet.element.scrollIntoView({ block: "start" });
      oathnet.element.querySelector<HTMLButtonElement>("button")?.focus();
    } } });
    next.querySelector(".pf-foot .pf-spacer")?.after(reportButton);
    if (sheet) sheet.replaceWith(next);
    sheet = next;
    if (keepFocus) keepFocus.focus({preventScroll:true});
  };
  draw();
  let stopMembers = () => {};
  let stopLogout = () => {};
  showSheet(sheet!, () => { open = false; oathnet.close(); journal.close(); stopMembers(); stopLogout(); });
  stopLogout = onAction("LOGOUT",closeDialog);
  sheet!.querySelector<HTMLButtonElement>(".pf-close")?.focus();
  if (guildId) stopMembers = onStoresChanged([stores.members],()=>{
    if (!open) return;
    const member = safely(()=>stores.members?.getMember?.(guildId,user.id));
    const next = mergeProfileMember(data,member);
    if (next.joinedServerAt?.getTime() !== data.joinedServerAt?.getTime() || next.boostingSince?.getTime() !== data.boostingSince?.getTime() || next.serverNickname !== data.serverNickname) { data={...data,...next}; draw(); }
  });

  const client = http();
  if (!client?.get) {
    data = markFailed(data);
    draw();
    return;
  }
  // One explicit member read for the selected server fills dates missing in the cache.
  if (guildId) void Promise.resolve().then(()=>client.get({url:`/guilds/${guildId}/members/${user.id}`})).then((response:any)=>{
    if (!open) return;
    if(response?.status>=400 || !response?.body || !hasAny(response.body,["joined_at","joinedAt","nick","premium_since"]))throw Error("Discord did not return readable member details for this server");
    data={...data,...mergeProfileMember(data,{...response?.body,guild_id:response?.body?.guild_id ?? guildId})}; draw();
  }).catch(()=>{if(open){data={...data,memberState:"failed",memberError:"Discord could not load member details in this server"};draw();}});
  Promise.resolve().then(()=>client.get({ url: `/users/${user.id}/profile`, query: { with_mutual_guilds: true, with_mutual_friends: true, ...(guildId ? { guild_id: guildId } : {}) } }))
    .then((response: any) => { if (!open) return;if(response?.status>=400 || !response?.body)throw Error("Discord profile request failed"); data = mergeProfile(data, response?.body); observeProfileResponse(user.id,response?.body); })
    .catch((err: unknown) => {
      warn("couldn't load a profile", err);
      data = markFailed(data);
      data.profileError="Discord could not load the profile";
    })
    .finally(() => {
      if (!open) return;
      // Redrawing replaces the buttons, so keep keyboard focus inside the sheet.
      const root = sheet?.getRootNode() as Document | ShadowRoot | undefined;
      const focused = root?.activeElement;
      const hadFocus = !!root && !!sheet?.contains(focused ?? null);
      draw();
      if (hadFocus) (focused instanceof HTMLElement && sheet!.contains(focused) ? focused : sheet!.querySelector<HTMLButtonElement>(".pf-close"))?.focus({preventScroll:true});
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
function hasAny(value:any,keys:string[]):boolean{return !!value && typeof value==="object" && keys.some(key=>Object.hasOwn(value,key));}
function missingProfileField(data:ProfileData,key:"legacyUsername"|"premiumSince",empty:string):string {
  if(data.profileFields?.[key])return empty;
  return data.profileState==="loading"?"Loading from Discord…":data.profileState==="failed"?data.profileError??"Profile request failed · reopen to retry":"Not returned by Discord";
}
function missingMemberField(data:ProfileData,key:"joined"|"boosting"|"nickname",empty:string):string {
  if(!data.guildId&&!data.serverName)return "Choose a shared server above";
  if(data.memberFields?.[key])return empty;
  return data.memberState==="loading"?"Loading member details…":data.memberState==="failed"?data.memberError??"Member request failed · reopen to retry":"Not returned for this server";
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOrNull(value: unknown): Date | null {
  return discordDate(value);
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

function validCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function relationshipLabel(id: string): string | null {
  if (id === safely(() => stores.users?.getCurrentUser?.()?.id)) return "You";
  if (safely(() => stores.relationships?.isIgnored?.(id))) return "Ignored";
  const type = safely(() => stores.relationships?.getRelationshipType?.(id));
  return ({ 0: "No relationship", 1: "Friend", 2: "Blocked", 3: "Incoming friend request", 4: "Outgoing friend request" } as Record<number, string>)[type as number] ?? null;
}

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
