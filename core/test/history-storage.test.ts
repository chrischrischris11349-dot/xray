import assert from "node:assert/strict";
import { test } from "node:test";
import { retryHistoryLoad, configureHistory, flushHistory, historyError, historyFor, observeProfileResponse, saveProfileNote, retainRecoveredMedia } from "../src/history";
import { switchHistoryAccount } from "./history-discord.fixture";
import { parseHTML } from "linkedom";
import { profileJournal } from "../src/ui/profileJournal";
import { archivedMedia } from "../src/ui/archivedMedia";
import { viewerUrl } from "../src/ui/imageViewer";
import {offlineDb} from '../src/shell/offlineDb';

test("history coalesces slow writes, durably saves offline changes and isolates accounts",async()=>{
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
  offline=true;await saveProfileNote(id,"saved offline note");assert.match(historyError(),/device/);assert.equal(historyFor(id)?.notes,"saved offline note");
  const backup=await offlineDb.get(owner,'document',`profile-history.${owner}`);assert.equal(backup?.pending,true);assert.match(backup?.data.value,/saved offline note/);
  assert.equal(window.localStorage.getItem(`xray.profileHistory.v1:${owner}`),null);
  switchHistoryAccount();assert.equal(historyFor(id),undefined);
});


test("a failed server-history load can be retried without restarting or replacing data",async()=>{
 const owner="300760994454437897",target="300760994454437890";
 switchHistoryAccount(owner);window.localStorage.setItem(`xray.serverData.v1:${owner}`,"true");
 let offline=true;
 const value=JSON.stringify({version:1,people:{[target]:{enabled:true,startedAt:Date.now(),retentionDays:30,categories:["messages"],notes:"restored from server",events:[]}}});
 (window as any).__TAURI_INTERNALS__={invoke:async(_command:string,args:any)=>{if(offline)throw Error("server offline");return args.value===null?{value,revision:1}:{revision:2};}};
 historyFor(target);await new Promise(resolve=>setTimeout(resolve,0));assert.match(historyError(),/unavailable/);assert.equal(historyFor(target),undefined);
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
 const firstEvent=journal.element.querySelector<HTMLDetailsElement>(".history-event")!;firstEvent.open=true;
 let more=[...journal.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.startsWith("Show older history"));assert.ok(more);more.click();
 assert.equal(journal.element.querySelectorAll(".pf-timeline li").length,80);
 assert.equal(journal.element.querySelector(".history-event"),firstEvent);assert.equal(firstEvent.open,true,"paging retains expanded event DOM");
 more=[...journal.element.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.startsWith("Show older history"));assert.ok(more);more.click();
 assert.equal(journal.element.querySelectorAll(".pf-timeline li").length,85);journal.close();
});
test("server archive playback uses native authenticated URLs and reports failures without source credentials",async()=>{
 const dom=parseHTML("<html><body></body></html>");(globalThis as any).document=dom.document;
 const owner="300760994454437899";switchHistoryAccount(owner);window.localStorage.setItem(`xray.serverData.v1:${owner}`,"true");
 const url=`https://archive.example/media/file/${"a".repeat(64)}?expires=${Date.now()+3600_000}&signature=${"b".repeat(64)}`;
 let calls=0,shown="",fail=false;
 (window as any).__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{calls++;assert.equal(command,"history_media");assert.equal(args.owner,owner);if(fail)throw Error("Archive unavailable");return args.offset===0?{state:"ready",bytes:1,mime:"image/png",offset:0,next:1,data:"YQ=="}:{state:"ready",url,bytes:1,mime:"image/png"};}};
 const a=archivedMedia("https://cdn.discordapp.com/attachments/123/456/image.png","image",value=>shown=value)!;
 const b=archivedMedia("https://cdn.discordapp.com/attachments/123/456/image.png","image",()=>{})!;
 dom.document.body.append(a,b);
 await new Promise(r=>setTimeout(r,0));assert.equal(calls,2);assert.match(shown,/^blob:/);assert.match(a.textContent!,/server copy/);assert.equal(viewerUrl(shown),shown);
 fail=true;const failed=archivedMedia("https://cdn.discordapp.com/attachments/123/456/video.mp4","video",()=>{})!;await new Promise(r=>setTimeout(r,0));assert.match(failed.textContent!,/Archive unavailable/);assert.equal(failed.querySelector("button")!.hidden,false);
 a.remove();b.remove();window.localStorage.setItem(`xray.serverData.v1:${owner}`,"false");assert.ok(archivedMedia("unused","image",()=>{}),'Local media fallback remains available without server mode');
});

test("recovered photo/video metadata persists and refreshes the existing journal immediately",async()=>{
 const dom=parseHTML("<html><body></body></html>");(globalThis as any).document=dom.document;
 const owner="300760994454437895",target="300760994454437890",channel="300760994454437892",message="300760994454437893";
 switchHistoryAccount(owner);window.localStorage.setItem(`xray.serverData.v1:${owner}`,"true");
 let value=JSON.stringify({version:1,people:{[target]:{enabled:true,startedAt:Date.now(),retentionDays:90,categories:["messages"],events:[{id:"old",at:Date.now(),kind:"messageObserved",channelId:channel,messageId:message,messageText:"Historical text",messageFiles:["photo.png","clip.mp4"],messageImages:[]}]}}}),revision=1;
 (window as any).__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{if(command==="history_media")return{state:"failed",error:"Test only"};if(args.ns!==`profile-history.${owner}`)return args.value===null?{value:null,revision:0}:{revision:args.revision+1};if(args.value===null)return{value,revision};value=args.value;revision=args.revision+1;return{revision};}};
 const journal=profileJournal({id:target,name:"Tester",username:"tester",presence:"offline",mutualServers:{state:"ready",value:[]}} as any);await new Promise(r=>setTimeout(r,0));
 const detail=journal.element.querySelector<HTMLDetailsElement>(".history-event")!;detail.open=true;detail.dispatchEvent(new dom.Event("toggle"));assert.match(detail.textContent!,/Recover original attachments/);
 const photo="https://cdn.discordapp.com/attachments/123/456/photo.png",video="https://cdn.discordapp.com/attachments/123/789/clip.mp4";
 await retainRecoveredMedia(target,{id:message,channel_id:channel,author:{id:target},content:"A newer edit",attachments:[{filename:"photo.png",url:photo},{filename:"clip.mp4",url:video}]});
 assert.equal(journal.element.querySelector(".history-event img")?.getAttribute("src"),photo);assert.equal(journal.element.querySelector(".history-event video")?.getAttribute("src"),video);
 const saved=JSON.parse(value).people[target].events[0];assert.equal(saved.messageText,"Historical text");assert.deepEqual(saved.messageVideos,[video]);journal.close();
});
