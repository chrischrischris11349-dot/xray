import { pluginState, save } from "./settings";

export type TimeFormat = "12h" | "24h";
const listeners = new Set<() => void>();
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Appearance settings are the single persisted source, including synced settings. */
export function currentTimeFormat(): TimeFormat {
  return pluginState("appearance").data?.timeFormat === "24h" ? "24h" : "12h";
}

export function onTimeFormatChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function synchronizeTimeFormat(): void {
  const format = currentTimeFormat() === "24h" ? "HH:mm:ss" : "h:mm:ss A";
  const plugin = (window as any).Vencord?.Settings?.plugins?.RealtimeTimestamps;
  if (plugin && plugin.format !== format) plugin.format = format;
  for (const listener of listeners) listener();
}

export function setTimeFormat(value: TimeFormat): void {
  if (value !== "12h" && value !== "24h") return;
  if (currentTimeFormat() === value) return;
  const appearance = pluginState("appearance");
  appearance.data = { ...appearance.data, timeFormat: value };
  save();
  synchronizeTimeFormat();
}

/** Locale still controls dates/time zone; only the clock cycle is explicit. */
export function formatTime(date: Date, options: Intl.DateTimeFormatOptions = {}, locale?: string, clock = currentTimeFormat()): string {
  const resolved = { ...options, hour: options.hour ?? "numeric", minute: options.minute ?? "2-digit", hourCycle: clock === "24h" ? "h23" : "h12" } as Intl.DateTimeFormatOptions;
  delete resolved.hour12;
  const key = JSON.stringify([locale, resolved]);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, resolved);
    // Only a few UI variants are used. Bound the cache even for plugin callers.
    if (formatters.size >= 32) formatters.delete(formatters.keys().next().value!);
    formatters.set(key, formatter);
  }
  return formatter.format(date);
}

export function formatDateTime(date: Date): string {
  return formatTime(date, { year: "numeric", month: "numeric", day: "numeric", second: "2-digit" });
}
