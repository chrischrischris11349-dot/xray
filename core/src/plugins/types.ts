import type { Action, Interceptor } from "../api/flux";
import type { MenuPatch } from "../api/menus";
import type { EditHook, SendHook } from "../api/messages";
import type { ElementHook } from "../api/react";
import type { ApiRequest } from "../api/requests";
import type { Hooks } from "../patcher";

export type Impact = "light" | "moderate" | "heavy";
export type Category =
  | "Chat"
  | "Voice"
  | "Privacy"
  | "Notifications"
  | "Appearance"
  | "Media"
  | "Servers"
  | "Friends"
  | "Utility"
  | "Fun"
  | "Developer";

/** One setting a plugin offers. The panel draws a control for each. */
export type PluginOption =
  | { type: "boolean"; label: string; description?: string; default: boolean }
  | { type: "number"; label: string; description?: string; default: number; min?: number; max?: number; step?: number }
  | { type: "string"; label: string; description?: string; default: string; placeholder?: string; multiline?: boolean }
  | { type: "select"; label: string; description?: string; default: string; choices: readonly { value: string; label: string }[] }
  /** One entry per line in the panel. */
  | { type: "list"; label: string; description?: string; default: readonly string[]; placeholder?: string };

export type OptionValue<O extends PluginOption> = O extends { type: "boolean" }
  ? boolean
  : O extends { type: "number" }
    ? number
    : O extends { type: "list" }
      ? string[]
      : string;

export type OptionValues<T extends Record<string, PluginOption>> = { readonly [K in keyof T]: OptionValue<T[K]> };

/**
 * What a plugin gets to work with. Everything it sets up through the
 * context is undone automatically when the plugin stops, so `start` never
 * needs a matching `stop`.
 */
export interface PluginContext<T extends Record<string, PluginOption> = Record<string, PluginOption>> {
  /** The plugin's settings, always current. */
  readonly options: OptionValues<T>;
  /** Saves a setting. The plugin restarts to pick it up. */
  setOption<K extends keyof T & string>(key: K, value: OptionValue<T[K]>): void;
  /** Patches a method. */
  patch(target: object, key: PropertyKey, hooks: Hooks): void;
  /** Adds CSS to Discord's page. */
  css(css: string): void;
  /** Listens to a Discord action after its stores handle it (see api/flux.ts). */
  onAction(type: string, listener: (action: Action) => void): void;
  /** Sees every action before Discord's stores do; return true to drop it. */
  intercept(interceptor: Interceptor): void;
  /** Changes elements of one component type as they're created (see api/react.ts). */
  onElement(type: unknown, hook: ElementHook): void;
  /** Like onElement, for components found by text in their source. */
  onElementByCode(needles: readonly string[], hook: ElementHook): void;
  /** Adds entries to right-click menus (see api/menus.ts). */
  menu(navIds: string | readonly string[], patch: MenuPatch): void;
  /** Runs before each message you send. */
  onSend(hook: SendHook): void;
  /** Runs before each edit you save. */
  onEdit(hook: EditHook): void;
  /** Notices matching requests to Discord's API as they're sent, with or without a body. */
  onApiCall(methods: readonly string[], path: RegExp, seen: (method: string, path: string) => void): void;
  /** Rewrites the JSON body of matching requests to Discord's API. */
  onApiRequest(methods: readonly string[], path: RegExp, rewrite: (request: ApiRequest) => void): void;
  /** Rewrites outgoing gateway messages with this opcode. */
  onGatewaySend(op: number, rewrite: (d: any) => void): void;
  /** Calls `onAdded` for each matching element, now and as they appear. */
  watch(selector: string, onAdded: (element: Element) => void): void;
  /** Handles keys before Discord does; return true to claim one. */
  onKey(handler: (event: KeyboardEvent) => boolean): void;
  /** Adds a command to the search palette. */
  command(title: string, subtitle: string, run: () => void): void;
  /** A timer that stops with the plugin. */
  every(ms: number, run: () => void): void;
  /** Runs when the plugin stops, newest first. */
  onStop(cleanup: () => void): void;
  log(...args: unknown[]): void;
}

export interface Plugin<T extends Record<string, PluginOption> = Record<string, PluginOption>> {
  id: string;
  name: string;
  description: string;
  category: Category;
  impact: Impact;
  /** One short line on why it costs what it does, shown next to the rating. */
  impactReason: string;
  /** True when the plugin changes Discord's code as it loads, so turning it on or off needs a reload. */
  needsReload: boolean;
  enabledByDefault: boolean;
  options?: T;
  start(ctx: PluginContext<T>): void;
}

export const definePlugin = <T extends Record<string, PluginOption> = Record<string, PluginOption>>(plugin: Plugin<T>): Plugin<T> => plugin;
