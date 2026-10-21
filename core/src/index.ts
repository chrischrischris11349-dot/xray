/**
 * xray's mod core. The Rust shell injects this bundle into Discord's page at
 * document start, before any of Discord's own scripts run, so the webpack hook
 * and plugin patches are in place before Discord's modules load.
 */
import { log } from "./env";
import { isRunning, plugins, startPlugins } from "./plugins/manager";
import { installNotifications, notificationClicked } from "./shell/notifications";
import { isPanelOpen, mountUi, openPanel } from "./ui/panel";
import { hookWebpack, webpackStats } from "./webpack";

const DISCORD_HOSTS = new Set(["discord.com", "ptb.discord.com", "canary.discord.com"]);

function boot(): void {
  // The shell only loads Discord, but never run on anything else if a page slips through.
  if (!DISCORD_HOSTS.has(location.hostname) || "__xray" in window) return;

  installNotifications();
  hookWebpack();
  startPlugins();
  // The UI needs a document to attach to; at document start there isn't one yet.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountUi, { once: true });
  else mountUi();

  // A small read-only handle: the Rust side calls openPanel and notificationClicked,
  // and diagnostics help testing.
  Object.defineProperty(window, "__xray", {
    value: Object.freeze({
      version: __XRAY_VERSION__,
      openPanel,
      notificationClicked,
      diagnostics: () => ({
        version: __XRAY_VERSION__,
        webpack: webpackStats(),
        plugins: plugins.map((p) => ({ id: p.id, running: isRunning(p.id) })),
        panelOpen: isPanelOpen(),
      }),
    }),
  });

  log(`v${__XRAY_VERSION__} loaded${__XRAY_DEV__ ? " (dev build)" : ""}`);
}

boot();
