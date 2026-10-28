/**
 * Desktop notifications. Discord's page uses the browser's Notification API.
 * xray swaps in its own class before Discord loads, so each notification
 * becomes a Windows toast under xray's name instead of hitting WebView2's
 * permission prompt. Clicking a toast calls `notificationClicked`, which runs
 * Discord's own click handler, so Discord opens the right conversation.
 */
import { warn } from "../env";
import { invoke } from "./bridge";
import { safeImage, stores, userView, whenStore } from "../discord";
import { NotificationMessages, notificationIdentity } from "./notificationIdentity";
import { intercept } from "../api/flux";
import { h } from "../ui/dom";
import { uiRoot } from "../ui/root";

/** Enough to route clicks on recent toasts. Clicking an older one still brings xray up. */
const MAX_TRACKED = 50;

const live = new Map<number, XrayNotification>();
let nextId = 1;
/** While true (xray is locked), toasts say only that something arrived, not what. */
let hideContent = false;
let presentationHidden = false;
let streamerHidden = false;
const cards = new Set<() => void>();
const recentMessages=new NotificationMessages();
function syncPrivacy(): void {
  void invoke("set_notification_privacy", { active: hideContent || presentationHidden || streamerHidden }).catch(() => {});
  if (hideContent || presentationHidden || streamerHidden) for (const close of [...cards]) close();
}

export function setPresentationNotificationPrivacy(on: boolean): void {
  presentationHidden = on;
  syncPrivacy();
}

export function notificationContent(title: string, body: string, privateMode: boolean): { title: string; body: string } {
  return privateMode ? { title: "XRay", body: "New message · preview hidden" } : { title: title.slice(0, 120), body: body.slice(0, 400) };
}

function showCard(title: string, body: string, avatar: string | null, activate: () => void, closed: () => void): () => void {
  while (cards.size >= 3) cards.values().next().value?.();
  const card = h("section", { class: "notification-card", attrs: { role: "status", "aria-label": "XRay notification" } });
  let timer: ReturnType<typeof setTimeout>;
  const close = () => { clearTimeout(timer); card.remove(); cards.delete(close); };
  const open = h("button", { class: "notification-open", attrs: { type: "button" }, on: { click: () => { close(); activate(); } } },
    avatar ? h("img", { class: "notification-avatar", attrs: { src: avatar, alt: "", referrerpolicy: "no-referrer" } }) : h("span", { class: "notification-avatar", text: "X" }),
    h("span", { class: "notification-copy" }, h("span", { class: "notification-brand", text: "XRAY · NOW" }), h("strong", { text: title }), h("span", { text: body })));
  card.append(open, h("button", { class: "icon-btn notification-dismiss", attrs: { type: "button", "aria-label": "Dismiss notification" }, text: "×", on: { click: () => { close(); closed(); } } }));
  let stack = uiRoot().querySelector<HTMLElement>(".notification-stack");
  if (!stack) { stack = h("div", { class: "notification-stack" }); uiRoot().append(stack); }
  stack.append(card); cards.add(close);
  timer = setTimeout(() => { close(); closed(); }, 8000);
  return close;
}

export function setNotificationsPrivate(on: boolean): void {
  hideContent = on;
  syncPrivacy();
}

type Handler = ((this: XrayNotification, event: Event) => unknown) | null;

class XrayNotification extends EventTarget {
  static get permission(): NotificationPermission {
    return "granted";
  }

  static requestPermission(callback?: (permission: NotificationPermission) => void): Promise<NotificationPermission> {
    callback?.("granted");
    return Promise.resolve("granted");
  }

  static get maxActions(): number {
    return 0;
  }

  readonly title: string;
  readonly body: string;
  readonly icon: string;
  readonly tag: string;
  readonly data: unknown;
  readonly silent: boolean | null;
  onclick: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onshow: Handler = null;
  readonly #id = nextId++;
  #closeCard?: () => void;

  constructor(title: string, options: NotificationOptions = {}) {
    super();
    this.title = String(title);
    this.body = String(options.body ?? "");
    this.icon = String(options.icon ?? "");
    this.tag = String(options.tag ?? "");
    this.data = options.data ?? null;
    this.silent = options.silent ?? null;
    const recent = recentMessages.match(this.body);
    if(recent && !(options.data as any)?.author && !(options.data as any)?.messageId && !(options.data as any)?.message_id)
      options={...options,data:{...(typeof options.data==="object"?options.data:{}),message:recent,channelId:recent.channel_id,messageId:recent.id,author:recent.author}};

    live.set(this.#id, this);
    if (live.size > MAX_TRACKED) live.delete(live.keys().next().value!);
    const privateMode = hideContent || presentationHidden || streamerHidden || stores.streamerMode?.enabled === true;
    let identity = { title: this.title, icon: this.icon };
    if (!privateMode) {
      try { identity = notificationIdentity(this.title, options, userView, (channel, id) => stores.messages?.getMessage?.(channel, id), (guild,channel)=>{
        const id=guild ?? (channel ? stores.channels?.getChannel?.(channel)?.guild_id : undefined);
        const server=id?stores.guilds?.getGuild?.(id):null;
        return server?.icon && /^[a-zA-Z0-9_]+$/.test(server.icon) ? `https://cdn.discordapp.com/icons/${id}/${server.icon}.png?size=64` : null;
      }); }
      catch { /* malformed metadata must not prevent a notification */ }
    }
    const shown = notificationContent(identity.title, this.body, privateMode);
    const data=options.data??{};
    const channelId=data.channelId??data.channel_id??data.message?.channel_id;
    const channel=typeof channelId==="string"?stores.channels?.getChannel?.(channelId):null;
    const guild=channel?.guild_id?stores.guilds?.getGuild?.(channel.guild_id):null;
    const context=privateMode?null:guild?`${guild.name} · #${channel.name??"channel"}`:channel?"Direct message":null;
    if (document.visibilityState === "visible" && document.hasFocus?.()) {
      this.#closeCard = showCard(shown.title, shown.body, privateMode ? null : safeImage(identity.icon), () => this.fire("click"), () => this.close());
      queueMicrotask(() => this.fire("show"));
      return;
    }
    invoke("notify", { id: this.#id, ...shown, icon: privateMode ? null : identity.icon, context })
      .then(() => this.fire("show"))
      .catch((err) => {
        warn("couldn't show a notification", err);
        this.fire("error");
      });
  }

  close(): void {
    this.#closeCard?.();
    if (live.delete(this.#id)) this.fire("close");
  }

  /** Runs the page's `onclick` and `click` listeners, the way a browser does. */
  fire(type: "show" | "click" | "close" | "error"): void {
    const event = new Event(type);
    const handler = this[`on${type}`];
    try {
      handler?.call(this, event);
    } catch (err) {
      warn(`a notification ${type} handler failed`, err);
    }
    this.dispatchEvent(event);
  }
}

export function installNotifications(): void {
  intercept(action=>{if(action.type==="MESSAGE_CREATE")recentMessages.remember(action.message);});
  Object.defineProperty(window, "Notification", { value: XrayNotification, writable: true, configurable: true });
  whenStore("StreamerModeStore", store => {
    const update = () => { streamerHidden = store.enabled === true; syncPrivacy(); };
    store.addChangeListener(update); update();
  });
}

/** Called by the Rust side when you click a toast. */
export function notificationClicked(id: number): void {
  const notification = live.get(id);
  if (!notification) return;
  live.delete(id);
  notification.fire("click");
}
