/**
 * Small fixes to Discord's everyday behaviour: calmer typing dots, a
 * character counter, no nagging badge counts, no "leaving Discord" warning
 * on links, and quieter notification sounds.
 */
import { stores, whenStore } from "../discord";
import { definePlugin, type Plugin, type PluginContext } from "./types";

/** Patches a store once it exists, unless the plugin stopped first. */
function patchStore(ctx: PluginContext<any>, name: string, patchIt: (store: any) => void): void {
  let stopped = false;
  ctx.onStop(() => {
    stopped = true;
  });
  whenStore(name, (store) => {
    if (!stopped) patchIt(store);
  });
}

/** Tells a store's listeners to read it again, so a patched count shows at once. */
function refresh(store: any): void {
  try {
    store?.emitChange?.();
  } catch {
    // the next real change will refresh it
  }
}

const noTypingAnimation = definePlugin({
  id: "noTypingAnimation",
  name: "Still Typing Dots",
  description: "The “is typing” dots stop bouncing. Still there, just calm, and one less thing redrawing on a high-refresh screen.",
  category: "Appearance",
  impact: "light",
  impactReason: "One CSS rule; saves work",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`[class*="dots_"] > [class*="dot_"] { animation: none !important; opacity: .75 !important; scale: 1 !important; }`);
  },
});

const characterCounter = definePlugin({
  id: "characterCounter",
  name: "Character Counter",
  description: "Shows how many characters you've typed, and how many you have left, above the message box.",
  category: "Chat",
  impact: "light",
  impactReason: "Counts as you type",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.css(`
      [data-xray-count] { position: relative; }
      [data-xray-count]::before {
        content: attr(data-xray-count); position: absolute; right: 18px; top: -18px; z-index: 1; pointer-events: none;
        font: 500 10.5px "Cascadia Mono", Consolas, monospace; letter-spacing: .04em; color: var(--text-muted);
      }
      [data-xray-count-over]::before { color: #ff7a66; }
    `);
    const limit = () => (stores.users?.getCurrentUser?.()?.premiumType === 2 ? 4000 : 2000);
    const count = (event: Event) => {
      const editor = event.target instanceof Element ? event.target.closest('[role="textbox"]') : null;
      const box = editor?.closest('[class*="channelTextArea_"]');
      if (!box || !editor) return;
      const length = (editor.textContent ?? "").replace(/﻿/g, "").length;
      const max = limit();
      if (length === 0) box.removeAttribute("data-xray-count");
      else box.setAttribute("data-xray-count", `${length.toLocaleString()} / ${max.toLocaleString()}`);
      box.toggleAttribute("data-xray-count-over", length > max);
    };
    window.addEventListener("input", count, true);
    ctx.onStop(() => {
      window.removeEventListener("input", count, true);
      document.querySelectorAll("[data-xray-count]").forEach((box) => {
        box.removeAttribute("data-xray-count");
        box.removeAttribute("data-xray-count-over");
      });
    });
  },
});

const noPendingCount = definePlugin({
  id: "noPendingCount",
  name: "No Pending Counts",
  description: "Drops the red counts for incoming friend requests and message requests. The requests themselves are still there.",
  category: "Appearance",
  impact: "light",
  impactReason: "Changes what two counts read",
  needsReload: false,
  enabledByDefault: false,
  options: {
    friends: { type: "boolean", label: "Friend requests", default: true },
    messages: { type: "boolean", label: "Message requests", default: true },
  },
  start(ctx) {
    if (ctx.options.friends) {
      patchStore(ctx, "RelationshipStore", (store) => {
        ctx.patch(store, "getPendingCount", { instead: () => 0 });
        ctx.onStop(() => refresh(store));
        refresh(store);
      });
    }
    if (ctx.options.messages) {
      patchStore(ctx, "MessageRequestStore", (store) => {
        ctx.patch(store, "getMessageRequestsCount", { instead: () => 0 });
        ctx.onStop(() => refresh(store));
        refresh(store);
      });
    }
  },
});

const alwaysTrust = definePlugin({
  id: "alwaysTrust",
  name: "Always Trust Links",
  description: "Links open straight away, without Discord's “You are leaving Discord” warning.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs when you click a link",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    patchStore(ctx, "MaskedLinkStore", (store) => {
      ctx.patch(store, "isTrustedDomain", { instead: () => true });
      ctx.patch(store, "isTrustedProtocol", { instead: () => true });
    });
  },
});

/** Discord's own sound effects are short files under /assets; calls and soundboard sounds aren't. */
const SOUND = /\/assets\/[^?#]+\.(mp3|ogg|wav)(\?|#|$)/;

const notificationVolume = definePlugin({
  id: "notificationVolume",
  name: "Notification Volume",
  description: "Sets the volume of Discord's own sounds (message pings, join and leave chimes) on their own, without touching voice.",
  category: "Notifications",
  impact: "light",
  impactReason: "Only runs when Discord plays a sound",
  needsReload: false,
  enabledByDefault: false,
  options: {
    volume: { type: "number", label: "Volume (%)", default: 50, min: 0, max: 100 },
  },
  start(ctx) {
    const scale = ctx.options.volume / 100;
    const base = new WeakMap<HTMLMediaElement, number>();
    ctx.patch(HTMLMediaElement.prototype, "play", {
      before(media: HTMLMediaElement) {
        const src = media.currentSrc || media.src;
        if (!src || !SOUND.test(src) || media instanceof HTMLVideoElement) return;
        // Discord sets its own volume per sound; scale that, once per element.
        if (!base.has(media)) base.set(media, media.volume);
        media.volume = Math.min(1, base.get(media)! * scale);
      },
    });
  },
});

export const polishPlugins: readonly Plugin<any>[] = [noTypingAnimation, characterCounter, noPendingCount, alwaysTrust, notificationVolume];
