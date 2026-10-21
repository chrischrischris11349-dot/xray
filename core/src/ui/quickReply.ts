/**
 * Quick reply: a small bubble in the corner with your unread DM count. Click
 * it for your recent DMs, pick one to read its latest messages, and reply
 * without leaving the channel you're in. Replies go through Discord's own
 * sendMessage, exactly like its message box.
 *
 * Cost: while closed, only the unread count is kept current (on Discord's
 * read-state changes, batched). The conversation listens for new messages
 * only while it's open.
 */
import { loggedIn, messageActions, navigate, onStoresChanged, safeImage, stores, userView, whenStore } from "../discord";
import { h } from "./dom";
import type { Feature } from "./features";
import { fromXray, onKey, uiRoot } from "./root";

const CHAT = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>`;
const BACK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>`;
const OPEN = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>`;
const SEND = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`;

const MAX_DMS = 30;
const MAX_MESSAGES = 40;
/** Discord's message length limit. */
const MAX_LENGTH = 2000;
const BATCH_MS = 250;
const DM = 1;

let started = false;
let bubble: HTMLElement | undefined;
let badge: HTMLElement | undefined;
let popover: HTMLElement | undefined;
let messagesEl: HTMLElement | undefined;
let replyInput: HTMLInputElement | undefined;
let sendButton: HTMLButtonElement | undefined;
let errorEl: HTMLElement | undefined;
let channelId: string | null = null;
let scrolledFor: string | null = null;
let sending = false;
let stopBadgeWatch: (() => void) | undefined;
let stopOpenWatch: (() => void) | undefined;
let badgeTimer: number | undefined;
let refreshTimer: number | undefined;
const fetched = new Set<string>();

export const quickReply: Feature = {
  id: "quickReply",
  name: "Quick reply",
  description: "A bubble with your unread DMs. Reply without leaving the channel you're in.",
  start,
  stop,
};

onKey((event) => {
  if (!popover) return false;
  if (event.key === "Escape") {
    close();
    return true;
  }
  if (event.key === "Enter" && !event.shiftKey && replyInput && event.composedPath().includes(replyInput)) {
    void send();
    return true;
  }
  return false;
});

function start(): void {
  if (started) return;
  started = true;
  badge = h("span", { class: "badge" });
  bubble = h("button", { class: "bubble", attrs: { type: "button", "aria-label": "Quick reply" }, trustedHtml: CHAT, on: { click: toggle } }, badge);
  uiRoot().append(bubble);
  window.addEventListener("mousedown", closeOnOutsideClick, true);
  updateBadge();
  // The read-state store loads as Discord starts; watch it once it exists.
  whenStore("ReadStateStore", () => {
    if (!started || stopBadgeWatch) return;
    stopBadgeWatch = onStoresChanged([stores.readStates, stores.privateChannelSort], scheduleBadge);
    updateBadge();
  });
}

function stop(): void {
  started = false;
  close();
  stopBadgeWatch?.();
  stopBadgeWatch = undefined;
  window.removeEventListener("mousedown", closeOnOutsideClick, true);
  bubble?.remove();
  bubble = badge = undefined;
}

function scheduleBadge(): void {
  if (badgeTimer === undefined) badgeTimer = window.setTimeout(updateBadge, BATCH_MS);
}

function dmIds(): string[] {
  try {
    return stores.privateChannelSort?.getPrivateChannelIds?.() ?? [];
  } catch {
    return [];
  }
}

function unread(id: string): number {
  try {
    return stores.readStates?.getMentionCount?.(id) ?? 0;
  } catch {
    return 0;
  }
}

function updateBadge(): void {
  badgeTimer = undefined;
  if (!bubble || !badge) return;
  // Only shown once you're logged in.
  bubble.style.display = loggedIn() ? "" : "none";
  const total = dmIds().reduce((sum, id) => sum + unread(id), 0);
  badge.textContent = total > 99 ? "99+" : String(total);
  badge.style.display = total > 0 ? "" : "none";
  bubble.setAttribute("aria-label", total ? `Quick reply, ${total} unread` : "Quick reply");
  if (popover && !channelId) renderList();
}

function closeOnOutsideClick(event: MouseEvent): void {
  if (popover && !fromXray(event)) close();
}

function toggle(): void {
  if (popover) close();
  else open();
}

function open(): void {
  popover = h("div", { class: "qr", attrs: { role: "dialog", "aria-label": "Direct messages" } });
  uiRoot().append(popover);
  channelId = null;
  renderList();
}

function close(): void {
  stopOpenWatch?.();
  stopOpenWatch = undefined;
  popover?.remove();
  popover = messagesEl = replyInput = sendButton = errorEl = undefined;
  channelId = null;
}

interface DmView {
  id: string;
  name: string;
  avatar: string | null;
}

function dmView(id: string): DmView | null {
  const channel = stores.channels?.getChannel?.(id);
  if (!channel) return null;
  const recipients: string[] = channel.recipients ?? [];
  if (channel.type === DM) {
    const user = recipients[0] ? userView(recipients[0]) : null;
    return { id, name: user?.name ?? "Direct message", avatar: user?.avatar ?? null };
  }
  const name = channel.name || recipients.map((r) => userView(r)?.name ?? "").filter(Boolean).join(", ") || "Group";
  const icon = channel.icon ? safeImage(`https://cdn.discordapp.com/channel-icons/${id}/${channel.icon}.webp?size=64`) : null;
  return { id, name, avatar: icon };
}

function avatar(url: string | null, name: string, className = "avatar"): HTMLElement {
  if (url) return h("img", { class: className, attrs: { src: url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } });
  return h("span", { class: className, text: name.slice(0, 1).toUpperCase() });
}

/** Turns Discord's message markup into plain readable text. */
function readable(text: string): string {
  return text
    .replace(/<@!?(\d+)>/g, (_, id: string) => `@${userView(id)?.name ?? "someone"}`)
    .replace(/<#(\d+)>/g, (_, id: string) => `#${stores.channels?.getChannel?.(id)?.name ?? "channel"}`)
    .replace(/<a?:(\w+):\d+>/g, ":$1:");
}

function summarize(message: any): string {
  if (typeof message?.content === "string" && message.content) return readable(message.content);
  if (message?.attachments?.length) return "Sent an attachment";
  if (message?.stickerItems?.length) return "Sent a sticker";
  if (message?.embeds?.length) return "Sent a link";
  return "";
}

function renderList(): void {
  if (!popover) return;
  const ids = dmIds().slice(0, MAX_DMS);
  const total = ids.reduce((sum, id) => sum + unread(id), 0);
  const rows = ids
    .map((id) => dmView(id))
    .filter((view): view is DmView => view !== null)
    .map((view) => {
      const count = unread(view.id);
      let preview = "";
      try {
        preview = summarize(stores.messages?.getLastMessage?.(view.id));
      } catch {
        // not loaded yet
      }
      const name = h("div", { class: "dm-name", text: view.name });
      if (count) name.style.fontWeight = "700";
      return h(
        "button",
        { class: "dm", attrs: { type: "button" }, on: { click: () => openConversation(view.id) } },
        avatar(view.avatar, view.name),
        h("span", { class: "dm-text" }, name, preview ? h("div", { class: "dm-preview", text: preview }) : null),
        count ? h("span", { class: "count", text: count > 99 ? "99+" : String(count) }) : null,
      );
    });
  popover.replaceChildren(
    h("div", { class: "qr-head" }, h("span", { class: "qr-title", text: "Messages" }), h("span", { class: "label", text: total ? `${total} unread` : "All read" })),
    h("div", { class: "qr-list" }, ...(rows.length ? rows : [h("div", { class: "empty", text: "No DMs yet." })])),
  );
}

function openConversation(id: string): void {
  if (!popover) return;
  channelId = id;
  scrolledFor = null;
  const view = dmView(id);
  const name = view?.name ?? "Direct message";
  messagesEl = h("div", { class: "msgs" });
  errorEl = h("div", { class: "note error" });
  replyInput = h("input", { attrs: { type: "text", maxlength: String(MAX_LENGTH), placeholder: `Reply to ${name}`, "aria-label": `Reply to ${name}` }, on: { input: updateSendButton } });
  sendButton = h("button", { class: "send", attrs: { type: "button", "aria-label": "Send" }, trustedHtml: SEND, on: { click: () => void send() } });
  popover.replaceChildren(
    h(
      "div",
      { class: "qr-head" },
      h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Back to messages" }, trustedHtml: BACK, on: { click: backToList } }),
      avatar(view?.avatar ?? null, name, "avatar small"),
      h("span", { class: "qr-title", text: name }),
      h("button", {
        class: "icon-btn",
        attrs: { type: "button", "aria-label": "Open in Discord", title: "Open in Discord" },
        trustedHtml: OPEN,
        on: {
          click: () => {
            navigate(`/channels/@me/${id}`);
            close();
          },
        },
      }),
    ),
    messagesEl,
    h("div", { class: "reply" }, h("div", { class: "reply-field" }, replyInput, sendButton), errorEl),
  );
  updateSendButton();
  renderMessages();
  stopOpenWatch?.();
  stopOpenWatch = onStoresChanged([stores.messages], scheduleRefresh);
  replyInput.focus();
}

function backToList(): void {
  stopOpenWatch?.();
  stopOpenWatch = undefined;
  channelId = null;
  messagesEl = replyInput = sendButton = errorEl = undefined;
  renderList();
}

function scheduleRefresh(): void {
  if (refreshTimer === undefined) refreshTimer = window.setTimeout(renderMessages, BATCH_MS / 2);
}

function renderMessages(): void {
  refreshTimer = undefined;
  if (!messagesEl || !channelId) return;
  const id = channelId;
  const collection = stores.messages?.getMessages?.(id);
  const all: any[] = collection?.toArray?.() ?? collection?._array ?? [];
  // Not loaded yet: ask Discord to load it, once, the way opening the DM would.
  if (!stores.messages?.hasPresent?.(id) && !fetched.has(id)) {
    fetched.add(id);
    try {
      messageActions()?.fetchMessages?.({ channelId: id, limit: MAX_MESSAGES });
    } catch {
      // shown as empty below
    }
  }
  const me = stores.users?.getCurrentUser?.()?.id;
  const group = stores.channels?.getChannel?.(id)?.type !== DM;
  let lastAuthor = "";
  const items: HTMLElement[] = [];
  for (const message of all.slice(-MAX_MESSAGES)) {
    const text = summarize(message);
    if (!text) continue;
    const author = message.author?.id ?? "";
    const mine = author === me;
    if (group && !mine && author !== lastAuthor) {
      items.push(h("div", { class: "msg-author", text: message.author?.globalName || message.author?.username || "" }));
    }
    lastAuthor = author;
    items.push(h("div", { class: mine ? "msg mine" : "msg", text }));
  }
  // Stay pinned to the newest message, unless you've scrolled up to read.
  const firstShow = scrolledFor !== id && items.length > 0;
  const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 40;
  messagesEl.replaceChildren(...(items.length ? items : [h("div", { class: "empty", text: "Loading messages…" })]));
  if (firstShow || atBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (firstShow) scrolledFor = id;
  }
}

function updateSendButton(): void {
  if (sendButton && replyInput) sendButton.disabled = sending || !replyInput.value.trim();
}

async function send(): Promise<void> {
  if (!replyInput || !channelId || sending) return;
  const content = replyInput.value.trim();
  if (!content) return;
  const actions = messageActions();
  if (!actions) {
    if (errorEl) errorEl.textContent = "Discord's message sending wasn't found, so this can't send.";
    return;
  }
  sending = true;
  updateSendButton();
  if (errorEl) errorEl.textContent = "";
  try {
    await actions.sendMessage(channelId, { content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, true, {});
    if (replyInput) replyInput.value = "";
  } catch (err) {
    if (errorEl) errorEl.textContent = "Couldn't send that. Try again, or open the chat in Discord.";
    console.warn("xray: quick reply failed", err);
  } finally {
    sending = false;
    updateSendButton();
  }
}
