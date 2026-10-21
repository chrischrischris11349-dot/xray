/**
 * Desktop notifications for plugins. They go through the same Windows toasts
 * as Discord's own (see shell/notifications.ts), so they land in the tray's
 * notification center under xray's name.
 */
import { warn } from "../env";

export function desktopNotify(title: string, body: string, onClick?: () => void): void {
  try {
    const notification = new Notification(title, { body, silent: true });
    if (onClick) notification.onclick = onClick;
  } catch (err) {
    warn("couldn't show a notification", err);
  }
}
