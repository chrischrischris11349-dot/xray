/**
 * xray's saved settings: one JSON value in Discord's localStorage, written
 * through the reference captured at startup. Writes are batched, and flushed
 * when the page goes away.
 *
 * Later this moves to the Rust side (and from there to your server) so it
 * survives Discord clearing its storage on logout.
 */
import { storage, warn } from "./env";
import { pullConfig, pushConfig } from "./shell/sync";

const KEY = "xray.settings";
const SYNC_NS = "xray";
const SAVE_DELAY_MS = 250;

export interface PluginState {
  enabled?: boolean;
  options?: Record<string, unknown>;
  /** A plugin's own bookkeeping that must survive a restart. */
  data?: Record<string, unknown>;
  /** Set once Equicord's twin of this plugin has taken over (see plugins/equicordTwins.ts). */
  handedToEquicord?: boolean;
}

interface Saved {
  plugins: Record<string, PluginState>;
  seenWelcome?: boolean;
  /** Set once you've been through the plugin picker (ui/picker.ts). */
  pickedPlugins?: boolean;
  /** The Obsidian theme. On unless switched off. */
  theme?: boolean;
  /** xray's UI features by id (quick reply, search). On unless switched off. */
  features?: Record<string, boolean>;
  /** Send xray's own errors and your voice/plugin events to your log server. Off unless switched on. */
  logging?: boolean;
  /** Sync plugins' own config (your settings) to your server. Off unless switched on. */
  syncConfig?: boolean;
}

const saved: Saved = read();
let saveTimer: number | undefined;

function read(): Saved {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.plugins && typeof parsed.plugins === "object") return parsed;
  } catch (err) {
    warn("saved settings were unreadable, so xray is starting fresh", err);
  }
  return { plugins: {} };
}

function flush(): void {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  try {
    storage?.setItem(KEY, JSON.stringify(saved));
  } catch (err) {
    warn("couldn't save settings", err);
  }
  // With sync on, the same blob follows you to your server. Fails soft: no
  // server, or unreachable, and the local copy above still stands.
  if (saved.syncConfig === true) void pushConfig(SYNC_NS, saved);
}

export function save(): void {
  if (saveTimer === undefined) saveTimer = window.setTimeout(flush, SAVE_DELAY_MS);
}

window.addEventListener("pagehide", () => {
  if (saveTimer !== undefined) flush();
});

export function pluginState(id: string): PluginState {
  return (saved.plugins[id] ??= {});
}

export function seenWelcome(): boolean {
  return saved.seenWelcome === true;
}

export function pickedPlugins(): boolean {
  return saved.pickedPlugins === true;
}

export function markPluginsPicked(): void {
  saved.pickedPlugins = true;
  save();
}

export function markWelcomeSeen(): void {
  saved.seenWelcome = true;
  save();
}

export function themeEnabled(): boolean {
  return saved.theme !== false;
}

export function setThemeEnabled(on: boolean): void {
  saved.theme = on;
  save();
}

export function loggingEnabled(): boolean {
  return saved.logging === true;
}

export function setLoggingEnabled(on: boolean): void {
  saved.logging = on;
  save();
}

export function syncEnabled(): boolean {
  return saved.syncConfig === true;
}

export function setSyncEnabled(on: boolean): void {
  saved.syncConfig = on;
  save();
}

/**
 * Pulls your settings from the server (when sync is on) and merges them into
 * the in-memory copy, then saves locally. Called once at boot. Plugins that
 * have already read their settings keep this session's local values; the
 * merged copy is in place from the start on the next launch.
 */
export async function initSync(): Promise<void> {
  if (!syncEnabled()) return;
  const reply = await pullConfig(SYNC_NS);
  const remote = reply?.value as Saved | undefined;
  if (remote && typeof remote === "object" && remote.plugins && typeof remote.plugins === "object") {
    Object.assign(saved, remote);
    flush();
  }
}

export function featureEnabled(id: string): boolean {
  return saved.features?.[id] !== false;
}

export function setFeatureEnabled(id: string, on: boolean): void {
  (saved.features ??= {})[id] = on;
  save();
}
