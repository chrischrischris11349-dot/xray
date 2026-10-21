/**
 * Starts, stops and remembers plugins. Plugins that hook Discord's code as it
 * loads (`needsReload`) only change on the next reload. The rest switch on
 * and off immediately.
 */
import { log, warn } from "../env";
import { patch } from "../patcher";
import { pluginState, save } from "../settings";
import { builtins } from "./builtins";
import type { Plugin, PluginContext } from "./types";

export const plugins: readonly Plugin[] = builtins;

const running = new Map<string, (() => void)[]>();
/** Whether each plugin was enabled when this page loaded. A mismatch means a reload is pending. */
const enabledAtBoot = new Map<string, boolean>();
const listeners = new Set<() => void>();

export function isEnabled(plugin: Plugin): boolean {
  return pluginState(plugin.id).enabled ?? plugin.enabledByDefault;
}

export function isRunning(id: string): boolean {
  return running.has(id);
}

export function startPlugins(): void {
  for (const plugin of plugins) {
    const enabled = isEnabled(plugin);
    enabledAtBoot.set(plugin.id, enabled);
    if (enabled) start(plugin);
  }
}

export function setEnabled(plugin: Plugin, enabled: boolean): void {
  pluginState(plugin.id).enabled = enabled;
  save();
  if (!plugin.needsReload) {
    if (enabled) start(plugin);
    else stop(plugin);
  }
  emit();
}

/** Plugins whose on/off change only takes effect after a reload. */
export function pendingReload(): Plugin[] {
  return plugins.filter((p) => p.needsReload && isEnabled(p) !== enabledAtBoot.get(p.id));
}

export function onPluginsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      warn("a plugin listener failed", err);
    }
  }
}

function start(plugin: Plugin): void {
  if (running.has(plugin.id)) return;
  const cleanups: (() => void)[] = [];
  running.set(plugin.id, cleanups);
  const ctx: PluginContext = {
    patch: (target, key, hooks) => {
      cleanups.push(patch(target, key, hooks));
    },
    onStop: (cleanup) => {
      cleanups.push(cleanup);
    },
    log: (...args) => log(`[${plugin.name}]`, ...args),
  };
  try {
    plugin.start(ctx);
  } catch (err) {
    warn(`${plugin.name} failed to start`, err);
    stop(plugin);
  }
}

function stop(plugin: Plugin): void {
  const cleanups = running.get(plugin.id);
  if (!cleanups) return;
  running.delete(plugin.id);
  for (const cleanup of cleanups.reverse()) {
    try {
      cleanup();
    } catch (err) {
      warn(`${plugin.name} didn't stop cleanly`, err);
    }
  }
}
