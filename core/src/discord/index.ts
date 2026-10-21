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
};

export function messageActions(): any {
  return lookup("message actions", () => find(hasRealMethod("sendMessage", "editMessage", "deleteMessage")));
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
