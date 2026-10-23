import assert from "node:assert/strict";
import { test } from "node:test";
import { configureHistory, flushHistory, historyError, historyFor, observeProfileResponse, saveProfileNote } from "../src/history";
import { switchHistoryAccount } from "./history-discord.fixture";

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
