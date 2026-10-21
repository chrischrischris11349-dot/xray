/**
 * Starts, stops and remembers plugins and their settings. Plugins that hook
 * Discord's code as it loads (`needsReload`) only change on the next reload.
 * The rest switch on and off immediately, and restart when a setting changes.
 */
import { intercept, onAction } from "../api/flux";
import { addMenuItems } from "../api/menus";
import { onEdit, onSend } from "../api/messages";
import { onElement, onElementByCode } from "../api/react";
import { onApiCall, onApiRequest } from "../api/requests";
import { onGatewaySend } from "../api/gateway";
import { addStyle, watchElements } from "../api/dom";
import { log, warn } from "../env";
import { patch } from "../patcher";
import { pluginState, save } from "../settings";
import { onKey } from "../ui/root";
import { builtins } from "./builtins";
import type { Plugin, PluginContext, PluginOption } from "./types";

export const plugins: readonly Plugin[] = builtins;

export interface PluginCommand {
  title: string;
  subtitle: string;
  run: () => void;
}

const running = new Map<string, (() => void)[]>();
/** Whether each plugin was enabled when this page loaded. A mismatch means a reload is pending. */
const enabledAtBoot = new Map<string, boolean>();
const listeners = new Set<() => void>();
const commands = new Set<PluginCommand>();

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

export function optionValue(plugin: Plugin, key: string): unknown {
  const saved = pluginState(plugin.id).options?.[key];
  const option = plugin.options?.[key];
  if (!option) return undefined;
  return isValid(option, saved) ? saved : option.default;
}

export function setOption(plugin: Plugin, key: string, value: unknown): void {
  const option = plugin.options?.[key];
  if (!option || !isValid(option, value)) return;
  (pluginState(plugin.id).options ??= {})[key] = value;
  save();
  // Plugins read settings when they start, so a running one restarts to pick up the change.
  if (running.has(plugin.id) && !plugin.needsReload) {
    stop(plugin);
    start(plugin);
  }
  emit();
}

function isValid(option: PluginOption, value: unknown): boolean {
  switch (option.type) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "select":
      return typeof value === "string" && option.choices.some((choice) => choice.value === value);
    case "list":
      return Array.isArray(value) && value.every((entry) => typeof entry === "string");
  }
}

/** Plugins whose on/off change only takes effect after a reload. */
export function pendingReload(): Plugin[] {
  return plugins.filter((p) => p.needsReload && isEnabled(p) !== enabledAtBoot.get(p.id));
}

/** Commands that running plugins have added to the search palette. */
export function pluginCommands(): PluginCommand[] {
  return [...commands];
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

function contextFor(plugin: Plugin, cleanups: (() => void)[]): PluginContext {
  const keep = (cleanup: () => void) => {
    cleanups.push(cleanup);
  };
  const options = {} as Record<string, unknown>;
  for (const key of Object.keys(plugin.options ?? {})) {
    Object.defineProperty(options, key, { enumerable: true, get: () => optionValue(plugin, key) });
  }
  return {
    options: options as PluginContext["options"],
    // Deferred, since saving restarts the plugin and that mustn't happen inside the code that asked.
    setOption: (key, value) => void Promise.resolve().then(() => setOption(plugin, key, value)),
    patch: (target, key, hooks) => keep(patch(target, key, hooks)),
    css: (css) => keep(addStyle(css)),
    onAction: (type, listener) => keep(onAction(type, listener)),
    intercept: (interceptor) => keep(intercept(interceptor)),
    onElement: (type, hook) => keep(onElement(type, hook)),
    onElementByCode: (needles, hook) => keep(onElementByCode(needles, hook)),
    menu: (navIds, menuPatch) => keep(addMenuItems(navIds, menuPatch)),
    onSend: (hook) => keep(onSend(hook)),
    onEdit: (hook) => keep(onEdit(hook)),
    onApiRequest: (methods, path, rewrite) => keep(onApiRequest(methods, path, rewrite)),
    onApiCall: (methods, path, seen) => keep(onApiCall(methods, path, seen)),
    onGatewaySend: (op, rewrite) => keep(onGatewaySend(op, rewrite)),
    watch: (selector, onAdded) => keep(watchElements(selector, onAdded)),
    onKey: (handler) => keep(onKey(handler)),
    command: (title, subtitle, run) => {
      const entry = { title, subtitle, run };
      commands.add(entry);
      keep(() => commands.delete(entry));
    },
    every: (ms, run) => {
      const timer = window.setInterval(() => {
        try {
          run();
        } catch (err) {
          warn(`${plugin.name}'s timer failed`, err);
        }
      }, ms);
      keep(() => clearInterval(timer));
    },
    onStop: keep,
    log: (...args) => log(`[${plugin.name}]`, ...args),
  };
}

function start(plugin: Plugin): void {
  if (running.has(plugin.id)) return;
  const cleanups: (() => void)[] = [];
  running.set(plugin.id, cleanups);
  try {
    plugin.start(contextFor(plugin, cleanups));
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
