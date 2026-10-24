import assert from "node:assert/strict";
import { test } from "node:test";
import { retryHistoryLoad, configureHistory, flushHistory, historyError, historyFor, observeProfileResponse, saveProfileNote } from "../src/history";
import { switchHistoryAccount } from "./history-discord.fixture";
import { parseHTML } from "linkedom";
import { profileJournal } from "../src/ui/profileJournal";

test("history coalesces slow writes, retains offline changes in memory and isolates account reads",async()=>{
  const id="300760994454437890",owner="300760994454437899";
  let value:string|null=null,revision=0,offline=false,slow=false,release:(()=>void)|undefined;
  const writes:string[]=[];let inFlight=0,maxInFlight=0;
  (window as any).__TAURI_INTERNALS__={invoke:async(_command:string,args:any)=>{
    if(args.value===null)return {value,revision};
    if(offline)throw Error("offline");
    inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);writes.push(args.value);
    if(slow)await new Promise<void>(resolve=>{release=resolve;});
    inFlight--;if(args.revision!==revision)throw Error("changed on another device");value=args.value;return{revision:++revision};
  }};
  window.localStorage.setItem(`xray.serverData.v1:${owner}`,"true");
  historyFor(id);await new Promise(resolve=>setTimeout(resolve,0));await configureHistory(id,true);
  writes.length=0;slow=true;
  const save=saveProfileNote(id,"note waiting for acknowledgement");await new Promise(resolve=>setTimeout(resolve,0));
  for(let i=0;i<50;i++)observeProfileResponse(id,{user:{id},user_profile:{bio:`observed ${i}`}});
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(writes.length,1,"events during a slow write must not queue full document snapshots");
  slow=false;release!();await save;await flushHistory();
  assert.equal(writes.length,2);assert.equal(maxInFlight,1);assert.match(value!,/observed 49/);assert.match(value!,/note waiting/);
  assert.equal(window.localStorage.getItem(`xray.profileHistory.v1:${owner}`),null);
  offline=true;await assert.rejects(saveProfileNote(id,"unsaved offline note"),/offline/);assert.match(historyError(),/only in memory/);assert.equal(historyFor(id)?.notes,"unsaved offline note");
  assert.equal(window.localStorage.getItem(`xray.profileHistory.v1:${owner}`),null);
  switchHistoryAccount();assert.equal(historyFor(id),undefined);
});


test("a failed server-history load can be retried without restarting or replacing data",async()=>{
 const owner="300760994454437897",target="300760994454437890";
 switchHistoryAccount(owner);window.localStorage.setItem(`xray.serverData.v1:${owner}`,"true");
 let offline=true;
 const value=JSON.stringify({version:1,people:{[target]:{enabled:true,startedAt:Date.now(),retentionDays:30,categories:["messages"],notes:"restored from server",events:[]}}});
 (window as any).__TAURI_INTERNALS__={invoke:async(_command:string,args:any)=>{if(offline)throw Error("server offline");return args.value===null?{value,revision:1}:{revision:2};}};
 historyFor(target);await new Promise(resolve=>setTimeout(resolve,0));assert.match(historyError(),/offline/);assert.equal(historyFor(target),undefined);
 offline=false;retryHistoryLoad();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(historyFor(target)?.notes,"restored from server");
});

test("profile history exposes failed-load retry and every retained timeline page",async()=>{
 (globalThis as any).document=parseHTML("<html><body></body></html>").document;
 const owner="300760994454437896",target="300760994454437890";
 switchHistoryAccount(owner);window.localStorage.setItem(`xray.serverData.v1:${owner}`,"true");
 let offline=true;const now=Date.now();
 const events=Array.from({length:85},(_,i)=>({id:`event-${i}`,kind:"messageObserved",at:now-i,messageText:`Retained entry ${i}`}));
 const value=JSON.stringify({version:1,people:{[target]:{enabled:false,startedAt:now,retentionDays:30,categories:["messages"],notes:"Saved profile",events}}});
 (window as any).__TAURI_INTERNALS__={invoke:async()=>{if(offline)throw Error("History service unavailable");return {value,revision:1};}};
 const journal=profileJournal({id:target,name:"Tester",username:"tester",presence:"offline",mutualServers:{state:"ready",value:[]}} as any);
 await new Promise(resolve=>setTimeout(resolve,0));
 const retry=[...journal.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Retry loading history");assert.ok(retry);
 offline=false;retry.click();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(journal.element.querySelectorAll(".pf-timeline li").length,40);
 let more=[...journal.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.startsWith("Show older history"));assert.ok(more);more.click();
 assert.equal(journal.element.querySelectorAll(".pf-timeline li").length,80);
 more=[...journal.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.startsWith("Show older history"));assert.ok(more);more.click();
 assert.equal(journal.element.querySelectorAll(".pf-timeline li").length,85);journal.close();
});
