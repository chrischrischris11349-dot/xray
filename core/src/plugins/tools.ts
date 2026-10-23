import { formatDateTime } from "../time";
/**
 * Message tools from the right-click menu (convert units, decode Base64,
 * save a message as a file, open every attachment), color swatches next to
 * hex codes, a pin mark on pinned messages, hiding servers from the dock,
 * and a focus mode that hides the side panels.
 */
import { menu } from "../api/menus";
import { stores } from "../discord";
import { pluginState, save } from "../settings";
import { showDialog } from "../ui/dialog";
import { definePlugin, type Plugin } from "./types";

const ROW = /^chat-messages-(\d+)-(\d+)$/;

// ---- unit conversion ----

const UNITS: Record<string, [to: string, factor: number] | ((n: number) => [string, number])> = {
  km: ["mi", 0.621371], mi: ["km", 1.609344], m: ["ft", 3.28084], ft: ["m", 0.3048], cm: ["in", 0.393701], in: ["cm", 2.54],
  kg: ["lb", 2.204623], lb: ["kg", 0.453592], lbs: ["kg", 0.453592], g: ["oz", 0.035274], oz: ["g", 28.3495],
  l: ["gal", 0.264172], gal: ["l", 3.785412], ml: ["fl oz", 0.033814], kmh: ["mph", 0.621371], "km/h": ["mph", 0.621371], mph: ["km/h", 1.609344],
  c: (n) => ["°F", (n * 9) / 5 + 32], "°c": (n) => ["°F", (n * 9) / 5 + 32], f: (n) => ["°C", ((n - 32) * 5) / 9], "°f": (n) => ["°C", ((n - 32) * 5) / 9],
};

/** Every measurement in the text with its metric or imperial equivalent: "5 km = 3.11 mi". */
export function convertUnits(text: string): string[] {
  const out: string[] = [];
  const pattern = /(-?\d+(?:[.,]\d+)?)\s?(km\/h|kmh|mph|°[cf]|fl oz|km|mi|cm|ml|kg|lbs|lb|oz|gal|ft|in|m|g|l|c|f)\b/gi;
  for (const [, raw, unitRaw] of text.matchAll(pattern)) {
    const n = Number(raw.replace(",", "."));
    const unit = unitRaw.toLowerCase();
    const rule = UNITS[unit];
    if (!rule || !Number.isFinite(n)) continue;
    const [to, value] = typeof rule === "function" ? rule(n) : [rule[0], n * rule[1]];
    out.push(`${raw} ${unitRaw} = ${Number(value.toFixed(2))} ${to}`);
  }
  return [...new Set(out)];
}

const unitConverter = definePlugin({
  id: "unitConverter",
  name: "Unit Converter",
  description: "Right-click a message with measurements to see them in metric or imperial.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      const lines = message?.content ? convertUnits(message.content) : [];
      if (lines.length) items.push(menu.item({ id: "convert-units", label: "Convert units", action: () => showDialog({ title: "Converted", body: lines.join("\n") }) }));
    });
  },
});

// ---- Base64 ----

/** Base64-looking runs of at least 16 characters, decoded when they turn out to be readable text. */
export function decodeBase64(text: string): string[] {
  const out: string[] = [];
  for (const [chunk] of text.matchAll(/[A-Za-z0-9+/_-]{16,}={0,2}/g)) {
    try {
      const bytes = Uint8Array.from(atob(chunk.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/^[\p{L}\p{N}\p{P}\p{S}\s]+$/u.test(decoded)) out.push(decoded);
    } catch {
      // not Base64, or not text
    }
  }
  return out;
}

const base64 = definePlugin({
  id: "decodeBase64",
  name: "Decode Base64",
  description: "Right-click a message with Base64 in it to read the decoded text.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      const decoded = message?.content ? decodeBase64(message.content) : [];
      if (decoded.length) items.push(menu.item({ id: "decode-base64", label: "Decode Base64", action: () => showDialog({ title: "Decoded", code: decoded.join("\n\n") }) }));
    });
  },
});

// ---- saving and attachments ----

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const exportMessage = definePlugin({
  id: "exportMessage",
  name: "Save Message",
  description: "Right-click a message to save it as a text file, with who sent it and when.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      if (!message) return;
      items.push(
        menu.item({
          id: "save-message",
          label: "Save as text file",
          action: () => {
            const author = message.author?.globalName || message.author?.username || "unknown";
            const when = new Date(String(message.timestamp));
            const files = (message.attachments ?? []).map((a: any) => `\n[file] ${a.filename}: ${a.url}`).join("");
            download(`message-${message.id}.txt`, `${author}, ${formatDateTime(when)}\n\n${message.content ?? ""}${files}\n`);
          },
        }),
      );
    });
  },
});

const openAttachments = definePlugin({
  id: "openAllAttachments",
  name: "Open All Attachments",
  description: "Right-click a message with several files to open them all at once.",
  category: "Media",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      const files = (message?.attachments ?? []).filter((a: any) => typeof a?.url === "string");
      if (files.length < 2) return;
      items.push(
        menu.item({
          id: "open-all-attachments",
          label: `Open all ${files.length} attachments`,
          action: () => files.slice(0, 20).forEach((a: any) => window.open(a.url, "_blank", "noopener,noreferrer")),
        }),
      );
    });
  },
});

// ---- in chat ----

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

const messageColors = definePlugin({
  id: "messageColors",
  name: "Color Swatches",
  description: "A small swatch next to color codes like #7c5cff in messages.",
  category: "Chat",
  impact: "light",
  impactReason: "Checks each message's text once",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`.xray-swatches { margin-left: 6px; } .xray-swatch { display: inline-block; width: .8em; height: .8em; margin: 0 .15em -.05em; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); }`);
    // Swatches go after the text, never inside it: Discord's renderer owns those text nodes.
    const paint = (content: Element) => {
      if (content.querySelector(".xray-swatches")) return;
      const colors = [...new Set((content.textContent ?? "").match(HEX) ?? [])].slice(0, 8);
      if (!colors.length) return;
      const box = document.createElement("span");
      box.className = "xray-swatches";
      for (const color of colors) {
        const swatch = document.createElement("span");
        swatch.className = "xray-swatch";
        swatch.style.background = color;
        swatch.title = color;
        box.append(swatch);
      }
      content.append(box);
    };
    ctx.watch('li[id^="chat-messages-"] [class*="contents_"] > [class*="messageContent_"]', paint);
    ctx.onStop(() => document.querySelectorAll(".xray-swatches").forEach((el) => el.remove()));
  },
});

const pinIcon = definePlugin({
  id: "pinIcon",
  name: "Pin Marks",
  description: "A small pin next to pinned messages, so you can spot them in the chat.",
  category: "Chat",
  impact: "light",
  impactReason: "One check per message header",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`.xray-pin { margin-left: 6px; font-size: 11px; opacity: .7; }`);
    const mark = (header: Element) => {
      const ids = ROW.exec(header.closest('li[id^="chat-messages-"]')?.id ?? "");
      const pinned = ids ? stores.messages?.getMessage?.(ids[1], ids[2])?.pinned : false;
      const existing = header.querySelector(".xray-pin");
      if (pinned && !existing) {
        const pin = document.createElement("span");
        pin.className = "xray-pin";
        pin.textContent = "📌";
        pin.title = "Pinned";
        (header.querySelector('[class*="headerText_"]') ?? header).append(pin);
      } else if (!pinned) existing?.remove();
    };
    ctx.watch('li[id^="chat-messages-"] h3[class*="header_"]', mark);
    ctx.onAction("MESSAGE_UPDATE", () => window.setTimeout(() => document.querySelectorAll('li[id^="chat-messages-"] h3[class*="header_"]').forEach(mark), 60));
    ctx.onStop(() => document.querySelectorAll(".xray-pin").forEach((el) => el.remove()));
  },
});

// ---- layout ----

const HIDE_ID = "hideServers";

function hiddenServers(): string[] {
  const list = pluginState(HIDE_ID).data?.hidden;
  return Array.isArray(list) ? (list as string[]) : [];
}

const hideServers = definePlugin({
  id: HIDE_ID,
  name: "Hide Servers",
  description: "Right-click a server to hide it from the server list. Bring them all back from Ctrl+K.",
  category: "Servers",
  impact: "light",
  impactReason: "A CSS rule per hidden server",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    ctx.onStop(() => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
    });
    const apply = () => {
      const rules = hiddenServers().map((id) => `nav[class*="guilds_"] [class*="listItem_"]:has([data-list-item-id="guildsnav___${id.replace(/\D/g, "")}"])`);
      sheet.replaceSync(rules.length ? `${rules.join(",\n")} { display: none !important; }` : "");
    };
    const set = (list: string[]) => {
      (pluginState(HIDE_ID).data ??= {}).hidden = list;
      save();
      apply();
    };
    apply();
    ctx.menu("guild-context", (items, { guild, guildId }) => {
      const id = guild?.id ?? guildId;
      if (id) items.push(menu.item({ id: "hide-server", label: "Hide server", action: () => set([...new Set([...hiddenServers(), id])]) }));
    });
    ctx.command("Show hidden servers", "Bring back every server you hid", () => set([]));
  },
});

const focusMode = definePlugin({
  id: "focusMode",
  name: "Focus Mode",
  description: "Ctrl+Shift+F hides the server list and channel list, leaving just the chat. Press it again to bring them back.",
  category: "Appearance",
  impact: "light",
  impactReason: "Only runs on its key",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.css(`
      html[data-xray-focus] [class*="base_"] > [class*="content_"] > [class*="sidebar_"] { display: none !important; }
      html[data-xray-focus] [class*="sidebar_"] + [class*="page_"] { grid-column: start / end !important; margin-left: 10px !important; }
    `);
    const toggle = () => document.documentElement.toggleAttribute("data-xray-focus");
    ctx.onKey((event) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.code !== "KeyF") return false;
      toggle();
      return true;
    });
    ctx.command("Toggle focus mode", "Hide or show the server and channel lists", toggle);
    ctx.onStop(() => document.documentElement.removeAttribute("data-xray-focus"));
  },
});

export const toolPlugins: readonly Plugin<any>[] = [unitConverter, base64, exportMessage, openAttachments, messageColors, pinIcon, hideServers, focusMode];
