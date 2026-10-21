/**
 * Message helpers: quiet pings from chosen people, send a message again,
 * schedule one for later, find the replies to a message, and turn a message
 * into a quote image.
 */
import { menu } from "../api/menus";
import { desktopNotify } from "../api/notify";
import { currentChannelId, displayName, loggedIn, messageActions, navigate, stores } from "../discord";
import { pluginState, save } from "../settings";
import { promptText, showDialog } from "../ui/dialog";
import { parseWhen } from "./chatText";
import { definePlugin, type Plugin } from "./types";

function send(channelId: string, content: string): void {
  messageActions()?.sendMessage?.(channelId, { content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, true, {});
}

const silenceUsers = definePlugin({
  id: "silenceUsers",
  name: "Silence People",
  description: "Pick people (right-click them) whose @mentions never ping you. Their messages still show; only the ping and badge go.",
  category: "Notifications",
  impact: "light",
  impactReason: "Checks each new message's author",
  needsReload: false,
  enabledByDefault: false,
  options: {
    users: { type: "list", label: "People", description: "User IDs, one per line. Right-click someone to add or remove them.", default: [] },
  },
  start(ctx) {
    const users = new Set(ctx.options.users);
    ctx.menu("user-context", (items, { user }) => {
      if (!user) return;
      const on = users.has(user.id);
      items.push(
        menu.checkbox({
          id: "silence-user",
          label: "Don't let their mentions ping me",
          checked: on,
          action: () => ctx.setOption("users", on ? [...users].filter((id) => id !== user.id) : [...users, user.id]),
        }),
      );
    });
    if (!users.size) return;
    // Before Discord's stores see it: with no mentions on it, the message is just a message.
    ctx.intercept((action) => {
      if (action.type !== "MESSAGE_CREATE" || !users.has(action.message?.author?.id)) return;
      action.message.mentions = [];
      action.message.mention_roles = [];
      action.message.mention_everyone = false;
    });
  },
});

const repeatMessages = definePlugin({
  id: "repeatMessages",
  name: "Send Again",
  description: "Right-click a message to send the same text again in this channel.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      const text = message?.content?.trim();
      if (text) items.push(menu.item({ id: "send-again", label: "Send again", action: () => send(message.channel_id, message.content) }));
    });
  },
});

const SCHEDULE_ID = "scheduledMessages";
/** Messages due while xray was closed are only sent if they're at most this late. */
const LATE_MS = 10 * 60_000;

interface Scheduled {
  channelId: string;
  content: string;
  at: number;
}

function queue(): Scheduled[] {
  const list = pluginState(SCHEDULE_ID).data?.queue;
  return Array.isArray(list) ? (list as Scheduled[]) : [];
}

function setQueue(list: Scheduled[]): void {
  (pluginState(SCHEDULE_ID).data ??= {}).queue = list;
  save();
}

const scheduledMessages = definePlugin({
  id: SCHEDULE_ID,
  name: "Scheduled Messages",
  description: "Write a message now and have it sent later, from Ctrl+K. xray has to be open at that time.",
  category: "Chat",
  impact: "light",
  impactReason: "One timer per scheduled message",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const timers = new Map<Scheduled, number>();
    const arm = (item: Scheduled) => {
      const wait = item.at - Date.now();
      if (wait < -LATE_MS) {
        setQueue(queue().filter((q) => q !== item && !(q.at === item.at && q.content === item.content)));
        desktopNotify("A scheduled message wasn't sent", "xray was closed when it was due.");
        return;
      }
      // Timers can't wait longer than about 24 days; check again then.
      timers.set(item, window.setTimeout(() => fire(item), Math.min(Math.max(wait, 0), 2 ** 31 - 1)));
    };
    const fire = (item: Scheduled) => {
      timers.delete(item);
      if (item.at > Date.now() + 1000) return arm(item);
      // Overdue at startup fires before Discord has connected; wait for it rather than lose the message.
      if (!loggedIn() || !messageActions()?.sendMessage) {
        timers.set(item, window.setTimeout(() => fire(item), 5000));
        return;
      }
      setQueue(queue().filter((q) => !(q.at === item.at && q.content === item.content && q.channelId === item.channelId)));
      send(item.channelId, item.content);
    };
    queue().forEach(arm);
    ctx.onStop(() => timers.forEach((timer) => clearTimeout(timer)));

    ctx.command("Schedule a message here", "Write it now, send it later", async () => {
      const channelId = currentChannelId();
      if (!channelId) return;
      const content = await promptText({ title: "Scheduled message", placeholder: "What to send", confirm: "Next", multiline: true });
      if (!content?.trim()) return;
      const when = await promptText({ title: "Send when?", placeholder: "in 30m, in 2h, 18:30, 6pm or 2026-12-24 09:00", confirm: "Schedule" });
      const at = when ? parseWhen(when, new Date()) : null;
      if (!at || at.getTime() < Date.now()) {
        showDialog({ title: "Couldn't read that time", body: "Try “in 30m”, “in 2h”, “18:30”, “6pm” or a date like “2026-12-24 09:00”." });
        return;
      }
      const item: Scheduled = { channelId, content, at: at.getTime() };
      setQueue([...queue(), item]);
      arm(item);
      showDialog({ title: "Scheduled", body: `It'll be sent ${at.toLocaleString()}, as long as xray is open.` });
    });
    ctx.command("Show scheduled messages", "What's waiting to be sent", () => {
      const list = queue().sort((a, b) => a.at - b.at);
      showDialog({
        title: "Scheduled messages",
        body: list.length ? list.map((q) => [new Date(q.at).toLocaleString(), q.content.slice(0, 120)] as [string, string]) : "Nothing scheduled.",
        actions: list.length
          ? [{ label: "Cancel all", danger: true, run: () => { timers.forEach((timer) => clearTimeout(timer)); timers.clear(); setQueue([]); } }, { label: "Close", primary: true }]
          : undefined,
      });
    });
  },
});

const findReply = definePlugin({
  id: "findReply",
  name: "Find Replies",
  description: "Right-click a message to jump to the first reply to it, if it's in the loaded chat.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      if (!message) return;
      const collection = stores.messages?.getMessages?.(message.channel_id);
      const all: any[] = collection?.toArray?.() ?? collection?._array ?? [];
      const replies = all.filter((m) => (m.messageReference?.message_id ?? m.messageReference?.messageId) === message.id);
      if (!replies.length) return;
      const guildId = stores.channels?.getChannel?.(message.channel_id)?.guild_id ?? "@me";
      items.push(
        menu.item({
          id: "find-reply",
          label: replies.length === 1 ? "Jump to reply" : `Jump to first of ${replies.length} replies`,
          action: () => navigate(`/channels/${guildId}/${message.channel_id}/${replies[0].id}`),
        }),
      );
    });
  },
});

/** Breaks text into lines that fit `width` on the canvas. */
function wrap(context: OffscreenCanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

async function quoteImage(message: any): Promise<Blob> {
  const W = 1200;
  const H = 630;
  const canvas = new OffscreenCanvas(W, H);
  const c = canvas.getContext("2d")!;
  const backdrop = c.createLinearGradient(0, 0, W, H);
  backdrop.addColorStop(0, "#0b0b0f");
  backdrop.addColorStop(1, "#16141f");
  c.fillStyle = backdrop;
  c.fillRect(0, 0, W, H);
  // The author's avatar, faded across the left.
  try {
    const url = message.author?.getAvatarURL?.(undefined, 512);
    if (url) {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      c.globalAlpha = 0.35;
      c.drawImage(bitmap, 0, 0, H, H);
      c.globalAlpha = 1;
      const fade = c.createLinearGradient(0, 0, H, 0);
      fade.addColorStop(0, "rgba(11,11,15,0)");
      fade.addColorStop(1, "rgba(11,11,15,1)");
      c.fillStyle = fade;
      c.fillRect(0, 0, H, H);
      bitmap.close();
    }
  } catch {
    // no avatar: the plain backdrop is fine
  }
  const left = 470;
  const maxWidth = W - left - 70;
  let size = 46;
  let lines: string[] = [];
  for (; size >= 22; size -= 4) {
    c.font = `600 ${size}px "Segoe UI Variable Display", "Segoe UI", sans-serif`;
    lines = wrap(c, `“${message.content.trim()}”`, maxWidth);
    if (lines.length * size * 1.3 < H - 220) break;
  }
  c.fillStyle = "#f2f3f5";
  const top = (H - lines.length * size * 1.3) / 2 - 20;
  lines.slice(0, 12).forEach((line, i) => c.fillText(line, left, top + i * size * 1.3 + size));
  c.font = `500 24px "Cascadia Mono", Consolas, monospace`;
  c.fillStyle = "#9a9ca5";
  const guildId = stores.channels?.getChannel?.(message.channel_id)?.guild_id;
  c.fillText(`— ${displayName(message.author?.id ?? "", guildId)}`, left, top + lines.length * size * 1.3 + 50);
  return canvas.convertToBlob({ type: "image/png" });
}

const quoter = definePlugin({
  id: "quoter",
  name: "Quote Image",
  description: "Right-click a message to turn it into a quote card image, copied to your clipboard.",
  category: "Fun",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      if (!message?.content?.trim()) return;
      items.push(
        menu.item({
          id: "quote-image",
          label: "Make a quote image",
          action: async () => {
            const blob = await quoteImage(message);
            try {
              await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
              showDialog({ title: "Quote copied", body: "Paste it anywhere with Ctrl+V." });
            } catch {
              window.open(URL.createObjectURL(blob), "_blank");
            }
          },
        }),
      );
    });
  },
});

export const messagingPlugins: readonly Plugin<any>[] = [scheduledMessages, findReply, silenceUsers, repeatMessages, quoter];
