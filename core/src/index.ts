/**
 * xray's mod core. The Rust shell injects this bundle into Discord's page at
 * document start, before any of Discord's own scripts run, so the webpack hook,
 * plugin patches and keyboard router are in place before Discord's modules load.
 */
import { log } from "./env";
import { fakeVoice } from "./plugins/fakeDeafen";
import { isRunning, pluginCommands, plugins, startPlugins } from "./plugins/manager";
import { setThemeEnabled, themeEnabled } from "./settings";
import { handleHotkey, lastHotkeyFired } from "./shell/hotkeys";
import { installNotifications, notificationClicked } from "./shell/notifications";
import { installReporting } from "./shell/report";
import { installTheme, setThemeActive } from "./theme";
import { registerFeature } from "./ui/features";
import { command, palette, setPaletteCommands } from "./ui/palette";
import { isPanelOpen, mountUi, openPanel } from "./ui/panel";
import { quickReply } from "./ui/quickReply";
import { installKeyRouter } from "./ui/root";
import { hookWebpack, webpackStats } from "./webpack";

const DISCORD_HOSTS = new Set(["discord.com", "ptb.discord.com", "canary.discord.com"]);

function boot(): void {
  // The shell only loads Discord, but never run on anything else if a page slips through.
  if (!DISCORD_HOSTS.has(location.hostname) || "__xray" in window) return;

  // First, so xray's keys are handled before any of Discord's listeners exist.
  installKeyRouter();
  installNotifications();
  installReporting();
  hookWebpack();
  startPlugins();
  // Before Discord paints anything, so it never flashes its own colors first.
  installTheme();
  // The UI needs a document to attach to; at document start there isn't one yet.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startUi, { once: true });
  else startUi();

  // A small read-only handle: the Rust side calls openPanel, notificationClicked
  // and hotkey, and diagnostics help testing.
  Object.defineProperty(window, "__xray", {
    value: Object.freeze({
      version: __XRAY_VERSION__,
      openPanel,
      notificationClicked,
      hotkey: handleHotkey,
      diagnostics: () => ({
        version: __XRAY_VERSION__,
        webpack: webpackStats(),
        plugins: plugins.map((p) => ({ id: p.id, running: isRunning(p.id) })),
        panelOpen: isPanelOpen(),
        lastHotkey: lastHotkeyFired(),
      }),
    }),
  });

  log(`v${__XRAY_VERSION__} loaded${__XRAY_DEV__ ? " (dev build)" : ""}`);
}

function startUi(): void {
  mountUi();
  setPaletteCommands(() => [
    command("Open xray panel", "Plugins, hotkeys and settings", openPanel),
    ...(fakeVoice.available
      ? [command(fakeVoice.active ? "Turn off fake deafen" : "Turn on fake deafen", "Look deafened while you keep listening", () => fakeVoice.set(!fakeVoice.active))]
      : []),
    command(themeEnabled() ? "Use Discord's own look" : "Use the Obsidian theme", "Switch xray's theme", () => {
      setThemeEnabled(!themeEnabled());
      setThemeActive(themeEnabled());
    }),
    ...pluginCommands().map((c) => command(c.title, c.subtitle, c.run)),
  ]);
  registerFeature(quickReply);
  registerFeature(palette);
}

boot();
