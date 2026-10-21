/**
 * Globals captured the moment xray starts, before any of Discord's scripts
 * run. Discord deletes `window.localStorage` once it has booted (so pasted
 * scripts can't read the token), which means anything in xray that needs
 * storage goes through the reference grabbed here.
 */

export const storage: Storage | null = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const BADGE = "color:#0b0b0d;background:#f2f3f5;border-radius:4px;padding:1px 6px;font-weight:600";

/** An optional listener for xray's own warnings, so the log reporter can keep them. */
let warnSink: ((args: unknown[]) => void) | undefined;

export function onWarn(sink: (args: unknown[]) => void): void {
  warnSink = sink;
}

export function log(...args: unknown[]): void {
  console.log("%cxray", BADGE, ...args);
}

export function warn(...args: unknown[]): void {
  console.warn("%cxray", BADGE, ...args);
  try {
    warnSink?.(args);
  } catch {
    // the reporter must never break logging
  }
}
