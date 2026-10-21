/**
 * Right-click helpers for people and things: when you became friends, a
 * friend's local time (from a timezone you note yourself), and Copy ID
 * without Developer Mode.
 */
import { menu, type MenuTarget } from "../api/menus";
import { stores } from "../discord";
import { pluginState, save } from "../settings";
import { copyText, promptText, showDialog } from "../ui/dialog";
import { definePlugin, type Plugin } from "./types";

const FRIEND = 1;

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

export const peoplePlugins: readonly Plugin<any>[] = [quickCopy, friendsSincePlugin, timezones];
