/**
 * Right-click helpers for people and things: when you became friends, a
 * friend's local time (from a timezone you note yourself), and Copy ID
 * without Developer Mode.
 */
import { aboutElement, menu, type MenuTarget } from "../api/menus";
import { http, stores } from "../discord";
import { pluginState, save } from "../settings";
import { copyText, promptText, showDialog } from "../ui/dialog";
import { icon } from "../ui/icons";
import { showProfile } from "../ui/profile";
import { definePlugin, type Plugin } from "./types";

const FRIEND = 1;
const DETAILS_ICON = icon("idCard", 18, 2);

/** Only a compact row of profile actions; activity cards also have More buttons. */
function profileActionRow(existing: Element): Element | null {
  const action = (branch: Element): Element | null => {
    let node = branch;
    for (let depth = 0; depth < 4; depth++) {
      if (node.matches('button, [role="button"]')) return node;
      if (node.children.length !== 1) return null;
      node = node.children[0];
    }
    return null;
  };
  for (let row = existing.parentElement, depth = 0; row && depth < 4; row = row.parentElement, depth++) {
    const branches = [...row.children].filter(child => !child.classList.contains("xray-details"));
    const actions = branches.map(action);
    if (actions.length < 2 || actions.length > 8 || actions.some(value => !value)) continue;
    // Positive identification prevents climbing to a collection of activity cards.
    if (actions.some(value => /^(?:message|send (?:a )?message|add friend|friends?|call|voice call|video call|wave)$/i.test((value!.getAttribute("aria-label") ?? value!.textContent ?? "").trim()))) return row;
  }
  return null;
}

const accountDetails = definePlugin({
  id: "accountDetails",
  name: "Profile Details",
  description: "A fuller profile for anyone: banner, bio, status, roles, join dates, mutual servers and friends, and connections. Right-click someone, or press Details on their profile.",
  category: "Friends",
  impact: "light",
  impactReason: "Only runs when you open it",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("user-context", (items, { user, guildId }) => {
      if (!user) return;
      items.push(menu.item({ id: "account-details", label: "Open profile report", action: () => showProfile(user, guildId) }));
    });
    // A Details button beside Add Friend and More on Discord's profile popout and full profile.
    if (typeof ctx.watch !== "function") return;
    ctx.css(`.xray-details { position:relative!important; inset:auto!important; transform:none!important; display:inline-flex!important; align-items:center!important; justify-content:center!important; align-self:center!important; flex:0 0 auto!important; box-sizing:border-box!important; width:var(--xray-profile-action-width)!important; min-width:var(--xray-profile-action-width)!important; height:var(--xray-profile-action-height)!important; margin:0!important; padding:0!important; line-height:1!important; cursor:pointer; }
      .xray-details > svg { display:block; flex:none; width:18px; height:18px; }
      .xray-details:focus-visible { outline:2px solid var(--text-normal); outline-offset:2px; }`);
    ctx.watch('[class*="bannerButton_"], button[aria-label="More"], [role="button"][aria-label="More"]', (existing) => {
      if (existing.closest(".xray-details")) return;
      const row = profileActionRow(existing);
      if (!row || row.querySelector(".xray-details")) return;
      const { user, guildId } = aboutElement(row);
      if (!user) return;
      const button = document.createElement("button");
      button.type = "button";
      // Discord's own class, so it looks and sizes like its neighbours.
      button.className = `${existing.className} xray-details`;
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", "0");
      button.setAttribute("aria-label", "Open profile report");
      button.title = "Open profile report";
      button.innerHTML = DETAILS_ICON;
      const bounds = existing.getBoundingClientRect();
      const size = (value: number) => `${value >= 24 && value <= 48 ? value : 32}px`;
      button.style.setProperty("--xray-profile-action-width", size(bounds.width));
      button.style.setProperty("--xray-profile-action-height", size(bounds.height));
      const open = (event: Event) => {
        event.stopPropagation();
        // Close Discord's popout first (it closes on Escape), so the sheet isn't stacked on it.
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
        showProfile(user, guildId);
      };
      button.addEventListener("click", open);
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(event);
        }
      });
      // Insert at the action-row level, just before More (including its tooltip wrapper).
      let before: Element = row.querySelector('[aria-label*="More"]') ?? existing;
      while (before.parentElement && before.parentElement !== row) before = before.parentElement;
      row.insertBefore(button, before);
    });
    ctx.onStop(() => document.querySelectorAll(".xray-details").forEach(el => el.remove()));
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
