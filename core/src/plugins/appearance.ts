/**
 * Plugins that change what you see: less clutter, blurred NSFW media, no
 * blocked messages, file names on images, a call timer, keyboard sounds.
 */
import { menu } from "../api/menus";
import { currentChannelId, myId, stores } from "../discord";
import { h } from "../ui/dom";
import { uiRoot } from "../ui/root";
import { definePlugin, type Plugin } from "./types";

/** Hides an element or the list item that holds it. */
const hide = (selectors: string[]) => (selectors.length ? `${selectors.join(",\n")} { display: none !important; }` : "");

const declutter = definePlugin({
  id: "declutter",
  name: "Declutter",
  description: "Hides Discord's shop, Nitro and Quests tabs, the gift button and other things you never click.",
  category: "Appearance",
  impact: "light",
  impactReason: "A few CSS rules",
  needsReload: false,
  enabledByDefault: true,
  options: {
    store: { type: "boolean", label: "Nitro, Shop and Quests tabs", default: true },
    gift: { type: "boolean", label: "Gift button in the message box", default: true },
    apps: { type: "boolean", label: "Apps button in the message box", default: false },
    stickers: { type: "boolean", label: "Sticker button in the message box", default: false },
    download: { type: "boolean", label: "“Download apps” in the server list", default: true },
    discover: { type: "boolean", label: "Discover in the server list", default: false },
    help: { type: "boolean", label: "Help button in the top bar", default: true },
    boostPopups: { type: "boolean", label: "Boost and Nitro pop-ups", description: "The pink gradient nudges, like “Boost This Server”.", default: true },
  },
  start(ctx) {
    const o = ctx.options;
    const rules: string[] = [];
    if (o.store) {
      for (const href of ["/store", "/shop", "/quest-home"]) rules.push(`nav[class*="privateChannels_"] li:has(a[href="${href}"])`);
    }
    if (o.gift) rules.push('form [class*="buttons_"] > :has([aria-label="Send a gift"])');
    if (o.apps) rules.push('form [class*="buttons_"] > .app-launcher-entrypoint');
    if (o.stickers) rules.push('form [class*="buttons_"] > :has([class*="stickerButton_"])');
    if (o.download) rules.push('nav[class*="guilds_"] [class*="listItem_"]:has([data-list-item-id="guildsnav___app-download-button"])');
    if (o.discover) rules.push('nav[class*="guilds_"] [class*="listItem_"]:has([data-list-item-id="guildsnav___guild-discover-button"])');
    if (o.help) rules.push('[class*="base_"] > [class^="bar_"] [class*="trailing_"] > :is(a, div):has([aria-label="Help"]), [class*="base_"] > [class^="bar_"] [class*="trailing_"] [aria-label="Help"]');
    // The whole layer goes, click trap included, so no invisible layer is left eating clicks.
    if (o.boostPopups) rules.push('[class*="layerContainer_"] [class*="clickTrapContainer_"]:has([class*="popoverGradientWrapper_"])');
    ctx.css(hide(rules));
  },
});

const blurNsfw = definePlugin({
  id: "blurNsfw",
  name: "Blur NSFW",
  description: "Blurs images and videos in age-restricted channels until you point at them.",
  category: "Media",
  impact: "light",
  impactReason: "One check when you switch channels",
  needsReload: false,
  enabledByDefault: false,
  options: {
    amount: { type: "number", label: "Blur (px)", default: 24, min: 4, max: 60 },
  },
  start(ctx) {
    ctx.css(`
      html[data-xray-nsfw] li[id^="chat-messages-"] :is([class*="imageWrapper_"], [class*="embedMedia_"], [class*="embedImage_"], video) {
        filter: blur(${ctx.options.amount}px);
        transition: filter 160ms ease;
      }
      html[data-xray-nsfw] li[id^="chat-messages-"] :is([class*="imageWrapper_"], [class*="embedMedia_"], [class*="embedImage_"], video):hover { filter: none; }
    `);
    const sync = (channelId?: string | null) => {
      const channel = channelId ? stores.channels?.getChannel?.(channelId) : null;
      const nsfw = !!(channel?.nsfw ?? channel?.isNSFW?.());
      document.documentElement.toggleAttribute("data-xray-nsfw", nsfw);
    };
    sync(currentChannelId());
    ctx.onAction("CHANNEL_SELECT", ({ channelId }) => sync(channelId));
    ctx.onStop(() => document.documentElement.removeAttribute("data-xray-nsfw"));
  },
});

const noBlocked = definePlugin({
  id: "noBlockedMessages",
  name: "No Blocked Messages",
  description: "Messages from people you've blocked disappear entirely, instead of “1 blocked message”.",
  category: "Chat",
  impact: "light",
  impactReason: "Checks each message's author as it arrives",
  needsReload: false,
  enabledByDefault: false,
  options: {
    ignored: { type: "boolean", label: "Also people you've ignored", default: true },
  },
  start(ctx) {
    const alsoIgnored = ctx.options.ignored;
    const hidden = (author: any) => {
      const id = author?.id;
      if (!id) return false;
      const relationships = stores.relationships;
      return !!relationships?.isBlocked?.(id) || (alsoIgnored && !!relationships?.isIgnored?.(id));
    };
    ctx.intercept((action) => {
      if (action.type === "MESSAGE_CREATE") return hidden(action.message?.author);
      if (action.type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(action.messages)) {
        action.messages = action.messages.filter((m: any) => !hidden(m?.author));
      }
    });
  },
});

const imageFilename = definePlugin({
  id: "imageFilename",
  name: "Image File Names",
  description: "Point at an image or GIF to see its file name.",
  category: "Media",
  impact: "light",
  impactReason: "Only runs when you point at an image",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const over = (event: MouseEvent) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || img.title || !img.closest('li[id^="chat-messages-"]')) return;
      try {
        const name = decodeURIComponent(new URL(img.currentSrc || img.src).pathname.split("/").pop() ?? "");
        if (name && !/^\d+$/.test(name)) img.title = name;
      } catch {
        // not a URL we can read
      }
    };
    window.addEventListener("mouseover", over, { capture: true, passive: true });
    ctx.onStop(() => window.removeEventListener("mouseover", over, true));
  },
});

const pictureInPicture = definePlugin({
  id: "pictureInPicture",
  name: "Picture in Picture",
  description: "Right-click a message with a video to pop it out into a floating window.",
  category: "Media",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { message, element }) => {
      if (!message) return;
      const row = element?.closest('li[id^="chat-messages-"]') ?? document.querySelector(`li[id$="-${message.id}"]`);
      const video = row?.querySelector("video");
      if (!video || !document.pictureInPictureEnabled) return;
      items.push(menu.item({ id: "picture-in-picture", label: "Picture in picture", action: () => void video.requestPictureInPicture().catch(() => {}) }));
    });
  },
});

const callTimer = definePlugin({
  id: "callTimer",
  name: "Call Timer",
  description: "Shows how long you've been in voice, in the top bar.",
  category: "Voice",
  impact: "light",
  impactReason: "Updates once a second, only while you're in voice",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    let since: number | null = null;
    let pill: HTMLElement | undefined;
    let timer: number | undefined;
    const format = (ms: number) => {
      const s = Math.floor(ms / 1000);
      const hh = Math.floor(s / 3600);
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
    };
    const tick = () => {
      if (pill && since !== null) pill.lastElementChild!.textContent = format(Date.now() - since);
    };
    const set = (inVoice: boolean) => {
      if (inVoice && since === null) {
        since = Date.now();
        pill = h("div", { class: "calltimer", attrs: { role: "timer", "aria-label": "Time in voice" } }, h("span", { class: "calltimer-dot" }), h("span", { class: "mono" }));
        uiRoot().append(pill);
        tick();
        timer = window.setInterval(tick, 1000);
      } else if (!inVoice && since !== null) {
        since = null;
        clearInterval(timer);
        pill?.remove();
        pill = undefined;
      }
    };
    ctx.onAction("VOICE_CHANNEL_SELECT", ({ channelId }) => set(!!channelId));
    const me = myId();
    if (me && stores.voiceStates?.getVoiceStateForUser?.(me)?.channelId) set(true);
    ctx.onStop(() => set(false));
  },
});

const keyboardSounds = definePlugin({
  id: "keyboardSounds",
  name: "Keyboard Sounds",
  description: "A soft mechanical click as you type in the message box.",
  category: "Fun",
  impact: "light",
  impactReason: "A tiny sound per key, made on the fly",
  needsReload: false,
  enabledByDefault: false,
  options: {
    volume: { type: "number", label: "Volume (%)", default: 35, min: 0, max: 100 },
    style: {
      type: "select",
      label: "Sound",
      default: "soft",
      choices: [
        { value: "soft", label: "Soft" },
        { value: "clicky", label: "Clicky" },
        { value: "typewriter", label: "Typewriter" },
      ],
    },
  },
  start(ctx) {
    const { volume, style } = ctx.options;
    const tone = { soft: { freq: 1800, decay: 0.03 }, clicky: { freq: 3200, decay: 0.018 }, typewriter: { freq: 1200, decay: 0.06 } }[style] ?? { freq: 1800, decay: 0.03 };
    let audio: AudioContext | undefined;
    let noise: AudioBuffer | undefined;
    const click = (event: KeyboardEvent) => {
      if (event.repeat || !(event.target instanceof Element) || !event.target.closest('[role="textbox"], [contenteditable="true"]')) return;
      audio ??= new AudioContext();
      if (!noise) {
        noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.08), audio.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const source = audio.createBufferSource();
      source.buffer = noise;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      // A little variety per key so it doesn't sound like a metronome.
      filter.frequency.value = tone.freq * (0.85 + Math.random() * 0.3);
      filter.Q.value = 1.4;
      const gain = audio.createGain();
      const now = audio.currentTime;
      gain.gain.setValueAtTime((volume / 100) * (event.key === " " || event.key === "Enter" ? 0.9 : 0.6), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.decay * (event.key === "Enter" ? 2 : 1));
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start(now);
      source.stop(now + 0.1);
    };
    window.addEventListener("keydown", click, { capture: true, passive: true });
    ctx.onStop(() => {
      window.removeEventListener("keydown", click, true);
      void audio?.close().catch(() => {});
    });
  },
});

export const appearancePlugins: readonly Plugin<any>[] = [declutter, blurNsfw, noBlocked, imageFilename, pictureInPicture, callTimer, keyboardSounds];
