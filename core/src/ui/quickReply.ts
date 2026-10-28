/**
 * Quick reply: a small bubble in the corner with your unread DM count. Click
 * it for your recent DMs, pick one to read its latest messages, and reply
 * without leaving the channel you're in. Replies go through Discord's own
 * sendMessage, exactly like its message box.
 *
 * Cost: unread changes are batched; the closed bubble retains a bounded
 * session cache from delivered events. Conversation rendering only runs open.
 */
import { currentChannelId, loggedIn, messageActions, myId, navigate, onStoresChanged, safeImage, stores, userView, whenStore } from "../discord";
import { h } from "./dom";
import { messageVisualKey, renderChatMessage } from "./chatMessage";
import { sessionMessageView,onLocalMessageViewChanged } from "./localMessageView";
import { reconcileChildren, StableRows } from "./reconcile";
import { ImageDrafts } from "./imageDrafts";
import { sendMiniChatMessage } from "./imageUpload";
import { pluginState, save } from "../settings";
import { makeFloatingPanel } from "./floatingPanel";
import { clampBubble } from "./bubblePosition";
import { icon } from "./icons";
import type { Feature } from "./features";
import { fromXray, onKey, uiRoot } from "./root";
import { miniMenu, closeMiniMenu, miniMenuOpen } from "./miniMenu";
import { messageMenu } from "./miniChatActions";
import { copyText, showDialog } from "./dialog";
import { showPhotoMetadata } from "./photoMetadata";
import { showProfile } from "./profile";
import { intercept, onAction } from "../api/flux";
import { onTimeFormatChanged } from "../time";
import { DeletedMessages, isDeletedMessage } from "./deletedMessages";

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
let attachmentTray: HTMLElement | undefined;
let attachButton: HTMLButtonElement | undefined;
let replyTray: HTMLElement | undefined, typingEl: HTMLElement | undefined;
let stopTypingWatch: (() => void) | undefined;
let stopAccountWatch: (() => void) | undefined;
let draftAccount: string | undefined;
const drafts = new ImageDrafts();
let channelId: string | null = null;
let scrolledFor: string | null = null;
let sending = false;
let sendingChannel: string | null = null;
let stopBadgeWatch: (() => void) | undefined;
let stopEditWatch:(()=>void)|undefined;
let stopOpenWatch: (() => void) | undefined;
let stopTimeWatch: (() => void) | undefined;
let badgeTimer: number | undefined;
let refreshTimer: number | undefined;
let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined;
let suppressClick = false;
let bubbleFrame = 0, bubbleNext: { x: number; y: number } | undefined;
let stopFloating: (() => void) | undefined;
function flushBubble(): void { cancelAnimationFrame(bubbleFrame); bubbleFrame = 0; if (bubbleNext) { moveBubble(bubbleNext.x, bubbleNext.y); bubbleNext = undefined; } }
const fetched = new Set<string>();
const messageRows = new StableRows();
const deletedMessages = new DeletedMessages();

// Register before optional logger plugins can consume a deletion action. Capture
// visible messages even while the bubble is closed; stopped/logged-out sessions retain nothing.
intercept(action => {
  if (!started) return;
  if (deletedMessages.handle(action,(channel,id)=>stores.messages?.getMessage?.(channel,id))) scheduleRefresh();
});

export const quickReply: Feature = {
  id: "quickReply",
  name: "Quick reply",
  description: "A bubble with your unread DMs. Reply without leaving the channel you're in.",
  start,
  stop,
};

onKey((event) => {
  if (bubble && event.altKey && event.composedPath().includes(bubble) && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    const rect = bubble.getBoundingClientRect();
    moveBubble(rect.left + (event.key === "ArrowLeft" ? -12 : event.key === "ArrowRight" ? 12 : 0), rect.top + (event.key === "ArrowUp" ? -12 : event.key === "ArrowDown" ? 12 : 0), true);
    return true;
  }
  if (!popover) return false;
  if (miniMenuOpen()) return false;
  if (event.key === "Escape") {
    close();
    return true;
  }
  if (event.key === "Enter" && !event.isComposing && !event.shiftKey && replyInput && event.composedPath().includes(replyInput)) {
    void send();
    return true;
  }
  return false;
});

function start(): void {
  if (started) return;
  started = true;
  draftAccount = myId();
  const accountChanged = () => { if (draftAccount !== myId()) { close(); resetDrafts(); deletedMessages.clear(); draftAccount = myId(); } };
  const stopLogout = onAction("LOGOUT", () => { close(); resetDrafts(); deletedMessages.clear(); draftAccount = undefined; });
  const stopConnection = onAction("CONNECTION_OPEN", accountChanged);
  stopAccountWatch = () => { stopLogout(); stopConnection(); };
  badge = h("span", { class: "badge" });
  bubble = h("button", { class: "bubble", attrs: { type: "button", "aria-label": "Quick reply", title: "Messages · drag to move, or focus and use Alt + arrow keys" }, trustedHtml: icon("messageCircle", 24), on: { click: toggle } }, badge);
  uiRoot().append(bubble);
  const position = pluginState("quickReplyBubble").data;
  moveBubble(Number(position?.x ?? window.innerWidth - 76), Number(position?.y ?? window.innerHeight - 148));
  window.addEventListener("resize", constrainBubble);
  bubble.addEventListener("click", event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  bubble.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const rect = bubble!.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    bubble!.setPointerCapture(event.pointerId);
  });
  bubble.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true;
    if (drag.moved) { bubble!.classList.add("dragging"); bubbleNext = { x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y }; if (!bubbleFrame) bubbleFrame = requestAnimationFrame(flushBubble); }
  });
  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    flushBubble();
    const moved = drag.moved;
    drag = undefined; bubble!.classList.remove("dragging");
    if (moved) { const rect = bubble!.getBoundingClientRect(); moveBubble(rect.left, rect.top, true); suppressClick = true; window.setTimeout(() => { suppressClick = false; }, 0); }
    if (bubble!.hasPointerCapture(event.pointerId)) bubble!.releasePointerCapture(event.pointerId);
  };
  bubble.addEventListener("pointerup", endDrag);
  bubble.addEventListener("pointercancel", endDrag);
  bubble.addEventListener("lostpointercapture", endDrag);
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
  deletedMessages.clear();
  stopAccountWatch?.(); stopAccountWatch = undefined;
  close();
  stopBadgeWatch?.();
  stopBadgeWatch = undefined;
  clearTimeout(badgeTimer); badgeTimer = undefined;
  window.removeEventListener("mousedown", closeOnOutsideClick, true);
  window.removeEventListener("resize", constrainBubble);
  flushBubble(); drag = undefined;
  resetDrafts();
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
  bubble.setAttribute("aria-label", `${total ? `Quick reply, ${total} unread` : "Quick reply"}. Drag to move, or use Alt and arrow keys.`);
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
  positionPopover();
  channelId = null;
  renderList();
  const rect = popover.getBoundingClientRect();
  stopFloating = makeFloatingPanel(popover, { key: "quickReplyWindow", header: ".qr-head", initial: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } });
}

function moveBubble(x: number, y: number, persist = false): void {
  if (!bubble) return;
  const point = clampBubble(x, y, window.innerWidth, window.innerHeight);
  if (drag?.moved && !persist) {
    // Keep pointer movement on the compositor; commit layout once on release.
    bubble.style.transform = `translate3d(${point.x - drag.left}px,${point.y - drag.top}px,0)`;
    return;
  }
  bubble.style.transform = "";
  Object.assign(bubble.style, { left: `${point.x}px`, top: `${point.y}px`, right: "auto", bottom: "auto" });
  if (persist) { pluginState("quickReplyBubble").data = point; save(); }
  positionPopover();
}
function constrainBubble(): void {
  if (!bubble) return;
  const rect = bubble.getBoundingClientRect(); moveBubble(rect.left, rect.top);
}
/** Discoverable positions alongside dragging and Alt+arrow movement. */
export function bubblePositionControl():HTMLElement {
 const choose=h("select",{class:"dialog-input",attrs:{"aria-label":"Chat bubble position"}},...[["custom","Current / drag freely"],["right","Bottom right"],["left","Bottom left"],["top","Top right"]].map(([value,text])=>h("option",{attrs:{value},text})));
 choose.value="custom";
 choose.addEventListener("change",()=>{if(choose.value==="custom")return;const x=choose.value==="left"?20:innerWidth-76,y=choose.value==="top"?72:innerHeight-148;pluginState("quickReplyBubble").data=clampBubble(x,y,innerWidth,innerHeight);save();moveBubble(x,y);});
 return h("div",{class:"card settings-detail-card"},h("label",{class:"card-title",text:"Chat bubble position"}),choose,h("div",{class:"card-sub",text:"Choose a corner or drag the bubble. Focus it and use Alt + arrows for fine movement. Your position is remembered."}));
}
function positionPopover(): void {
  if (!popover || !bubble || stopFloating) return;
  const rect = bubble.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16), height = Math.min(480, window.innerHeight - 72);
  Object.assign(popover.style, { left: `${Math.max(8, Math.min(rect.left + 56 - width, window.innerWidth - width - 8))}px`,
    top: `${rect.top - height - 12 >= 52 ? rect.top - height - 12 : Math.max(52, Math.min(rect.bottom + 12, window.innerHeight - height - 8))}px`, right: "auto", bottom: "auto", width: `${width}px`, height: `${height}px`, maxHeight: "calc(100vh - 60px)" });
}

function close(): void {
  stopFloating?.(); stopFloating = undefined;
  stopTimeWatch?.(); stopTimeWatch = undefined;
  closeMiniMenu(); stopTypingWatch?.(); stopTypingWatch = undefined;
  clearTimeout(refreshTimer); refreshTimer = undefined;
  messageRows.clear();
  stopOpenWatch?.();
  stopOpenWatch = undefined;stopEditWatch?.();stopEditWatch=undefined;
  popover?.remove();
  popover = messagesEl = replyInput = sendButton = errorEl = attachmentTray = attachButton = undefined;
  replyTray = typingEl = undefined;
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
  if (channel.guild_id) return { id, name: `#${channel.name ?? "channel"}`, avatar: null };
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

function resizeGrip(): HTMLElement {
  return h("button", { class: "panel-resize qr-resize", attrs: { type: "button", "aria-label": "Resize chat panel", title: "Drag to resize · Alt + arrow keys" }, trustedHtml: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 10 10 3M7 10l3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>' });
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
        { class: "dm", attrs: { type: "button" }, on: { click: () => openConversation(view.id), contextmenu: (event: MouseEvent) => conversationMenu(event, view.id) } },
        avatar(view.avatar, view.name),
        h("span", { class: "dm-text" }, name, preview ? h("div", { class: "dm-preview", text: preview }) : null),
        count ? h("span", { class: "count", text: count > 99 ? "99+" : String(count) }) : null,
      );
    });
  popover.replaceChildren(
    h("div", { class: "qr-head", attrs: { tabindex: "0", title: "Drag to move · Alt + arrows to move · Alt + Shift + arrows to resize", "aria-label": "Move or resize chat panel" } }, h("span", { class: "qr-title", text: "Messages" }), h("span", { class: "label", text: total ? `${total} unread` : "All read" }),
      h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Inspect a photo's metadata", title: "Photo metadata" }, trustedHtml: icon("info", 18), on: { click: () => void showPhotoMetadata() } })),
    ...(stores.channels?.getChannel?.(currentChannelId())?.guild_id ? [h("button", { class: "btn ghost qr-current", text: "Open current server channel", on: { click: () => { const id = currentChannelId(); if (id) openConversation(id); } } })] : []),
    h("div", { class: "qr-list" }, ...(rows.length ? rows : [h("div", { class: "empty", text: "No DMs yet." })])), resizeGrip(),
  );
}

function openConversation(id: string): void {
  if (!popover) return;
  closeMiniMenu(); stopTypingWatch?.(); stopTypingWatch = undefined;
  messageRows.clear();
  channelId = id;
  scrolledFor = null;
  const view = dmView(id);
  const name = view?.name ?? "Direct message";
  messagesEl = h("div", { class: "msgs" });
  errorEl = h("div", { class: "note error", attrs: { role: "status" } });
  replyInput = h("input", { attrs: { type: "text", maxlength: String(MAX_LENGTH), placeholder: `Reply to ${name}`, "aria-label": `Reply to ${name}` }, on: { input: (event: Event) => { drafts.get(id).text = (event.currentTarget as HTMLInputElement).value; updateSendButton(); } } });
  replyInput.value = drafts.get(id).text;
  const fileInput = h("input", { attrs: { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp,image/avif", multiple: "", hidden: "", "aria-label": "Choose images" } });
  attachButton = h("button", { class: "icon-btn qr-attach", attrs: { type: "button", "aria-label": "Attach images", title: "Attach images · or paste / drop an image" }, trustedHtml: icon("imagePlus", 19), on: { click: () => fileInput.click() } });
  fileInput.addEventListener("change", () => { stageImages(Array.from(fileInput.files ?? []), id); fileInput.value = ""; });
  attachmentTray = h("div", { class: "qr-draft-images", attrs: { "aria-label": "Images ready to send" } });
  replyTray = h("div", { class: "qr-reply-target", attrs: { "aria-label": "Selected reply" } });
  typingEl = h("div", { class: "qr-typing", attrs: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
  replyInput.addEventListener("paste", event => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) { event.preventDefault(); stageImages(files, id); }
  });
  sendButton = h("button", { class: "send", attrs: { type: "button", "aria-label": "Send" }, trustedHtml: SEND, on: { click: () => void send() } });
  popover.replaceChildren(
    h(
      "div",
      { class: "qr-head", attrs: { tabindex: "0", title: "Drag to move · Alt + arrows to move · Alt + Shift + arrows to resize", "aria-label": "Move or resize chat panel" } },
      h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Back to messages" }, trustedHtml: BACK, on: { click: backToList } }),
      avatar(view?.avatar ?? null, name, "avatar small"),
      h("span", { class: "qr-title", text: name }),
      h("button", {
        class: "icon-btn",
        attrs: { type: "button", "aria-label": "Open in Discord", title: "Open in Discord" },
        trustedHtml: OPEN,
        on: {
          click: () => {
            navigate(`/channels/${stores.channels?.getChannel?.(id)?.guild_id ?? "@me"}/${id}`);
            close();
          },
        },
      }),
    ),
    messagesEl,
    typingEl,
    h("div", { class: "reply" }, replyTray, attachmentTray, h("div", { class: "reply-field" }, attachButton, replyInput, sendButton), fileInput, errorEl), resizeGrip(),
  );
  popover.ondragover = event => { if (event.dataTransfer?.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } };
  popover.ondrop = event => { event.preventDefault(); stageImages(Array.from(event.dataTransfer?.files ?? [])); };
  renderDraftImages();
  renderReplyTarget();
  updateSendButton();
  renderMessages();
  stopOpenWatch?.();
  stopOpenWatch = onStoresChanged([stores.messages], scheduleRefresh);
  stopEditWatch?.();stopEditWatch=onLocalMessageViewChanged(scheduleRefresh);
  stopTimeWatch?.(); stopTimeWatch = onTimeFormatChanged(scheduleRefresh);
  whenStore("TypingStore", store => { if (channelId !== id || !popover) return; stopTypingWatch?.(); stopTypingWatch = onStoresChanged([store], renderTyping); renderTyping(); });
  replyInput.focus();
}

function backToList(): void {
  stopTimeWatch?.(); stopTimeWatch = undefined;
  closeMiniMenu(); stopTypingWatch?.(); stopTypingWatch = undefined;
  stopOpenWatch?.();
  stopOpenWatch = undefined;stopEditWatch?.();stopEditWatch=undefined;
  channelId = null;
  messagesEl = replyInput = sendButton = errorEl = attachmentTray = attachButton = undefined;
  replyTray = typingEl = undefined;
  if (popover) popover.ondragover = popover.ondrop = null;
  renderList();
}

function scheduleRefresh(): void {
  if (!messagesEl || !channelId) return;
  if (refreshTimer === undefined) refreshTimer = window.setTimeout(renderMessages, BATCH_MS / 2);
}

function renderMessages(): void {
  refreshTimer = undefined;
  if (!messagesEl || !channelId) return;
  const id = channelId;
  const collection = stores.messages?.getMessages?.(id);
  const loaded: any[] = collection?.toArray?.() ?? collection?._array ?? [];
  deletedMessages.remember(id,loaded);
  const all = deletedMessages.merge(id,loaded);
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
  const keys = new Set<string>();
  for (const [index, message] of all.slice(-MAX_MESSAGES).entries()) {
    const local=sessionMessageView.get(message);if(local?.hidden)continue;
    const text = local?.content!==undefined?local.content:typeof message.content === "string" && message.content ? readable(message.content) : message.stickerItems?.length ? "Sent a sticker" : "";
    if (!text && !message.attachments?.length && !message.embeds?.length && !isDeletedMessage(message)) continue;
    const author = message.author?.id ?? "";
    const mine = author === me;
    const key = String(message.id ?? index);
    if (group && !mine && author !== lastAuthor) {
      const name = message.author?.globalName || message.author?.username || "";
      keys.add(`author:${key}`);
      items.push(messageRows.get(`author:${key}`, name, () => h("div", { class: "msg-author", text: name })));
    }
    lastAuthor = author;
    keys.add(`message:${key}`);
    items.push(messageRows.get(`message:${key}`, messageVisualKey(message, mine, text), () => {
      const row = renderChatMessage(message, mine, text);
      const menu = (event: MouseEvent) => messageMenu(event, message, selectReply, messageError);
      row.addEventListener("contextmenu", menu);
      row.append(h("div", { class: "qr-msg-actions" }, ...(!isDeletedMessage(message) ? [h("button", { attrs: { type: "button", "aria-label": "Reply to this message", title: "Reply" }, trustedHtml: icon("reply", 15), on: { click: () => selectReply(stores.messages?.getMessage?.(id,message.id) ?? message) } })] : []),
        h("button", { attrs: { type: "button", "aria-label": "Open profile report", title: "Profile report" }, trustedHtml: icon("idCard", 15), on: { click: () => message.author?.id && showProfile(message.author.id,stores.channels?.getChannel?.(id)?.guild_id) } }),
        h("button", { attrs: { type: "button", "aria-label": "Message actions", title: "Message actions · or right-click" }, trustedHtml: icon("ellipsis", 15), on: { click: menu } })));
      return row;
    }));
  }
  // Stay pinned to the newest message, unless you've scrolled up to read.
  const firstShow = scrolledFor !== id && items.length > 0;
  const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 40;
  messageRows.retain(keys);
  reconcileChildren(messagesEl, items.length ? items : [h("div", { class: "empty", text: "Loading messages…" })]);
  if (firstShow || atBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (firstShow) scrolledFor = id;
  }
}

function updateSendButton(): void {
  if (sendButton && replyInput) sendButton.disabled = sending || !channelId || (!replyInput.value.trim() && !drafts.get(channelId).images.length);
  const locked = sendingChannel === channelId && sending;
  if (replyInput) replyInput.disabled = locked;
  if (attachButton) attachButton.disabled = locked;
  if (sendButton) { sendButton.setAttribute("aria-busy", String(locked)); sendButton.title = locked ? "Sending…" : "Send message"; }
}

function stageImages(files: File[], target = channelId): void {
  if (!started || !target || sendingChannel === target || !files.length) return;
  try { drafts.add(target, files); if (target === channelId) { if (errorEl) errorEl.textContent = ""; renderDraftImages(); updateSendButton(); } }
  catch (error) { if (target === channelId && errorEl) errorEl.textContent = error instanceof Error ? error.message : "Could not attach these images."; }
}

function renderDraftImages(): void {
  if (!attachmentTray || !channelId) return;
  const id = channelId;
  attachmentTray.replaceChildren(...drafts.get(id).images.map(image => {
    const remove = h("button", { class: "qr-draft-remove", attrs: { type: "button", "aria-label": `Remove ${image.file.name}`, title: `Remove ${image.file.name}` }, trustedHtml: icon("x", 13), on: { click: () => { drafts.remove(id, image.id); renderDraftImages(); updateSendButton(); } } });
    remove.disabled = sendingChannel === id;
    return h("div", { class: "qr-draft-image", on: { contextmenu: (event: MouseEvent) => miniMenu(event,[{label:"Photo metadata",run:()=>showPhotoMetadata(image.file)}],messageError) } }, h("img", { attrs: { src: image.url, alt: image.file.name } }), remove);
  }));
  attachmentTray.hidden = !drafts.get(id).images.length;
}

async function send(): Promise<void> {
  if (!replyInput || !channelId || sending) return;
  const id = channelId;
  const content = replyInput.value;
  const images = drafts.get(id).images.slice();
  const selectedReply = drafts.get(id).reply;
  const actor = myId();
  const draftToken = drafts.token();
  if (!content.trim() && !images.length) return;
  sending = true;
  sendingChannel = id;
  renderDraftImages();
  renderReplyTarget();
  updateSendButton();
  if (errorEl) errorEl.textContent = "";
  try {
    await sendMiniChatMessage(id, content, images.map(image => image.file), undefined, undefined, selectedReply);
    drafts.complete(id, content, images.map(image => image.id), selectedReply, draftToken);
    if (draftToken === drafts.token() && myId() === actor && channelId === id && replyInput) { replyInput.value = drafts.get(id).text; renderDraftImages(); renderReplyTarget(); }
  } catch (err) {
    if (draftToken === drafts.token() && myId() === actor && channelId === id && errorEl) errorEl.textContent = err instanceof Error ? err.message : "Couldn't send that. Your draft is saved; try again or open the chat in Discord.";
    console.warn("xray: quick reply failed", err);
  } finally {
    if (draftToken === drafts.token()) {
      sending = false;
      sendingChannel = null;
      renderDraftImages();
      renderReplyTarget();
      updateSendButton();
    }
  }
}

function resetDrafts(): void { drafts.clear(); fetched.clear(); sending = false; sendingChannel = null; }

function messageError(error: unknown): void { showDialog({ title: "Mini-chat", body: error instanceof Error ? error.message : "Discord could not complete this action." }); }
function selectReply(message: any): void {
  if (!channelId || message.channel_id !== channelId || sendingChannel === channelId) return;
  drafts.get(channelId).reply = { id: message.id, channelId, author: userView(message.author?.id)?.name ?? message.author?.username ?? "Message", preview: summarize(message).slice(0, 160), mention: false };
  renderReplyTarget(); replyInput?.focus();
}
function renderReplyTarget(): void {
  if (!replyTray || !channelId) return;
  const id = channelId, reply = drafts.get(id).reply;
  replyTray.hidden = !reply; replyTray.replaceChildren(); if (!reply) return;
  const mention = h("input", { attrs: { type: "checkbox", "aria-label": "Mention the author in this reply" } }); mention.checked = reply.mention; mention.disabled = sendingChannel === id;
  mention.onchange = () => { reply.mention = mention.checked; };
  const cancel = h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Cancel reply" }, trustedHtml: icon("x", 14), on: { click: () => { drafts.get(id).reply = undefined; renderReplyTarget(); } } }); cancel.disabled = sendingChannel === id;
  replyTray.append(h("div", { class: "qr-reply-label" }, h("strong", { text: `Replying to ${reply.author}` }), cancel), h("div", { class: "qr-reply-preview", text: reply.preview }), h("label", {}, mention, "Mention author"));
}
export function typingText(ids: string[], me: string | undefined, name: (id: string) => string): string {
  const others = [...new Set(ids)].filter(id => id !== me);
  if (!others.length) return "";
  const names = others.slice(0,3).map(name);
  return others.length > 3 ? `${names.join(", ")} and ${others.length - 3} others are typing…` : `${names.join(", ")} ${others.length === 1 ? "is" : "are"} typing…`;
}
function renderTyping(): void {
  if (!typingEl || !channelId) return;
  const ids = Object.keys(stores.typing?.getTypingUsers?.(channelId) ?? {}).filter(id => !stores.relationships?.isBlocked?.(id));
  const text = typingText(ids, stores.users?.getCurrentUser?.()?.id, id => userView(id)?.name ?? "Someone");
  if (typingEl.textContent !== text) typingEl.textContent = text;
  typingEl.hidden = !text;
}
function conversationMenu(event: MouseEvent, id: string): void {
  const channel = stores.channels?.getChannel?.(id), person = channel?.recipients?.[0];
  miniMenu(event, [
    { label: "Open in mini-chat", run: () => openConversation(id) },
    { label: "Open in Discord", run: () => { navigate(`/channels/${channel?.guild_id ?? "@me"}/${id}`); close(); } },
    { label: "Copy channel ID", run: () => copyText(id) },
    { label: "View profile", disabled: channel?.type !== DM || !person, run: () => showProfile(person) },
  ], messageError);
}
