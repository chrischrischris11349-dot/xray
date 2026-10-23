import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { oathnetHistory, oathnetSection, parseOathnetResponse } from "../src/ui/oathnet";
import { renderImportedReport, reportAvatar } from "../src/ui/importedReport";

(globalThis as any).document = parseHTML("<html><body></body></html>").document;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("imported reports preserve all supplied fields and match only their Discord ID", () => {
  const id = "300760994454437890";
  const report = { metadata: { query: id, generatedAt: "2026-10-22T11:40:04Z" }, records: [
    { source: "Steam Profiles", title: "Account", fields: [{ label: "Username", value: "test" }, { label: "Nested data", value: { linked: true } }] },
    { source: "Discord Profiles", fields: [{ label: "Display name", value: "<script>bad()</script>" }] },
  ] };
  const rendered = renderImportedReport(report, id);
  assert.equal(rendered.querySelectorAll(".pf-report-card").length, 2);
  assert.equal(rendered.querySelectorAll("dd").length, 3);
  assert.match(rendered.textContent!, /saved report, not a live lookup/);
  assert.match(rendered.textContent!, /linked/);
  assert.equal(rendered.querySelector("script"), null);
  assert.throws(() => renderImportedReport(report, "300760994454437891"), /does not match/);
  assert.equal(rendered.querySelectorAll(".intel-group").length, 2);
  assert.equal(reportAvatar("https://avatars.steamstatic.com/example.jpg"), "https://avatars.steamstatic.com/example.jpg");
  assert.equal(reportAvatar("https://example.com/tracking.jpg"), null);
  const precise = renderImportedReport({ metadata: { query: id }, records: [{ fields: [{ key: "raw", value: '{"id":1234567890123456789}' }, { key: "ip", value: "192.0.2.1" }] }] }, id);
  assert.match(precise.textContent!, /1234567890123456789/);
  assert.equal(precise.querySelectorAll(".pf-report-structured").length, 2);
});

test("Oathnet validates envelopes and gives actionable failures", () => {
  assert.deepEqual(parseOathnetResponse({ status: 200, body: { data: { username: "test" } } }), { username: "test" });
  assert.deepEqual(parseOathnetResponse({ status: 200, body: { success: false, message: "No results found." } }, "history"), { history: [] });
  assert.throws(() => parseOathnetResponse({ status: 200, body: { success: false, message: "No results found." } }, "profile"), /No results found/);
  for (const [status, message] of [[401, /API key/], [403, /quota/], [404, /No Oathnet data/], [429, /rate limited/]] as const) {
    assert.throws(() => parseOathnetResponse({ status, body: {} }), message);
  }
  for (const response of [null, { status: 200, body: null }, { status: 200, body: { data: [] } }]) {
    assert.throws(() => parseOathnetResponse(response));
  }
});

test("username history tolerates absent and malformed records", () => {
  assert.deepEqual(oathnetHistory({ history: [null, {}, { name: ["old", null, "new"], time: ["2024"] }] }), [["old", "2024"], ["new", "Date unavailable"]]);
  assert.deepEqual(oathnetHistory({ history: "bad" }), []);
});

test("full lookup is on demand, preserves the summary and retries only history", async () => {
  const calls: string[] = [];
  let failHistory = true;
  const section = oathnetSection("300760994454437890", async kind => {
    calls.push(kind);
    if (kind === "profile") return { username: "<img src=x onerror=bad()>", badges: [{ description: "Platinum", icon: "abc123" }], additional_field: "complete report value" };
    if (failHistory) throw new Error("History unavailable");
    return { history: [{ name: ["old-name"], time: ["2024"] }] };
  });
  assert.equal(calls.length, 0);
  const button = section.element.querySelector("button")!;
  button.click();
  await tick();
  assert.deepEqual(calls, ["profile", "history"]);
  assert.equal(button.textContent, "Retry username history");
  assert.match(section.element.textContent!, /History unavailable/);
  assert.equal(section.element.querySelector('img[src="x"]'), null);
  assert.equal(section.element.querySelector(".pf-badge img")?.getAttribute("src"), "https://cdn.discordapp.com/badge-icons/abc123.png");
  assert.match(section.element.querySelector("details")!.textContent!, /complete report value/);
  failHistory = false;
  button.click();
  await tick();
  assert.deepEqual(calls, ["profile", "history", "history"]);
  assert.match(section.element.textContent!, /old-name/);
  assert.equal(button.hidden, true);
});

test("closing a profile prevents the second lookup and detached UI updates", async () => {
  let resolve!: (data: Record<string, unknown>) => void;
  let calls = 0;
  const section = oathnetSection("300760994454437890", () => { calls++; return new Promise(done => { resolve = done; }); });
  section.element.querySelector("button")!.click();
  section.close();
  resolve({ username: "test" });
  await tick();
  assert.equal(calls, 1);
  assert.equal(section.element.querySelector("dl"), null);
});
