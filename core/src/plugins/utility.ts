/**
 * Everyday helpers: keys, remembering where you were, idle control, and the
 * small privacy switches (tracking, how your device shows up).
 */
import { dispatch } from "../api/flux";
import { GatewayOp } from "../api/gateway";
import { menu } from "../api/menus";
import { currentChannelId, navigate, stores } from "../discord";
import { storage } from "../env";
import { copyText } from "../ui/dialog";
import { definePlugin, type Plugin } from "./types";

const noF1 = definePlugin({
  id: "noF1",
  name: "No F1 Help",
  description: "F1 no longer opens Discord's help site.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs on F1",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.onKey((event) => event.key === "F1" && !event.ctrlKey && !event.altKey && !event.shiftKey);
  },
});

const LAST_CHANNEL_KEY = "xray.lastChannel";

const keepChannel = definePlugin({
  id: "keepCurrentChannel",
  name: "Reopen Last Channel",
  description: "xray opens on the channel you were in last time, not the friends page.",
  category: "Utility",
  impact: "light",
  impactReason: "Saves one value when you switch channels",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    let restored = false;
    ctx.onAction("CHANNEL_SELECT", ({ guildId, channelId }) => {
      if (!channelId || !restored) return;
      try {
        storage?.setItem(LAST_CHANNEL_KEY, JSON.stringify({ guildId: guildId ?? null, channelId }));
      } catch {
        // storage full or blocked: nothing to restore next time
      }
    });
    const restore = () => {
      if (restored) return;
      restored = true;
      // Only when Discord opened on its default page; never pull you away from somewhere you chose.
      if (!/^\/(app|channels\/@me)\/?$/.test(location.pathname)) return;
      let saved: { guildId: string | null; channelId: string } | null = null;
      try {
        saved = JSON.parse(storage?.getItem(LAST_CHANNEL_KEY) ?? "null");
      } catch {
        return;
      }
      if (!saved?.channelId || !stores.channels?.getChannel?.(saved.channelId)) return;
      navigate(`/channels/${saved.guildId ?? "@me"}/${saved.channelId}`);
    };
    ctx.onAction("CONNECTION_OPEN", () => window.setTimeout(restore, 300));
    // Already connected (the plugin was switched on later): nothing to restore.
    if (stores.users?.getCurrentUser?.()) restored = true;
  },
});

const dmSwitcher = definePlugin({
  id: "recentDmSwitcher",
  name: "Recent DM Switcher",
  description: "Ctrl+Tab flips between your most recent DMs, like Alt+Tab; Ctrl+Shift+Tab goes back.",
  category: "Utility",
  impact: "light",
  impactReason: "Remembers the last few DMs you opened",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const recent: string[] = [];
    let snapshot: string[] | null = null;
    let index = 0;
    ctx.onAction("CHANNEL_SELECT", ({ channelId, guildId }) => {
      if (!channelId || guildId || snapshot) return;
      const i = recent.indexOf(channelId);
      if (i !== -1) recent.splice(i, 1);
      recent.unshift(channelId);
      recent.length = Math.min(recent.length, 20);
    });
    ctx.onKey((event) => {
      if (event.key !== "Tab" || !event.ctrlKey || event.altKey || event.metaKey) return false;
      if (!snapshot) {
        const here = currentChannelId();
        snapshot = recent.filter((id) => stores.channels?.getChannel?.(id));
        // Start from the DM you're in, so the first press goes to the one before it.
        index = here && snapshot[0] === here ? 0 : -1;
      }
      if (snapshot.length < (index === -1 ? 1 : 2)) return true;
      index = (index + (event.shiftKey ? -1 : 1) + snapshot.length) % snapshot.length;
      navigate(`/channels/@me/${snapshot[index]}`);
      return true;
    });
    const release = (event: KeyboardEvent) => {
      if (event.key !== "Control" || !snapshot) return;
      const landed = snapshot[index];
      snapshot = null;
      if (landed) {
        const i = recent.indexOf(landed);
        if (i !== -1) recent.splice(i, 1);
        recent.unshift(landed);
      }
    };
    window.addEventListener("keyup", release, true);
    ctx.onStop(() => window.removeEventListener("keyup", release, true));
  },
});

const customIdle = definePlugin({
  id: "customIdle",
  name: "Idle Timer",
  description: "Choose how long before you show as Idle, or never go idle on your own.",
  category: "Utility",
  impact: "light",
  impactReason: "One check every 30 seconds",
  needsReload: false,
  enabledByDefault: false,
  options: {
    minutes: { type: "number", label: "Minutes before Idle", description: "0 means never.", default: 0, min: 0, max: 600 },
  },
  start(ctx) {
    const minutes = ctx.options.minutes;
    let lastActive = Date.now();
    let idle = false;
    const active = () => {
      lastActive = Date.now();
      if (!idle) return;
      idle = false;
      void dispatch({ type: "IDLE", idle: false, xray: true }).catch(() => {});
    };
    for (const type of ["mousemove", "mousedown", "keydown", "wheel"] as const) {
      window.addEventListener(type, active, { capture: true, passive: true });
      ctx.onStop(() => window.removeEventListener(type, active, true));
    }
    // Discord's own idle switch is dropped; xray's timer decides instead.
    ctx.intercept((action) => action.type === "IDLE" && action.idle === true && !action.xray);
    if (minutes > 0) {
      ctx.every(30_000, () => {
        if (idle || Date.now() - lastActive < minutes * 60_000) return;
        idle = true;
        void dispatch({ type: "IDLE", idle: true, idleSince: lastActive, xray: true }).catch(() => {});
      });
    }
  },
});

const blockTracking = definePlugin({
  id: "blockTracking",
  name: "Block Tracking",
  description: "Discord's analytics and usage reports leave empty. Nothing else changes.",
  category: "Privacy",
  impact: "light",
  impactReason: "Only touches analytics requests",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.onApiRequest(["POST"], /^\/(science|metrics(\/v\d+)?|track)$/, ({ body }) => {
      if (!body || typeof body !== "object") return;
      for (const key of ["events", "metrics"]) if (Array.isArray(body[key])) body[key] = [];
    });
  },
});

const PLATFORMS: Record<string, { os: string; browser: string; device: string }> = {
  desktop: { os: "Windows", browser: "Discord Client", device: "" },
  mobile: { os: "Android", browser: "Discord Android", device: "Android" },
  ios: { os: "iOS", browser: "Discord iOS", device: "iPhone" },
  web: { os: "Windows", browser: "Chrome", device: "" },
};

const platformSpoofer = definePlugin({
  id: "platformSpoofer",
  name: "Device Badge",
  description: "Choose which device icon others see next to your status: desktop, phone or web.",
  category: "Privacy",
  impact: "light",
  impactReason: "Changes one value when Discord connects",
  needsReload: true,
  enabledByDefault: false,
  options: {
    platform: {
      type: "select",
      label: "Show me as",
      default: "desktop",
      choices: [
        { value: "desktop", label: "Desktop app" },
        { value: "mobile", label: "Phone (Android)" },
        { value: "ios", label: "Phone (iPhone)" },
        { value: "web", label: "Web browser" },
      ],
    },
  },
  start(ctx) {
    const platform = PLATFORMS[ctx.options.platform] ?? PLATFORMS.desktop;
    ctx.onGatewaySend(GatewayOp.IDENTIFY, (d) => {
      if (d?.properties && typeof d.properties === "object") Object.assign(d.properties, platform);
    });
  },
});

const consoleJanitor = definePlugin({
  id: "consoleJanitor",
  name: "Quiet Console",
  description: "Hides Discord's noisy log lines in the developer console. Errors still show.",
  category: "Developer",
  impact: "light",
  impactReason: "Runs only when Discord logs something",
  needsReload: false,
  enabledByDefault: true,
  options: {
    keepWarnings: { type: "boolean", label: "Keep warnings", default: true },
  },
  start(ctx) {
    const methods = ctx.options.keepWarnings ? ["log", "info", "debug"] : ["log", "info", "debug", "warn"];
    for (const method of methods) {
      ctx.patch(console, method, {
        instead(_self, args, original) {
          // xray's own lines start with its badge.
          if (typeof args[0] === "string" && args[0].startsWith("%cxray")) return original(...args);
        },
      });
    }
  },
});

const userLinks = definePlugin({
  id: "userLinks",
  name: "Copy User Links",
  description: "Right-click someone to copy their profile link or a mention, or open their avatar full size.",
  category: "Friends",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("user-context", (items, { user, guildId }) => {
      if (!user) return;
      let avatar: string | null = null;
      try {
        avatar = user.getAvatarURL?.(guildId, 4096, true) ?? null;
      } catch {
        avatar = null;
      }
      items.push(
        menu.group(
          menu.item({ id: "copy-profile-link", label: "Copy profile link", action: () => copyText(`https://discord.com/users/${user.id}`) }),
          menu.item({ id: "copy-mention", label: "Copy mention", action: () => copyText(`<@${user.id}>`) }),
          avatar ? menu.item({ id: "open-avatar", label: "Open avatar", action: () => window.open(avatar!, "_blank") }) : null,
        ),
      );
    });
  },
});

const LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A neutral name for an uploaded file: random or a timestamp, keeping the extension and Discord's SPOILER_ prefix. */
export function anonymousName(original: string, style: string, index: number, now = new Date()): string {
  const spoiler = original.startsWith("SPOILER_") ? "SPOILER_" : "";
  const dot = original.lastIndexOf(".");
  const ext = dot > spoiler.length && /^\.[a-z0-9]{1,8}$/i.test(original.slice(dot)) ? original.slice(dot).toLowerCase() : "";
  let base: string;
  if (style === "date") {
    const pad = (n: number) => String(n).padStart(2, "0");
    base = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    if (index) base += `_${index + 1}`;
  } else {
    base = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => LETTERS[b % LETTERS.length]).join("");
  }
  return spoiler + base + ext;
}

const anonymousUploads = definePlugin({
  id: "anonymousUploads",
  name: "Anonymous Uploads",
  description: "Files you send go out under a neutral name instead of the one on your disk. The extension stays, so previews still work.",
  category: "Privacy",
  impact: "light",
  impactReason: "Only runs when you send a file",
  needsReload: false,
  enabledByDefault: false,
  options: {
    style: {
      type: "select",
      label: "Name files",
      default: "random",
      choices: [
        { value: "random", label: "Random letters" },
        { value: "date", label: "Date and time" },
      ],
    },
  },
  start(ctx) {
    const style = ctx.options.style;
    // The name people see is each attachment's `filename` in the message you send.
    ctx.onApiRequest(["POST"], /^\/channels\/\d+\/messages$/, ({ body }) => {
      if (!Array.isArray(body?.attachments)) return;
      body.attachments.forEach((attachment: any, index: number) => {
        if (typeof attachment?.filename === "string") attachment.filename = anonymousName(attachment.filename, style, index);
      });
    });
  },
});

export const utilityPlugins: readonly Plugin<any>[] = [
  blockTracking,
  keepChannel,
  dmSwitcher,
  noF1,
  customIdle,
  platformSpoofer,
  userLinks,
  consoleJanitor,
  anonymousUploads,
];
