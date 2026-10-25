import { oathnetPage, oathnetSearch } from "../src/ui/oathnetSearch";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { oathnetHistory, oathnetSection, parseOathnetResponse } from "../src/ui/oathnet";
import { renderImportedReport, reportAvatar } from "../src/ui/importedReport";
import { historyEventDetail } from "../src/ui/profileJournal";
import { parseLocalReport } from "../src/ui/intelligence";
import { resultReport } from "../src/ui/reportExport";
import { oathnetFullReport, oathnetIndicators, type OathnetRequest } from "../src/ui/oathnetFullReport";

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
  assert.equal(rendered.querySelectorAll(".pf-report-card dd").length, 3);
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
  assert.equal(section.element.querySelector(".pf-facts"), null);
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

test("report summaries expose source IP counts and each source record has a bundled icon",()=>{
 const view=renderImportedReport({metadata:{query:"300760994454437890"},totals:{records:31,ips:1},records:[{source:"Breach",fields:[{key:"ip",value:"192.0.2.1"}]}]},"300760994454437890");
 assert.match(view.querySelector('[aria-label="Report summary"]')!.textContent!,/IP addresses1/);
 assert.equal(view.querySelectorAll(".intel-record-icon svg").length,1);
 const details=view.querySelector<HTMLDetailsElement>(".pf-report-card")!;details.open=true;assert.match(details.textContent!,/192.0.2.1/);
});

test("history detail lazily reveals complete text, fields and images with safe links",()=>{
 const dom=parseHTML("<html><body></body></html>");(globalThis as any).document=dom.document;
 const event={id:"synthetic-event",at:Date.now(),kind:"messageDeleted" as const,messageText:"Full observed text https://example.com/details",messageImages:["https://cdn.discordapp.com/attachments/123/456/image.png"]};
 const detail=historyEventDetail(event);assert.equal(detail.querySelector("pre"),null);assert.ok(detail.querySelector("svg"));
 (detail as HTMLDetailsElement).open=true;detail.dispatchEvent(new dom.Event("toggle"));
 assert.match(detail.querySelector("pre")!.textContent!,/Full observed text/);assert.match(detail.textContent!,/Images \(1\)/);
 assert.equal(detail.querySelector("a")!.getAttribute("rel"),"noopener noreferrer");
 assert.match(detail.textContent!,/synthetic-event/);
});

test("generic imported exports retain totals and the original payload for profile reports",()=>{
 const raw={totals:{records:31,ips:1},records:[{ip:"192.0.2.1"}]};
 const imported=parseLocalReport(JSON.stringify(raw),"Reports","300760994454437890");
 const report=resultReport("Imported",imported.records,imported);
 assert.equal(report.summary.totalFound,31);assert.equal(report.summary.ipAddresses,1);assert.equal(report.summary.returnedIpAddresses,1);
 assert.deepEqual(imported.response,raw);
});

test("full live report loads every source cursor, preserves all exports and resolves returned IPs",async()=>{
 const calls:any[]=[];
 const request:OathnetRequest=async(op,q,cursor,sid)=>{
  calls.push([op,q,cursor,sid]);if(op==="session")return{data:{session:{id:"sess_test"},user:{daily_lookups:{remaining:7}}}};
  assert.equal(sid,"sess_test");
  if(op==="ip")return{data:{ip:q,org:"Returned network information"}};
  return{data:{items:op==="search"?[{id:cursor?"b":"a",ip:cursor?"192.0.2.2":"192.0.2.1",dbname:"Returned breach"}]:op==="stealer"?[{id:"credential",email:"tester@example.com"}]:[],meta:{total:op==="search"?2:op==="stealer"?1:0},next_cursor:op==="search"&&!cursor?"next-live-page":null}};
 };
 const view=oathnetFullReport("300760994454437890",{request,includeProfiles:false});assert.equal(calls.length,0);await view.load();
 assert.equal(calls.filter(c=>c[0]==="search").length,2);assert.equal(calls.filter(c=>c[0]==="stealer").length,1);assert.equal(calls.filter(c=>c[0]==="victims").length,1);
 assert.equal(view.report().records.length,5);assert.equal(view.report().summary.totalFound,5);assert.equal(view.report().summary.returnedIpAddresses,2);
 assert.match(view.element.textContent!,/192\.0\.2\.2/);assert.match(JSON.stringify(view.report()),/Returned network information/);assert.match(view.element.textContent!,/Victim profiles: 0 loaded \/ 0 source matches/);view.close();
});

test("full report keeps denial distinct from empty and retries just the failed source",async()=>{
 let denied=true;const calls:string[]=[];
 const view=oathnetFullReport("300760994454437890",{includeProfiles:false,request:async(op)=>{
  calls.push(op);if(op==="session")return{data:{session:{id:"sess_test"}}};if(op==="victims"&&denied)throw Error("Plan denied victim access");return{data:{items:[],meta:{total:0}}};
 }});
 await view.load();assert.match(view.element.textContent!,/Plan denied victim access/);assert.equal(view.report().summary.totalFound,null);
 denied=false;await view.load();assert.equal(calls.filter(op=>op==="search").length,1);assert.equal(calls.filter(op=>op==="victims").length,2);assert.equal(view.report().summary.totalFound,0);view.close();
});

test("full report retains more than 1,000 records while rendering only 50",async()=>{
 const view=oathnetFullReport("300760994454437890",{includeProfiles:false,request:async(op)=>op==="session"?{data:{session:{id:"sess_test"}}}:{data:{items:op==="search"?Array.from({length:1101},(_,i)=>({id:String(i),dbname:"Returned source"})):[],meta:{total:op==="search"?1101:0}}}});
 await view.load();assert.equal(view.report().records.length,1101);assert.equal(view.element.querySelectorAll(".pf-report-card").length,50);assert.match(JSON.stringify(view.report()),/1100/);view.close();
 assert.deepEqual(oathnetIndicators([{raw_data:'{"victim_ip":"192.0.2.1","steam":"110000100000000"}'}]).ips,["192.0.2.1"]);
});
