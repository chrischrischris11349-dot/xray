import { oathnetPage, oathnetSearch } from "../src/ui/oathnetSearch";
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


test("full Oathnet search displays all fields and navigates cursor pages",async()=>{
 const cursors:(string|undefined)[]=[];
 const view=oathnetSearch("300760994454437890",async cursor=>{cursors.push(cursor);return {success:true,data:{items:cursor?[{dbname:"second-source",discordid:"300760994454437890",nested:{example:"second page detail"}}]:[{dbname:"first-source",username:"sample",ip:"192.0.2.1",license:"synthetic-license"}],meta:{total:2,has_more:!cursor},next_cursor:cursor?null:"opaque+/=cursor"}};});
 assert.equal(cursors.length,0);await view.load();
 assert.match(view.element.textContent!,/first-source/);assert.match(view.element.textContent!,/synthetic-license/);assert.match(view.element.textContent!,/192.0.2.1/);
 assert.equal(view.element.querySelector<HTMLDetailsElement>(".pf-report-card")!.open,true);
 const next=[...view.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Next search page")!;next.click();await tick();
 assert.deepEqual(cursors,[undefined,"opaque+/=cursor"]);assert.match(view.element.textContent!,/second page detail/);assert.equal(next.disabled,true);
 const prev=[...view.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Previous search page")!;prev.click();assert.match(view.element.textContent!,/first-source/);assert.equal(cursors.length,2);
 view.close();
});
test("Oathnet search errors preserve a readable failure and reject malformed cursors",async()=>{
 assert.throws(()=>oathnetPage({success:true,data:{username:"profile-only"}}),/items array/);
 assert.throws(()=>oathnetPage({data:{items:[],next_cursor:{bad:1}}}),/cursor/);
 const view=oathnetSearch("300760994454437890",async()=>{throw Error("Plan denied this search");});await view.load();assert.match(view.element.textContent!,/Plan denied/);view.close();
});

test("retrying a failed Oathnet next page preserves its cursor and current results",async()=>{
 const cursors:(string|undefined)[]=[];let fail=true;
 const view=oathnetSearch("300760994454437890",async cursor=>{
  cursors.push(cursor);if(cursor && fail){fail=false;throw Error("Temporary failure");}
  return {data:{items:[{dbname:cursor?"second-source":"first-source"}],next_cursor:cursor?null:"next-page"}};
 });
 await view.load();
 [...view.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Next search page")!.click();await tick();
 assert.match(view.element.textContent!,/first-source/);assert.match(view.element.textContent!,/Temporary failure/);
 [...view.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Retry search page")!.click();await tick();
 assert.deepEqual(cursors,[undefined,"next-page","next-page"]);assert.match(view.element.textContent!,/second-source/);view.close();
});
