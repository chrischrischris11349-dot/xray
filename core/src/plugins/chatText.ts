/**
 * Plugins that rewrite the text of messages you send. Each runs as a send
 * hook (see api/messages.ts) and leaves code, links, mentions and emoji
 * alone (see text.ts).
 */
import { withContent } from "../api/messages";
import { stores } from "../discord";
import { CODE, mapCodeBlocks, mapProse, matchCase, parseRules } from "./text";
import { definePlugin, type Plugin } from "./types";

const ON_SEND = "Only runs when you send a message";

const textReplace = definePlugin({
  id: "textReplace",
  name: "Text Replace",
  description: "Your own find-and-replace rules for everything you send. Supports /regex/ too.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: false,
  options: {
    rules: {
      type: "list",
      label: "Rules",
      description: "One per line: find => replace. Wrap find in slashes for a regex, like /colou?r/ => color.",
      default: [],
      placeholder: "teh => the",
    },
    alsoEdits: { type: "boolean", label: "Apply to edits too", default: true },
  },
  start(ctx) {
    const rules = parseRules(ctx.options.rules, false);
    if (!rules.length) return;
    const apply = (content: string) => mapProse(content, (prose) => rules.reduce((text, rule) => text.replace(rule.find, rule.replace), prose));
    ctx.onSend((_channel, message) => {
      message.content = apply(message.content);
    });
    if (ctx.options.alsoEdits) {
      ctx.onEdit((_channel, _id, message) => {
        message.content = apply(message.content);
      });
    }
  },
});

const abbreviations = definePlugin({
  id: "abbreviations",
  name: "Abbreviations",
  description: "Expands your shorthand as you send: brb becomes be right back.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: false,
  options: {
    words: {
      type: "list",
      label: "Abbreviations",
      description: "One per line: short => long. Only whole words match.",
      default: ["brb => be right back", "idk => I don't know", "imo => in my opinion", "tbh => to be honest"],
    },
  },
  start(ctx) {
    const rules = parseRules(ctx.options.words, true);
    ctx.onSend((_channel, message) => {
      message.content = mapProse(message.content, (prose) =>
        rules.reduce((text, rule) => text.replace(rule.find, (word) => matchCase(word, rule.replace)), prose),
      );
    });
  },
});

const autoCapitalize = definePlugin({
  id: "autoCapitalize",
  name: "Auto Capitalize",
  description: "Starts each sentence with a capital letter and fixes a lowercase “i”.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: false,
  options: {
    fixI: { type: "boolean", label: "Fix a lone lowercase i", default: true },
  },
  start(ctx) {
    const fixI = ctx.options.fixI;
    ctx.onSend((_channel, message) => {
      let first = true;
      message.content = mapProse(message.content, (prose) => {
        let text = prose.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (whole, lead: string, letter: string, offset: number) =>
          offset === 0 && !first && lead === "" ? whole : lead + letter.toUpperCase(),
        );
        if (fixI) text = text.replace(/(?<![\p{L}\p{N}'])i(?=$|[\s,.!?'’])/gu, "I");
        if (prose.trim()) first = false;
        return text;
      });
    });
  },
});

const noCaps = definePlugin({
  id: "noCaps",
  name: "No Caps Lock",
  description: "Turns messages that are mostly capital letters into lowercase before they go out.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: false,
  options: {
    threshold: { type: "number", label: "Capital letters (%)", description: "How much of a message must be capitals.", default: 60, min: 30, max: 100 },
    minLetters: { type: "number", label: "Shortest message it applies to (letters)", default: 8, min: 1, max: 200 },
  },
  start(ctx) {
    const { threshold, minLetters } = ctx.options;
    ctx.onSend((_channel, message) => {
      const prose = message.content.split(CODE).filter((_, i) => i % 2 === 0).join(" ");
      const letters = prose.match(/\p{L}/gu) ?? [];
      if (letters.length < minLetters) return;
      const capitals = letters.filter((c) => c !== c.toLowerCase()).length;
      if ((capitals / letters.length) * 100 >= threshold) message.content = mapProse(message.content, (p) => p.toLowerCase());
    });
  },
});

const signature = definePlugin({
  id: "signature",
  name: "Signature",
  description: "Adds a line of your choice to the end of every message.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: false,
  options: {
    text: { type: "string", label: "Signature", default: "", placeholder: "— sent from xray" },
    newLine: { type: "boolean", label: "On its own line", default: true },
    serversOnly: { type: "boolean", label: "Only in servers", description: "Leave DMs alone.", default: false },
  },
  start(ctx) {
    const { text, newLine, serversOnly } = ctx.options;
    if (!text.trim()) return;
    ctx.onSend((channelId, message) => {
      if (serversOnly && !stores.channels?.getChannel?.(channelId)?.guild_id) return;
      if (!message.content.trim()) return;
      message.content = `${message.content}${newLine ? "\n" : " "}${text}`;
    });
  },
});

const reverseText = definePlugin({
  id: "reverseText",
  name: "Talk in Reverse",
  description: "Sends every message backwards. .sdrawkcab segassem yreve sdneS",
  category: "Fun",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.onSend((_channel, message) => {
      message.content = mapProse(message.content, (prose) => [...prose].reverse().join(""));
    });
  },
});

const ington = definePlugin({
  id: "ington",
  name: "Ingtoninator",
  description: "Adds “ington” to one random word in each message. Washington would approve.",
  category: "Fun",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.onSend((_channel, message) => {
      let done = false;
      message.content = mapProse(message.content, (prose) => {
        if (done) return prose;
        const words = [...prose.matchAll(/\p{L}{4,}/gu)];
        if (!words.length) return prose;
        done = true;
        const pick = words[Math.floor(Math.random() * words.length)];
        const end = pick.index! + pick[0].length;
        return prose.slice(0, end) + "ington" + prose.slice(end);
      });
    });
  },
});

const unindent = definePlugin({
  id: "unindent",
  name: "Unindent Code",
  description: "Removes the extra indentation from code you paste into ``` blocks.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const trim = (code: string) => {
      const lines = code.split("\n");
      const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
      const common = indents.length ? Math.min(...indents) : 0;
      return common ? lines.map((l) => l.slice(Math.min(common, /^[ \t]*/.exec(l)![0].length))).join("\n") : code;
    };
    const apply = (message: { content: string }) => {
      if (message.content.includes("```")) message.content = mapCodeBlocks(message.content, trim);
    };
    ctx.onSend((_channel, message) => apply(message));
    ctx.onEdit((_channel, _id, message) => apply(message));
  },
});

const normalizeLinks = definePlugin({
  id: "normalizeMessageLinks",
  name: "Normal Message Links",
  description: "Turns canary.discord.com and ptb.discord.com links into plain discord.com ones.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const fix = (content: string) => content.replace(/https:\/\/(?:canary|ptb)\.discord(?:app)?\.com\/channels\//g, "https://discord.com/channels/");
    ctx.onSend((_channel, message) => {
      message.content = fix(message.content);
    });
    ctx.onEdit((_channel, _id, message) => {
      message.content = fix(message.content);
    });
  },
});

/** "18:30", "6:30pm", "2026-12-24 18:00" → a Date, today's or the next one for a bare time. */
export function parseWhen(text: string, now: Date): Date | null {
  const t = text.trim().toLowerCase();
  const rel = /^in\s+(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)$/.exec(t);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2][0];
    const ms = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[unit as "s" | "m" | "h" | "d" | "w"];
    return new Date(now.getTime() + n * ms);
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?$/.exec(t);
  if (date) return new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(date[4] ?? 0), Number(date[5] ?? 0));
  const clock = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (clock && (clock[2] !== undefined || clock[3])) {
    let hour = Number(clock[1]) % (clock[3] ? 12 : 24);
    if (clock[3] === "pm") hour += 12;
    const when = new Date(now);
    when.setHours(hour, Number(clock[2] ?? 0), 0, 0);
    if (when.getTime() < now.getTime() - 60_000) when.setDate(when.getDate() + 1);
    return when;
  }
  return null;
}

const sendTimestamps = definePlugin({
  id: "sendTimestamps",
  name: "Timestamps",
  description: "Type <t:18:30>, <t:6pm>, <t:in 2h> or <t:2026-12-24 18:00> and everyone sees it in their own time zone.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.onSend((_channel, message) => {
      if (!message.content.includes("<t:")) return;
      const now = new Date();
      message.content = message.content.replace(/<t:([^>:]+(?::\d{2})?(?:\s*[ap]m)?|in [^>]+|\d{4}-\d{2}-\d{2}[^>]*)>/gi, (whole, spec: string) => {
        if (/^\d+(?::[tTdDfFR])?$/.test(spec)) return whole; // already Discord's own <t:unix> form
        const when = parseWhen(spec, now);
        if (!when || Number.isNaN(when.getTime())) return whole;
        const unix = Math.floor(when.getTime() / 1000);
        const style = /^in /i.test(spec) ? "R" : /\d{4}-/.test(spec) ? "f" : "t";
        return `<t:${unix}:${style}>`;
      });
    });
  },
});

function maxLength(): number {
  try {
    return stores.users?.getCurrentUser?.()?.premiumType === 2 ? 4000 : 2000;
  } catch {
    return 2000;
  }
}

/** Splits text into chunks of at most `limit`, preferring line breaks, then spaces. */
export function splitText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^[\n ]/, "");
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}

const splitLong = definePlugin({
  id: "splitLongMessages",
  name: "Split Long Messages",
  description: "Sends a message that's over Discord's length limit as several messages instead of refusing it.",
  category: "Chat",
  impact: "light",
  impactReason: ON_SEND,
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.onSend((_channel, message) => {
      const limit = maxLength();
      if (message.content.length <= limit) return;
      return splitText(message.content, limit).map((chunk) => withContent(message, chunk));
    });
  },
});

export const chatTextPlugins: readonly Plugin<any>[] = [
  textReplace,
  abbreviations,
  autoCapitalize,
  noCaps,
  signature,
  sendTimestamps,
  splitLong,
  unindent,
  normalizeLinks,
  reverseText,
  ington,
];
