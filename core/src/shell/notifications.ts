/**
 * Desktop notifications. Discord's page uses the browser's Notification API.
 * xray swaps in its own class before Discord loads, so each notification
 * becomes a Windows toast under xray's name instead of hitting WebView2's
 * permission prompt. Clicking a toast calls `notificationClicked`, which runs
 * Discord's own click handler, so Discord opens the right conversation.
 */
import { warn } from "../env";
import { invoke } from "./bridge";

/** Enough to route clicks on recent toasts. Clicking an older one still brings xray up. */
const MAX_TRACKED = 50;

const live = new Map<number, XrayNotification>();
let nextId = 1;
/** While true (xray is locked), toasts say only that something arrived, not what. */
let hideContent = false;

export function setNotificationsPrivate(on: boolean): void {
  hideContent = on;
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

  constructor(title: string, options: NotificationOptions = {}) {
    super();
    this.title = String(title);
    this.body = String(options.body ?? "");
    this.icon = String(options.icon ?? "");
    this.tag = String(options.tag ?? "");
    this.data = options.data ?? null;
    this.silent = options.silent ?? null;

    live.set(this.#id, this);
    if (live.size > MAX_TRACKED) live.delete(live.keys().next().value!);
    const shown = hideContent ? { title: "xray", body: "New notification" } : { title: this.title, body: this.body };
    invoke("notify", { id: this.#id, ...shown })
      .then(() => this.fire("show"))
      .catch((err) => {
        warn("couldn't show a notification", err);
        this.fire("error");
      });
  }

  close(): void {
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
  Object.defineProperty(window, "Notification", { value: XrayNotification, writable: true, configurable: true });
}

/** Called by the Rust side when you click a toast. */
export function notificationClicked(id: number): void {
  const notification = live.get(id);
  if (!notification) return;
  live.delete(id);
  notification.fire("click");
}
