/**
 * Plugins for reading chat: blur messages with words you'd rather not see
 * until you point at them, render Markdown tables, explain tone tags like
 * /j and /srs, hide stickers, search the web for a message, set a default
 * playback speed, and flip the theme with a key.
 *
 * Anything added to a message goes after Discord's own text, never inside
 * it, since Discord's renderer owns those nodes.
 */
import { menu } from "../api/menus";
import { stores } from "../discord";
import { setThemeEnabled, themeEnabled } from "../settings";
import { setThemeActive } from "../theme";
import { definePlugin, type Plugin } from "./types";

const CONTENT = 'li[id^="chat-messages-"] [class*="contents_"] > [class*="messageContent_"]';
const ROW = /^chat-messages-(\d+)-(\d+)$/;

/** A message's text as typed (with its line breaks), from Discord's store; the rendered text as a fallback. */
function textOf(content: Element): string {
  const ids = ROW.exec(content.closest("li")?.id ?? "");
  const stored = ids ? stores.messages?.getMessage?.(ids[1], ids[2])?.content : undefined;
  return typeof stored === "string" ? stored : content.textContent ?? "";
}

/** Each line a word or phrase, or a /regex/. */
function wordMatcher(lines: readonly string[]): (text: string) => boolean {
  const tests = lines.flatMap((line) => {
    const regex = /^\/(.+)\/([imsuy]*)$/.exec(line);
    if (regex) {
      try {
        const re = new RegExp(regex[1], regex[2].includes("i") ? regex[2] : regex[2] + "i");
        return [(t: string) => re.test(t)];
      } catch {
        return [];
      }
    }
    const word = line.toLowerCase();
    return word ? [(t: string) => t.toLowerCase().includes(word)] : [];
  });
  return (text) => tests.some((test) => test(text));
}

const contentWarning = definePlugin({
  id: "contentWarning",
  name: "Content Warnings",
  description: "Messages with words you choose are blurred until you point at them.",
  category: "Chat",
  impact: "light",
  impactReason: "Checks each message's text once",
  needsReload: false,
  enabledByDefault: false,
  options: {
    words: { type: "list", label: "Words", description: "One per line. /regex/ works too.", default: [] },
  },
  start(ctx) {
    if (!ctx.options.words.length) return;
    const matches = wordMatcher(ctx.options.words);
    ctx.css(`
      li[data-xray-cw] :is([class*="messageContent_"], [class*="imageWrapper_"], [class*="embedFull_"], video) { filter: blur(7px); transition: filter 140ms ease; }
      li[data-xray-cw]:hover :is([class*="messageContent_"], [class*="imageWrapper_"], [class*="embedFull_"], video) { filter: none; }
    `);
    ctx.watch(CONTENT, (content) => {
      if (matches(textOf(content))) content.closest("li")?.setAttribute("data-xray-cw", "");
    });
    ctx.onStop(() => document.querySelectorAll("li[data-xray-cw]").forEach((row) => row.removeAttribute("data-xray-cw")));
  },
});

/** A GitHub-style table in plain text: header row, a |---| row, then body rows. Null if there isn't one. */
export function parseTable(text: string): string[][] | null {
  const lines = text.split("\n").map((line) => line.trim());
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes("|") || !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(lines[i + 1])) continue;
    const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    const rows = [cells(lines[i])];
    for (let j = i + 2; j < lines.length && lines[j].includes("|"); j++) rows.push(cells(lines[j]));
    return rows.length > 1 ? rows : null;
  }
  return null;
}

const markdownTables = definePlugin({
  id: "markdownTables",
  name: "Markdown Tables",
  description: "Messages with a Markdown table (| a | b |) show it as a real table underneath.",
  category: "Chat",
  impact: "light",
  impactReason: "Checks each message's text once",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`
      .xray-table { margin: 6px 0 2px; border-collapse: collapse; font-size: .9em; display: block; max-width: 100%; overflow-x: auto; }
      .xray-table th, .xray-table td { padding: 5px 10px; border: 1px solid rgba(255,255,255,.1); text-align: left; }
      .xray-table th { font-weight: 600; background: rgba(255,255,255,.05); }
    `);
    ctx.watch(CONTENT, (content) => {
      const row = content.closest("li");
      if (!row || row.querySelector(".xray-table")) return;
      const rows = parseTable(textOf(content));
      if (!rows) return;
      const table = document.createElement("table");
      table.className = "xray-table";
      rows.forEach((cells, i) => {
        const tr = table.insertRow();
        for (const cell of cells) {
          const el = document.createElement(i === 0 ? "th" : "td");
          el.textContent = cell;
          tr.append(el);
        }
      });
      content.insertAdjacentElement("afterend", table);
    });
    ctx.onStop(() => document.querySelectorAll(".xray-table").forEach((el) => el.remove()));
  },
});

const TONES: Record<string, string> = {
  j: "joking", hj: "half-joking", s: "sarcastic", sarc: "sarcastic", srs: "serious", nsrs: "not serious", gen: "genuine",
  g: "genuine", pos: "positive", neg: "negative", neu: "neutral", nm: "not mad", lh: "lighthearted", t: "teasing",
  nbh: "nobody here", rh: "rhetorical", lu: "a little upset", ref: "reference", p: "platonic", r: "romantic",
  c: "copypasta", l: "lyrics", ly: "lyrics", m: "metaphorically", li: "literally", hyp: "hyperbole", ij: "inside joke",
  q: "quote", f: "fake", th: "threat", cb: "clickbait", nf: "not forced", iron: "ironic", pc: "positive connotation",
  nc: "negative connotation", npa: "not passive-aggressive",
};

/** The tone tags in a message, like ["j: joking"]. */
export function toneTags(text: string): string[] {
  const found = new Set<string>();
  for (const [, tag] of text.matchAll(/(?:^|\s)\/([a-z]{1,4})(?=$|[\s.,!?)])/gi)) {
    const meaning = TONES[tag.toLowerCase()];
    if (meaning) found.add(`/${tag.toLowerCase()} ${meaning}`);
  }
  return [...found];
}

const toneIndicators = definePlugin({
  id: "toneIndicators",
  name: "Tone Tags",
  description: "Spells out tone tags like /j, /srs and /gen under the message that uses them.",
  category: "Chat",
  impact: "light",
  impactReason: "Checks each message's text once",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`
      .xray-tones { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
      .xray-tone { padding: 1px 6px; border-radius: 5px; background: rgba(255,255,255,.06); font: 500 10.5px "Cascadia Mono", Consolas, monospace; color: var(--text-muted); }
    `);
    ctx.watch(CONTENT, (content) => {
      const row = content.closest("li");
      if (!row || row.querySelector(".xray-tones")) return;
      const tags = toneTags(textOf(content));
      if (!tags.length) return;
      const box = document.createElement("div");
      box.className = "xray-tones";
      for (const tag of tags) {
        const chip = document.createElement("span");
        chip.className = "xray-tone";
        chip.textContent = tag;
        box.append(chip);
      }
      content.insertAdjacentElement("afterend", box);
    });
    ctx.onStop(() => document.querySelectorAll(".xray-tones").forEach((el) => el.remove()));
  },
});

const stickerBlocker = definePlugin({
  id: "stickerBlocker",
  name: "Hide Stickers",
  description: "Stickers in chat are hidden. Point at the empty spot to see one anyway.",
  category: "Chat",
  impact: "light",
  impactReason: "One CSS rule",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.css(`
      li[id^="chat-messages-"] :is([class*="stickerWrapper_"], [class*="clickableSticker_"]) { opacity: 0; transition: opacity 120ms ease; }
      li[id^="chat-messages-"] :is([class*="stickerWrapper_"], [class*="clickableSticker_"]):hover { opacity: 1; }
    `);
  },
});

const ENGINES: Record<string, string> = {
  google: "https://www.google.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q=",
  brave: "https://search.brave.com/search?q=",
};

const searchTheWeb = definePlugin({
  id: "searchTheWeb",
  name: "Search the Web",
  description: "Right-click a message to search the web for it, or for the part you've selected.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  options: {
    engine: {
      type: "select",
      label: "Search with",
      default: "google",
      choices: [
        { value: "google", label: "Google" },
        { value: "duckduckgo", label: "DuckDuckGo" },
        { value: "bing", label: "Bing" },
        { value: "brave", label: "Brave" },
      ],
    },
  },
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      const selection = window.getSelection()?.toString().trim() ?? "";
      const query = (selection || message?.content || "").trim().slice(0, 300);
      if (!query) return;
      const base = ENGINES[ctx.options.engine] ?? ENGINES.google;
      items.push(
        menu.item({
          id: "search-web",
          label: selection ? "Search the web for selection" : "Search the web",
          action: () => window.open(base + encodeURIComponent(query), "_blank", "noopener,noreferrer"),
        }),
      );
    });
  },
});

const playbackSpeed = definePlugin({
  id: "mediaPlaybackSpeed",
  name: "Playback Speed",
  description: "Videos and voice messages in chat start at the speed you choose.",
  category: "Media",
  impact: "light",
  impactReason: "Only runs when chat media starts playing",
  needsReload: false,
  enabledByDefault: false,
  options: {
    speed: { type: "number", label: "Speed", description: "1 is normal.", default: 1.25, min: 0.25, max: 3, step: 0.25 },
  },
  start(ctx) {
    const speed = ctx.options.speed;
    const started = new WeakSet<HTMLMediaElement>();
    ctx.patch(HTMLMediaElement.prototype, "play", {
      before(media: HTMLMediaElement) {
        // Only media shown in a message, and only the first time, so a speed you change by hand sticks.
        if (started.has(media) || !media.closest?.('li[id^="chat-messages-"]')) return;
        started.add(media);
        media.playbackRate = speed;
      },
    });
  },
});

const themeKey = definePlugin({
  id: "themeSwitchKey",
  name: "Theme Key",
  description: "Ctrl+Alt+T flips between xray's Obsidian look and Discord's own.",
  category: "Appearance",
  impact: "light",
  impactReason: "Only runs on its key",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.onKey((event) => {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.code !== "KeyT") return false;
      setThemeEnabled(!themeEnabled());
      setThemeActive(themeEnabled());
      return true;
    });
  },
});

export const readingPlugins: readonly Plugin<any>[] = [markdownTables, toneIndicators, contentWarning, stickerBlocker, searchTheWeb, playbackSpeed, themeKey];
