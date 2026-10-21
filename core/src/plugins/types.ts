import type { Hooks } from "../patcher";

export type Impact = "light" | "moderate" | "heavy";
export type Category = "Voice" | "Chat" | "Privacy" | "Appearance" | "Media" | "Servers" | "Utility";

export interface PluginContext {
  /** Patches a method. The patch is undone automatically when the plugin stops. */
  patch(target: object, key: PropertyKey, hooks: Hooks): void;
  /** Runs when the plugin stops, newest first. */
  onStop(cleanup: () => void): void;
  log(...args: unknown[]): void;
}

export interface Plugin {
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
  start(ctx: PluginContext): void;
}

export const definePlugin = (plugin: Plugin): Plugin => plugin;
