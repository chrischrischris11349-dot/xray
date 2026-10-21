/**
 * Discord's own stores and actions, found lazily and cached. Everything xray's
 * UI shows comes from the stores Discord's UI reads, and everything it does
 * goes through the actions Discord's UI calls, so xray never talks to
 * Discord's servers on its own.
 *
 * Found in Discord's code (October 2026): stores by their registered names,
 * the message actions object (`sendMessage`, `editMessage`, `deleteMessage`),
 * the DM actions (`openPrivateChannel`), and the router function that logs
 * "transitionTo - Transitioning to".
 */
import { warn } from "../env";
import { type Filter, filters, find, findByCode, waitFor } from "../webpack";

const found = new Map<string, unknown>();
const warned = new Set<string>();

/**
 * Finds something once and remembers it. A miss is retried next time, since
 * stores load as Discord starts up. Only actions warn on a miss; a store
 * that isn't there yet is normal early on.
 */
function lookup<T>(key: string, search: () => T | undefined, warnOnMiss = true): T | undefined {
  if (found.has(key)) return found.get(key) as T;
  const value = search();
  if (value !== undefined) found.set(key, value);
  else if (warnOnMiss && !warned.has(key)) {
    warned.add(key);
    warn(`Discord's ${key} wasn't found`);
  }
  return value;
}

/**
 * Some of Discord's exports are lazy proxies that invent a function for any
 * property read, so a real action object is checked by its method's source.
 */
function hasRealMethod(method: string, ...others: string[]): Filter {
  return (c) =>
    typeof c === "object" &&
    c !== null &&
    method in c &&
    others.every((name) => name in c) &&
    String(c[method]).includes(`${method}(`);
}

const store = (name: string) => lookup<any>(name, () => find(filters.byStoreName(name)), false);

/** Calls `then` with a store as soon as it exists (right away if it already does). */
export function whenStore(name: string, then: (store: any) => void): void {
  const existing = store(name);
  if (existing) then(existing);
  else waitFor(filters.byStoreName(name), then);
}

export const stores = {
  get users() { return store("UserStore"); },
  get channels() { return store("ChannelStore"); },
  get guilds() { return store("GuildStore"); },
  get guildChannels() { return store("GuildChannelStore"); },
  get privateChannelSort() { return store("PrivateChannelSortStore"); },
  get readStates() { return store("ReadStateStore"); },
  get messages() { return store("MessageStore"); },
  get relationships() { return store("RelationshipStore"); },
  get presences() { return store("PresenceStore"); },
  get selectedChannel() { return store("SelectedChannelStore"); },
  get selectedGuild() { return store("SelectedGuildStore"); },
  get voiceStates() { return store("VoiceStateStore"); },
  get members() { return store("GuildMemberStore"); },
  get memberCounts() { return store("GuildMemberCountStore"); },
  get profiles() { return store("UserProfileStore"); },
  get typing() { return store("TypingStore"); },
  get roles() { return store("GuildRoleStore"); },
  get streamerMode() { return store("StreamerModeStore"); },
  get permissions() { return store("PermissionStore"); },
  get mediaEngine() { return store("MediaEngineStore"); },
};

/** Discord's own mute / deafen / camera actions, as its own voice buttons call them. */
export function audioActions(): any {
  return lookup("audio actions", () =>
    find(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        "toggleSelfMute" in c &&
        "toggleSelfDeaf" in c &&
        "setVideoEnabled" in c &&
        String(c.toggleSelfMute).includes("toggleSelfMute"),
    ),
  );
}

/** Discord's own voice actions: `selectVoiceChannel` joins a channel, as clicking it does. */
export function voiceActions(): any {
  return lookup("voice actions", () =>
    find((c) => typeof c === "object" && c !== null && "selectVoiceChannel" in c && "disconnect" in c && String(c.selectVoiceChannel).includes("selectVoiceChannel(")),
  );
}

/** Your account's id, once you're logged in. */
export function myId(): string | undefined {
  try {
    return stores.users?.getCurrentUser?.()?.id;
  } catch {
    return undefined;
  }
}

/** The channel you're looking at, if any. */
export function currentChannelId(): string | undefined {
  try {
    return stores.selectedChannel?.getChannelId?.() ?? undefined;
  } catch {
    return undefined;
  }
}

/** The name people see for a user: their server nickname when there's a server, else their display name. */
export function displayName(userId: string, guildId?: string | null): string {
  try {
    const nick = guildId ? stores.members?.getNick?.(guildId, userId) : null;
    if (nick) return nick;
    const user = stores.users?.getUser?.(userId);
    return user?.globalName || user?.username || "Someone";
  } catch {
    return "Someone";
  }
}

/** When a Discord id (a "snowflake") was created: its top bits are milliseconds since 2015. */
export function snowflakeDate(id: string): Date {
  return new Date(Number(BigInt(id) >> 22n) + 1420070400000);
}

/** A link that opens a message in Discord. */
export function messageLink(guildId: string | null | undefined, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId ?? "@me"}/${channelId}/${messageId}`;
}

export function messageActions(): any {
  return lookup("message actions", () => find(hasRealMethod("sendMessage", "editMessage", "deleteMessage")));
}

/**
 * Discord's own HTTP client: `get/post/put/patch/del({ url, body })`, with
 * paths like "/channels/1/messages/2". It adds your login and handles rate
 * limits, exactly as for Discord's own requests.
 */
export function http(): any {
  return lookup("HTTP client", () => find(filters.byOwnMethods("get", "post", "put", "patch", "del")));
}

export function privateChannelActions(): any {
  return lookup("DM actions", () => find(hasRealMethod("openPrivateChannel", "closePrivateChannel")));
}

/** Discord's router. Searching module source is slow, so it's done once, on first use. */
function router(): ((path: string) => void) | undefined {
  return lookup("router", () => {
    const needle = "transitionTo - Transitioning to";
    const exports = findByCode(needle);
    if (!exports || typeof exports !== "object") return undefined;
    for (const key of Object.keys(exports)) {
      let value: unknown;
      try {
        value = exports[key];
      } catch {
        continue;
      }
      if (typeof value === "function" && String(value).includes(needle)) return value as (path: string) => void;
    }
    return undefined;
  });
}

/** Moves Discord to a page, the way clicking a channel does. */
export function navigate(path: string): boolean {
  const go = router();
  if (!go) return false;
  go(path);
  return true;
}

/** True once you're logged in and Discord's stores have your account. */
export function loggedIn(): boolean {
  try {
    return !!stores.users?.getCurrentUser?.();
  } catch {
    return false;
  }
}

/** Only Discord's own CDNs are allowed as image sources in xray's UI. */
export function safeImage(url: unknown): string | null {
  if (typeof url !== "string") return null;
  return /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(url) ? url : null;
}

export interface UserView {
  id: string;
  name: string;
  avatar: string | null;
}

export function userView(id: string): UserView | null {
  const user = stores.users?.getUser?.(id);
  if (!user) return null;
  let avatar: string | null = null;
  try {
    avatar = safeImage(user.getAvatarURL?.(undefined, 64));
  } catch {
    // no avatar: the UI shows an initial instead
  }
  return { id, name: user.globalName || user.username || "Unknown", avatar };
}

/** Calls `listener` whenever one of these stores changes. Returns a function that stops it. */
export function onStoresChanged(storeList: unknown[], listener: () => void): () => void {
  const subscribed = storeList.filter((s): s is { addChangeListener: Function; removeChangeListener: Function } =>
    typeof (s as any)?.addChangeListener === "function",
  );
  subscribed.forEach((s) => s.addChangeListener(listener));
  return () => subscribed.forEach((s) => s.removeChangeListener(listener));
}
