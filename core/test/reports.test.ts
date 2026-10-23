import { test } from "node:test";
import assert from "node:assert/strict";
import { channelList, conversationLabel, queryAvailableMessages } from "../src/ui/messageHistory";
import { searchMessagePage, searchDmPage } from "../src/ui/messageSearch";
import { resultReport, reportCsv, printableReport, csvCell } from "../src/ui/reportExport";
import { pasteText, writeClipboard } from "../src/ui/clipboard";
import { viewerUrl } from "../src/ui/imageViewer";
import { ProfileHistory } from "../src/history/model";
import { HistoryObserver } from "../src/history/observer";
const user="300760994454437890",guild="300760994454437891",dm="300760994454437892",msg="300760994454437893";

test("nested channel wrappers, maps, DMs and retained deletions merge without duplicates",()=>{
  const channels=channelList({SELECTABLE:[{channel:{id:guild,type:0,guild_id:guild}}]},new Map([[dm,{id:dm,type:1}]]));
  assert.equal(channels.length,2);assert.match(conversationLabel(channels[1]),/^DM/);assert.match(conversationLabel({type:3,id:dm}),/^Group DM/);
  const rows=queryAvailableMessages(user,channels,id=>id===dm?{toArray:()=>[{id:msg,author:{id:user},content:"current"}]}:[],[{id:"delete",at:1,kind:"messageDeleted",channelId:dm,messageId:msg,messageText:"retained"}]);
  assert.equal(rows.length,1);assert.equal(rows[0].deleted,true);assert.equal(rows[0].content,"current");assert.equal(rows[0].events.length,1);
  const observed=queryAvailableMessages(user,[],()=>[],[{id:"one",at:1,kind:"messageObserved",channelId:dm,messageId:msg,messageText:"original"},{id:"two",at:2,kind:"messageEdited",channelId:dm,messageId:msg,messageText:"latest"}]);assert.equal(observed[0].content,"latest");
});
test("server author queries encode IDs and use total_results instead of short page length",async()=>{
  let url="";const page=await searchMessagePage(async request=>{url=request.url;return{body:{total_results:80,messages:[[{id:msg,author:{id:user}}],[{id:"other",author:{id:guild}}]]}};},{id:guild,kind:"guild"},user);
  assert.match(url,new RegExp(`author_id=${user}`));assert.match(url,/offset=0/);assert.equal(page.messages.length,1);assert.equal(page.next,25);
  await assert.rejects(searchMessagePage(async()=>({status:202,body:{retry_after:2}}),{id:guild,kind:"guild"},user),/indexing/);
  await assert.rejects(searchMessagePage(async()=>({status:403}),{id:guild,kind:"guild"},user),/403/);
  await assert.rejects(searchMessagePage(async()=>({status:429,body:{retry_after:5}}),{id:guild,kind:"guild"},user),/Rate limited/);
  await assert.rejects(searchMessagePage(async()=>({body:{}}),{id:guild,kind:"guild"},user),/unsupported/);
});
test("DM history keeps snowflake cursors exact and filters authors",async()=>{
  let url="";const rows=Array.from({length:100},(_,i)=>({id:String(BigInt(msg)+BigInt(i)),author:{id:i%2?user:guild}}));
  const result=await searchDmPage(async r=>{url=r.url;return{body:rows};},dm,user,msg);
  assert.match(url,new RegExp(`before=${msg}`));assert.equal(result.before,msg);assert.equal(result.messages.length,50);
});
test("CSV/JSON exports preserve records, state unknown metrics, and escape printable input",()=>{
  const report=resultReport("<script>attack</script>",[{source:"one",text:'a,"b"\nnext',nested:{id:msg}},{source:"one",text:"=HYPERLINK(1)"}]);
  assert.equal(report.summary.totalFound,2);assert.equal(report.summary.infectedMachines,null);
  assert.deepEqual(JSON.parse(JSON.stringify(report)).records,report.records);
  assert.match(reportCsv(report),/a,""b""\nnext/);assert.equal(csvCell("=1+1"),'"\'=1+1"');assert.equal(csvCell("  @SUM(1)"),'"\'  @SUM(1)"');
  assert.doesNotMatch(printableReport(report),/<script>/);assert.match(printableReport(report),/&lt;script&gt;/);
  assert.deepEqual(resultReport("sources",[{source:"__proto__"}]).summary.topSources,[["__proto__",1]]);
});
test("paste replaces a selection, respects limits and dispatches input; copy has a permission fallback",async()=>{
  let input=0;const field={value:"abcd",selectionStart:1,selectionEnd:3,maxLength:6,readOnly:false,disabled:false,setRangeText(text:string,a:number,b:number){this.value=this.value.slice(0,a)+text+this.value.slice(b);},dispatchEvent(){input++;}};
  pasteText(field as any,"123456");assert.equal(field.value,"a1234d");assert.equal(input,1);field.disabled=true;pasteText(field as any,"x");assert.equal(input,1);
  const previousDocument=globalThis.document;const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  let copied=false,removed=false;
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{writeText:async()=>{throw Error("denied");}}}});
  (globalThis as any).document={activeElement:null,body:{append(){}},createElement:()=>({style:{},setAttribute(){},focus(){},select(){},remove(){removed=true;}}),execCommand:(command:string)=>{copied=command==="copy";return true;}};
  try {assert.equal(await writeClipboard("test"),true);assert.equal(copied,true);assert.equal(removed,true);}finally{(globalThis as any).document=previousDocument;if(previousNavigator)Object.defineProperty(globalThis,"navigator",previousNavigator);}
});
test("viewer accepts cached raster and Discord images and rejects active/untrusted content",()=>{
  assert.equal(viewerUrl("javascript:alert(1)"),null);assert.equal(viewerUrl("data:image/svg+xml;base64,AAA"),null);assert.equal(viewerUrl("https://tracker.invalid/test.png"),null);
  assert.ok(viewerUrl("https://cdn.discordapp.com/attachments/a/b/a.png"));assert.ok(viewerUrl("data:image/png;base64,AAAA"));
});
test("observed edits retain before/after text and sent time when explicitly enabled",()=>{
  const h=new ProfileHistory();h.configure(user,true,["messages","edits"]);const o=new HistoryObserver(h);
  o.handle({type:"MESSAGE_CREATE",message:{id:msg,channel_id:dm,author:{id:user},content:"original",timestamp:"2026-10-23T12:00:00Z"}});
  o.handle({type:"MESSAGE_UPDATE",message:{id:msg,channel_id:dm,content:"edited",edited_timestamp:"2026-10-23T12:01:00Z"}});
  const e=new ProfileHistory(h.serialize()).get(user)!.events.at(-1)!;assert.equal(e.messageBefore,"original");assert.equal(e.messageText,"edited");assert.equal(e.messageSentAt,"2026-10-23T12:00:00.000Z");
});
