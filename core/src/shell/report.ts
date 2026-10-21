/**
 * The log reporter: sends xray's own errors and your own voice and plugin
 * events to your log server, so you can see when Discord changed something
 * under xray or review your own fake-deafen history. It's off until you turn
 * it on, and even then nothing leaves this machine unless xray is configured
 * with your server's address and token (that lives on the Rust side, so
 * Discord's page never sees it).
 *
 * What it sends: xray's own warning text, and structured voice/plugin events
 * (fake deafen on/off, which server, plugin switched on/off). What it never
 * sends: message content, anything about other people, or anything from
 * Discord's own code. Events are shaped here, not free-form, so Discord's
 * data can't ride along by accident.
 *
 * Events are batched and flushed on a timer and when the page goes away. The
 * queue is bounded, so a burst of warnings can't grow without limit. Delivery
 * goes through Rust (`report_events`); if that isn't available or no server is
 * configured, the batch is dropped rather than retried forever.
 */
import { onWarn } from "../env";
import { loggingEnabled } from "../settings";
import { invoke } from "./bridge";

export type LogKind = "error" | "voice" | "plugin";

export interface LogEvent {
  kind: LogKind;
  /** The plugin or part of xray it came from. */
  source?: string;
  /** xray's own message. Never message content or anyone's data. */
  text: string;
  /** A few short, flat fields of xray's own (a server id, on/off). */
  detail?: Record<string, string | number | boolean>;
}

const FLUSH_MS = 4000;
const MAX_QUEUE = 100;
const MAX_DETAIL_KEYS = 12;

let queue: LogEvent[] = [];
let flushTimer: number | undefined;
let installed = false;
let sending = false;

/** Queues an event. No-op while logging is off. */
export function reportEvent(event: LogEvent): void {
  if (!loggingEnabled() || !event.text) return;
  queue.push({
    kind: event.kind,
    source: event.source ? String(event.source).slice(0, 120) : undefined,
    text: String(event.text).slice(0, 1000),
    detail: cleanDetail(event.detail),
  });
  // Drop oldest past the cap, so a flood can't grow memory without bound.
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  scheduleFlush();
}

/** Keeps only short, flat, own-data fields, matching what the server stores. */
function cleanDetail(detail: LogEvent["detail"]): LogEvent["detail"] {
  if (!detail) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (Object.keys(out).length >= MAX_DETAIL_KEYS) break;
    if (typeof value === "string") out[key] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function scheduleFlush(): void {
  if (flushTimer === undefined) flushTimer = window.setTimeout(flush, FLUSH_MS);
}

/** Sends the queued events through Rust. Keeps them if it's busy; drops them if Rust can't take them. */
export function flush(): void {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (sending || !queue.length) return;
  const batch = queue;
  queue = [];
  sending = true;
  invoke("report_events", { events: batch })
    .catch(() => {
      // No server configured, or the Rust command isn't there: drop the batch.
    })
    .finally(() => {
      sending = false;
    });
}

/** Wires xray's own warnings into the reporter. Call once at startup. */
export function installReporting(): void {
  if (installed) return;
  installed = true;
  onWarn((args) => reportEvent({ kind: "error", text: args.map(describe).join(" ") }));
  window.addEventListener("pagehide", flush);
}

/** A log argument as a short string, without pulling in objects that might hold Discord's data. */
function describe(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.message;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  return "";
}

/** For tests: the queued events not yet sent. */
export function pending(): readonly LogEvent[] {
  return queue;
}
