import assert from "node:assert/strict";
import { test } from "node:test";
import { currentTimeFormat, formatTime, onTimeFormatChanged, setTimeFormat, synchronizeTimeFormat } from "../src/time";
import { pluginState } from "../src/settings";
import { messageVisualKey, renderChatMessage } from "../src/ui/chatMessage";
import { parseHTML } from "linkedom";

test("clock defaults to AM/PM and formats midnight, noon and afternoon without changing the instant", () => {
  assert.equal(currentTimeFormat(), "12h");
  const clock = (hour: number) => new Date(Date.UTC(2026, 9, 22, hour, 38, 24));
  const options = { second: "2-digit", timeZone: "UTC" } as const;
  const text = (hour: number) => formatTime(clock(hour), options, "en-US").replace(/\s+/g, " ");
  assert.equal(text(0), "12:38:24 AM");
  assert.equal(text(12), "12:38:24 PM");
  assert.equal(text(16), "4:38:24 PM");
  const original = clock(16).toISOString();
  setTimeFormat("24h");
  assert.equal(text(0), "00:38:24");
  assert.equal(text(16), "16:38:24");
  assert.equal(clock(16).toISOString(), original);
  // A locale which normally uses 24 hours still honors an explicit AM/PM choice.
  assert.match(formatTime(clock(16), options, "en-GB", "12h"), /4:38:24\s*pm/i);
  setTimeFormat("12h");
});

test("one persisted preference drives plugin settings and listeners, with bounded feedback", () => {
  let updates = 0;
  (window as any).Vencord = { Settings: { plugins: { RealtimeTimestamps: { format: "HH:mm:ss" } } } };
  synchronizeTimeFormat();
  assert.equal((window as any).Vencord.Settings.plugins.RealtimeTimestamps.format, "h:mm:ss A");
  const stop = onTimeFormatChanged(() => { updates++; setTimeFormat(currentTimeFormat()); });
  setTimeFormat("24h");
  assert.equal(pluginState("appearance").data?.timeFormat, "24h");
  assert.equal((window as any).Vencord.Settings.plugins.RealtimeTimestamps.format, "HH:mm:ss");
  setTimeFormat("24h");
  setTimeFormat("invalid" as any);
  assert.equal(updates, 1);
  stop(); setTimeFormat("12h");
  assert.equal(updates, 1);
  delete (window as any).Vencord;
});

test("mini-chat rows refresh on format changes and preserve machine-readable timestamps", () => {
  const { document } = parseHTML("<html><body></body></html>");
  (globalThis as any).document = document;
  const message = { id: "1517050740097421364", timestamp: "2026-10-22T16:38:24Z" };
  const initial = messageVisualKey(message, false, "hello");
  const ampm = renderChatMessage(message, false, "hello").querySelector("time")!;
  assert.match(ampm.textContent!, /[AP]M/);
  assert.equal(ampm.getAttribute("datetime"), "2026-10-22T16:38:24.000Z");
  setTimeFormat("24h");
  assert.notEqual(messageVisualKey(message, false, "hello"), initial);
  const military = renderChatMessage(message, false, "hello").querySelector("time")!;
  assert.doesNotMatch(military.textContent!, /[AP]M/);
  assert.equal(military.getAttribute("datetime"), ampm.getAttribute("datetime"));
  setTimeFormat("12h");
});
