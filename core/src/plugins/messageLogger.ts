/**
 * Message Logger: messages deleted while you have xray open stay where they
 * were, marked as deleted, and edited messages keep their earlier versions
 * underneath. Nothing is saved to disk; it all goes when you restart.
 *
 * Deletes: Discord removes a message by dispatching MESSAGE_DELETE. The
 * logger drops that action (so the message stays in Discord's store and on
 * screen) and marks the message's row. Edits: before MESSAGE_UPDATE reaches
 * the store, the logger keeps the old text and shows it under the message.
 */
import { stores, myId } from "../discord";
import { definePlugin } from "./types";

const ROW = /^chat-messages-(\d+)-(\d+)$/;
const MAX_TRACKED = 3000;

/** Insertion-ordered, so the oldest entries go first once it's full. */
function remember<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_TRACKED) map.delete(map.keys().next().value!);
}

export default definePlugin({
  id: "messageLogger",
  name: "Message Logger",
  description: "Deleted messages stay visible, marked in red, and edited ones show what they said before. Until you restart.",
  category: "Chat",
  impact: "light",
  impactReason: "Remembers deleted and edited messages in memory",
  needsReload: false,
  enabledByDefault: false,
  options: {
    deletes: { type: "boolean", label: "Keep deleted messages", default: true },
    edits: { type: "boolean", label: "Show edit history", default: true },
    ignoreSelf: { type: "boolean", label: "Ignore your own messages", default: true },
    ignoreBots: { type: "boolean", label: "Ignore bots", default: false },
  },
  start(ctx) {
    const { deletes, edits, ignoreSelf, ignoreBots } = ctx.options;
    const deleted = new Set<string>();
    const history = new Map<string, string[]>();

    const ignored = (message: any) =>
      !message || (ignoreSelf && message.author?.id === myId()) || (ignoreBots && message.author?.bot);

    ctx.css(`
      li[data-xray-deleted] [class*="messageContent_"],
      li[data-xray-deleted] [class*="messageContent_"] * { color: #ff9c8f !important; }
      li[data-xray-deleted] [class*="messageContent_"]:not(:empty) {
        background: rgba(255, 90, 90, 0.1) !important;
        box-shadow: inset 0 0 0 1px rgba(255, 90, 90, 0.22) !important;
      }
      li[data-xray-deleted] :is([class*="imageWrapper_"], [class*="embedFull_"], video) { opacity: 0.55; }
      li[data-xray-deleted] [class*="contents_"] > [class*="messageContent_"]::after {
        content: "deleted";
        margin-left: 8px;
        font: 500 10px "Cascadia Mono", Consolas, monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ff7a66;
      }
      .xray-edits { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
      .xray-edit {
        font-size: 0.875em;
        line-height: 1.35;
        color: var(--text-muted, #9a9ca5);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        opacity: 0.85;
      }
      .xray-edit::before {
        content: "before";
        margin-right: 8px;
        font: 500 10px "Cascadia Mono", Consolas, monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.7;
      }
    `);

    const decorate = (row: Element) => {
      const ids = ROW.exec(row.id);
      if (!ids) return;
      const id = ids[2];
      if (deleted.has(id)) row.setAttribute("data-xray-deleted", "");
      const old = history.get(id);
      if (!old?.length) return;
      const content = row.querySelector('[class*="contents_"] > [class*="messageContent_"]');
      if (!content) return;
      let box = row.querySelector(".xray-edits");
      if (!box) {
        box = document.createElement("div");
        box.className = "xray-edits";
        content.insertAdjacentElement("afterend", box);
      }
      // Text only: Discord's markdown isn't rendered here, so nothing in it can run.
      box.replaceChildren(
        ...old.map((text) => {
          const line = document.createElement("div");
          line.className = "xray-edit";
          line.textContent = text;
          return line;
        }),
      );
    };
    const redraw = (messageId: string) =>
      window.setTimeout(() => document.querySelectorAll(`li[id$="-${messageId}"]`).forEach(decorate), 60);

    ctx.watch('li[id^="chat-messages-"]', decorate);

    ctx.intercept((action) => {
      if (deletes && action.type === "MESSAGE_DELETE") {
        const message = stores.messages?.getMessage?.(action.channelId, action.id);
        if (ignored(message)) return;
        deleted.add(action.id);
        if (deleted.size > MAX_TRACKED) deleted.delete(deleted.values().next().value!);
        redraw(action.id);
        return true;
      }
      if (deletes && action.type === "MESSAGE_DELETE_BULK" && Array.isArray(action.ids)) {
        const keep = action.ids.filter((id: string) => !ignored(stores.messages?.getMessage?.(action.channelId, id)));
        keep.forEach((id: string) => {
          deleted.add(id);
          redraw(id);
        });
        action.ids = action.ids.filter((id: string) => !keep.includes(id));
        return action.ids.length === 0;
      }
      if (edits && action.type === "MESSAGE_UPDATE") {
        const update = action.message;
        if (!update?.id || typeof update.content !== "string") return;
        const before = stores.messages?.getMessage?.(update.channel_id, update.id);
        if (ignored(before) || typeof before?.content !== "string" || before.content === update.content) return;
        remember(history, update.id, [...(history.get(update.id) ?? []), before.content]);
        redraw(update.id);
      }
    });

    ctx.onStop(() => {
      document.querySelectorAll("li[data-xray-deleted]").forEach((row) => row.removeAttribute("data-xray-deleted"));
      document.querySelectorAll(".xray-edits").forEach((box) => box.remove());
    });
  },
});
