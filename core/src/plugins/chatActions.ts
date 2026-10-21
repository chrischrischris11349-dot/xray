/**
 * Plugins for replying, editing, deleting and hiding messages, built on
 * Discord's own actions (pending replies, start-edit, delete) so the result
 * is exactly what Discord's buttons would do.
 */
import { dispatch } from "../api/flux";
import { menu } from "../api/menus";
import { MESSAGE_PATH } from "../api/requests";
import { currentChannelId, messageActions, myId, navigate, stores } from "../discord";
import { confirmAction, copyText, promptText, showDialog } from "../ui/dialog";
import { definePlugin, type Plugin } from "./types";

const ROW = /^chat-messages-(\d+)-(\d+)$/;
/** Discord's flag for a message that doesn't notify anyone (the @silent prefix). */
const SUPPRESS_NOTIFICATIONS = 1 << 12;

function channelMessages(channelId: string): any[] {
  const collection = stores.messages?.getMessages?.(channelId);
  return collection?.toArray?.() ?? collection?._array ?? [];
}

function startReply(channelId: string, message: any): void {
  const channel = stores.channels?.getChannel?.(channelId);
  if (!channel || !message) return;
  void dispatch({ type: "CREATE_PENDING_REPLY", channel, message, shouldMention: true, showMentionToggle: channel.guild_id != null });
}

function startEdit(channelId: string, message: any): void {
  messageActions()?.startEditMessage?.(channelId, message.id, message.content);
}

/** The message a chat row shows, from its `chat-messages-<channel>-<message>` id. */
function rowMessage(element: Element | null): { channelId: string; message: any } | null {
  const row = element?.closest('li[id^="chat-messages-"]');
  const ids = row && ROW.exec(row.id);
  if (!ids) return null;
  const message = stores.messages?.getMessage?.(ids[1], ids[2]);
  return message ? { channelId: ids[1], message } : null;
}

const isMine = (message: any) => !!message && message.author?.id === myId();

const silentTyping = definePlugin({
  id: "silentTyping",
  name: "Silent Typing",
  description: "Nobody sees “is typing…” while you type.",
  category: "Privacy",
  impact: "light",
  impactReason: "Drops one Discord action as you type",
  needsReload: false,
  enabledByDefault: false,
  options: {
    dms: { type: "boolean", label: "Also in DMs", default: true },
  },
  start(ctx) {
    const inDms = ctx.options.dms;
    // Discord reports typing by dispatching TYPING_START_LOCAL; dropping it stops the request.
    ctx.intercept((action) => {
      if (action.type !== "TYPING_START_LOCAL") return;
      if (!inDms && !stores.channels?.getChannel?.(action.channelId)?.guild_id) return;
      return true;
    });
  },
});

const noReplyMention = definePlugin({
  id: "noReplyMention",
  name: "No Reply Ping",
  description: "Replies start with the @ mention switched off. You can still switch it on per reply.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs when you start a reply",
  needsReload: false,
  enabledByDefault: false,
  options: {
    exceptions: { type: "list", label: "Still ping these people", description: "User IDs, one per line.", default: [] },
  },
  start(ctx) {
    const exceptions = new Set(ctx.options.exceptions);
    ctx.intercept((action) => {
      if (action.type === "CREATE_PENDING_REPLY" && !exceptions.has(action.message?.author?.id)) action.shouldMention = false;
    });
  },
});

const silentMessages = definePlugin({
  id: "silentMessages",
  name: "Silent Messages",
  description: "Every message you send is silent, as if you'd typed @silent: no push or desktop notifications for anyone.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs when you send a message",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    ctx.onApiRequest(["POST"], MESSAGE_PATH, ({ body }) => {
      if (body && typeof body === "object" && "content" in body) body.flags = (body.flags ?? 0) | SUPPRESS_NOTIFICATIONS;
    });
  },
});

const replyKeys = definePlugin({
  id: "replyKeys",
  name: "Reply Keys",
  description: "Ctrl+↑/↓ picks a message to reply to; Ctrl+Shift+↑/↓ picks one of yours to edit.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs on those keys",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    let channel = "";
    let replyIndex = -1;
    let editIndex = -1;
    const reset = () => {
      replyIndex = editIndex = -1;
    };
    ctx.onAction("DELETE_PENDING_REPLY", reset);
    ctx.onAction("CHANNEL_SELECT", reset);
    ctx.onAction("MESSAGE_END_EDIT", reset);
    ctx.onKey((event) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return false;
      const id = currentChannelId();
      if (!id) return false;
      if (id !== channel) {
        channel = id;
        reset();
      }
      const up = event.key === "ArrowUp";
      const all = channelMessages(id);
      const list = event.shiftKey ? all.filter(isMine) : all;
      if (!list.length) return false;
      // Index 0 is the newest message.
      const current = event.shiftKey ? editIndex : replyIndex;
      const next = Math.min(list.length - 1, Math.max(0, current + (up ? 1 : -1)));
      const message = list[list.length - 1 - next];
      if (event.shiftKey) {
        editIndex = next;
        startEdit(id, message);
      } else {
        replyIndex = next;
        startReply(id, message);
      }
      return true;
    });
  },
});

const clickActions = definePlugin({
  id: "messageClickActions",
  name: "Double-Click Messages",
  description: "Double-click your message to edit it, or someone else's to reply.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs when you double-click a message",
  needsReload: false,
  enabledByDefault: false,
  options: {
    deleteWithBackspace: {
      type: "boolean",
      label: "Hold Backspace and click to delete",
      description: "Deletes your own message straight away, without asking.",
      default: false,
    },
  },
  start(ctx) {
    const skip = (target: EventTarget | null) =>
      !(target instanceof Element) || !!target.closest('a, button, input, textarea, [contenteditable="true"], [role="button"], img, video');
    const onDoubleClick = (event: MouseEvent) => {
      if (skip(event.target)) return;
      const found = rowMessage(event.target as Element);
      if (!found) return;
      window.getSelection()?.removeAllRanges();
      if (isMine(found.message)) startEdit(found.channelId, found.message);
      else startReply(found.channelId, found.message);
    };
    window.addEventListener("dblclick", onDoubleClick, true);
    ctx.onStop(() => window.removeEventListener("dblclick", onDoubleClick, true));
    if (!ctx.options.deleteWithBackspace) return;
    let held = false;
    const editing = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, textarea, [contenteditable="true"]');
    const down = (event: KeyboardEvent) => {
      if (event.key === "Backspace" && !editing(event.target)) held = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Backspace") held = false;
    };
    const click = (event: MouseEvent) => {
      if (!held || skip(event.target)) return;
      const found = rowMessage(event.target as Element);
      if (!found || !isMine(found.message)) return;
      event.preventDefault();
      event.stopPropagation();
      messageActions()?.deleteMessage?.(found.channelId, found.message.id);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("click", click, true);
    ctx.onStop(() => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("click", click, true);
    });
  },
});

const silentEdit = definePlugin({
  id: "silentEdit",
  name: "Silent Edit & Delete",
  description: "Right-click your message: edit it without the “(edited)” tag, or blank it before deleting so message loggers keep nothing.",
  category: "Privacy",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      if (!isMine(message)) return;
      const channelId: string = message.channel_id;
      const latest = channelMessages(channelId).at(-1)?.id === message.id;
      items.push(
        menu.group(
          latest
            ? menu.item({
                id: "silent-edit",
                label: "Edit silently",
                subtext: "No “(edited)” tag",
                action: async () => {
                  const text = await promptText({ title: "Edit silently", value: message.content, confirm: "Send", multiline: true });
                  if (text === null || !text.trim() || text === message.content) return;
                  const actions = messageActions();
                  // A fresh message carries no edit tag. Only offered on your latest message, so its place doesn't change.
                  await actions?.sendMessage?.(channelId, { content: text, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, true, {});
                  actions?.deleteMessage?.(channelId, message.id);
                },
              })
            : null,
          menu.item({
            id: "silent-delete",
            label: "Delete silently",
            subtext: "Blanks it first",
            color: "danger",
            action: async () => {
              if (!(await confirmAction("Delete silently?", "The message is blanked, then deleted. This can't be undone.", "Delete", true))) return;
              const actions = messageActions();
              await actions?.editMessage?.(channelId, message.id, { content: "​" });
              window.setTimeout(() => actions?.deleteMessage?.(channelId, message.id), 400);
            },
          }),
        ),
      );
    });
  },
});

/** A message record as plain JSON, for reading. */
function rawJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[repeat]";
        seen.add(v);
      }
      return v;
    },
    2,
  );
}

const viewRaw = definePlugin({
  id: "viewRaw",
  name: "View Raw",
  description: "Right-click a message to see or copy its raw text and data.",
  category: "Developer",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      if (!message) return;
      items.push(
        menu.group(
          menu.item({ id: "copy-raw", label: "Copy raw text", action: () => copyText(message.content ?? "") }),
          menu.item({
            id: "view-raw",
            label: "View raw",
            action: () => showDialog({ title: "Raw message", code: rawJson(message) }),
          }),
        ),
      );
    });
  },
});

const hideMessages = definePlugin({
  id: "hideMessages",
  name: "Hide Messages",
  description: "Right-click a message to hide it until you restart xray.",
  category: "Chat",
  impact: "light",
  impactReason: "Checks new message rows as they appear",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    const hidden = new Set<string>();
    ctx.css('li[data-xray-hidden] { display: none !important; }');
    const apply = (row: Element) => {
      const ids = ROW.exec(row.id);
      if (ids && hidden.has(ids[2])) row.setAttribute("data-xray-hidden", "");
    };
    ctx.watch('li[id^="chat-messages-"]', apply);
    ctx.menu("message", (items, { message }) => {
      if (!message) return;
      items.push(
        menu.item({
          id: "hide-message",
          label: "Hide message",
          action: () => {
            hidden.add(message.id);
            document.querySelectorAll(`li[id$="-${message.id}"]`).forEach(apply);
          },
        }),
      );
    });
    ctx.command("Show hidden messages", "Bring back everything Hide Messages hid", () => {
      hidden.clear();
      document.querySelectorAll("li[data-xray-hidden]").forEach((row) => row.removeAttribute("data-xray-hidden"));
    });
    ctx.onStop(() => document.querySelectorAll("li[data-xray-hidden]").forEach((row) => row.removeAttribute("data-xray-hidden")));
  },
});

const quickMessages = definePlugin({
  id: "quickMessages",
  name: "Saved Replies",
  description: "Messages you send often, one search away: Ctrl+K, type part of one, Enter sends it here.",
  category: "Chat",
  impact: "light",
  impactReason: "Nothing runs until you pick one",
  needsReload: false,
  enabledByDefault: true,
  options: {
    messages: { type: "list", label: "Saved replies", description: "One per line.", default: [] },
  },
  start(ctx) {
    for (const text of ctx.options.messages) {
      ctx.command(`Send “${text.length > 48 ? text.slice(0, 47) + "…" : text}”`, "Saved reply, sent to this channel", () => {
        const channelId = currentChannelId();
        if (channelId) messageActions()?.sendMessage?.(channelId, { content: text, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, true, {});
      });
    }
  },
});

const jumpToFirst = definePlugin({
  id: "jumpToFirst",
  name: "Jump to First Message",
  description: "Right-click a channel (or use Ctrl+K) to jump to the very first message in it.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    // A message id is a timestamp, and so is the channel's id: jumping to the channel's own id lands on its first messages.
    const jump = (channel: any) => channel && navigate(`/channels/${channel.guild_id ?? "@me"}/${channel.id}/${channel.id}`);
    ctx.menu(["channel-context", "thread-context", "gdm-context"], (items, { channel }) => {
      if (channel) items.push(menu.item({ id: "jump-first", label: "Jump to first message", action: () => jump(channel) }));
    });
    ctx.command("Jump to the first message", "In the channel you're looking at", () => {
      const id = currentChannelId();
      if (id) jump(stores.channels?.getChannel?.(id));
    });
  },
});

const revealSpoilers = definePlugin({
  id: "revealSpoilers",
  name: "Reveal Spoilers",
  description: "Ctrl+click a spoiler to reveal every spoiler in that message; Ctrl+Shift+click for the whole chat.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs on Ctrl+click",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const HIDDEN = '[class*="spoilerContent_"][class*="hidden_"], [class*="spoilerContainer_"][class*="hidden_"]';
    const click = (event: MouseEvent) => {
      if (!event.ctrlKey || !(event.target instanceof Element) || !event.target.closest('[class*="spoiler"]')) return;
      const scope = event.shiftKey ? document.querySelector('[class*="messagesWrapper_"]') : event.target.closest('li[id^="chat-messages-"]');
      if (!scope) return;
      window.setTimeout(() => scope.querySelectorAll<HTMLElement>(HIDDEN).forEach((spoiler) => spoiler.click()));
    };
    window.addEventListener("click", click, true);
    ctx.onStop(() => window.removeEventListener("click", click, true));
  },
});

export const chatActionPlugins: readonly Plugin<any>[] = [
  silentEdit,
  silentTyping,
  noReplyMention,
  silentMessages,
  replyKeys,
  clickActions,
  viewRaw,
  hideMessages,
  quickMessages,
  jumpToFirst,
  revealSpoilers,
];
