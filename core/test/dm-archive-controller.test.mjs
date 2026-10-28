import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';
const owner='123456789012345678',target='223456789012345678',channel='323456789012345678';
async function fixture(){
 const handlers=new Map(),calls=[];let failStatus=false,releaseUpload,holdUpload=false,releasePage;
 const scope={owner,target,channel,enabled:1,done:1,head:'423456789012345678'};
 const stubs={
  '../api/flux':'export const onAction=(name,fn)=>globalThis.handlers.set(name,fn);export const intercept=fn=>globalThis.fixtureIntercept=fn;',
  '../discord':'export const myId=()=>globalThis.fixtureOwner;export const http=()=>({get:()=>globalThis.fixturePage()});export const stores={channels:{getMutablePrivateChannels:()=>({})},messages:{getMessage:()=>null}};',
  '../shell/bridge':'export const invoke=async(_command,args)=>globalThis.fixtureTransfer(args.payload);',
  '../shell/serverStorage':'export const serverDataEnabled=()=>true;export const onStorageModeChanged=()=>{};'
 };
 const result=await build({entryPoints:['core/src/history/dmArchive.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'controller-fixture',setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:'stub'}:null);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
 const context={module:{exports:{}},fixtureOwner:owner,handlers,URL,URLSearchParams,setTimeout,fixturePage:async()=>({body:[]}),fixtureTransfer:async payload=>{calls.push(payload);if(payload.action==='status'&&failStatus)throw Error('Status read offline');if(payload.action==='ingest'&&holdUpload)return new Promise(resolve=>{releaseUpload=resolve;});if(payload.action==='ingest')return {saved:1};return {scopes:[{...scope,target:payload.target??target}],bytes:0,maxBytes:524288000};}};
 vm.runInNewContext(result.outputFiles[0].text,context);const api=context.module.exports;api.startDmArchive();return {api,handlers,calls,context,fail(value){failStatus=value;},hold(){holdUpload=true;},release(){releaseUpload?.({saved:1});},holdPage(){context.fixturePage=()=>new Promise(resolve=>{releasePage=resolve;});},releasePage(){releasePage?.({body:[]});}};
}
test('an archive status/read failure does not block updates, but in-flight uploads are drained',async()=>{
 const f=await fixture();f.fail(true);f.handlers.get('CONNECTION_OPEN')();for(let n=0;n<8;n++)await Promise.resolve();assert.match(f.api.dmArchiveStatus().error,/offline/);await f.api.flushDmArchive();
 f.fail(false);await f.api.loadDmArchive();f.hold();f.context.fixtureIntercept({type:'MESSAGE_CREATE',message:{id:'523456789012345678',channel_id:channel,author:{id:target},content:'Test upload'}});for(let n=0;n<4;n++)await Promise.resolve();assert.equal(f.api.dmArchiveStatus().pending,1);
 let drained=false;const flush=f.api.flushDmArchive().then(()=>drained=true);await Promise.resolve();assert.equal(drained,false);f.release();await flush;assert.equal(f.api.dmArchiveStatus().pending,0);assert.equal(drained,true);
});
test('resume reloads saved scopes even when a DM is closed and clears account-specific error state',async()=>{
 const f=await fixture();await f.api.savePastDms(target);assert.deepEqual(Array.from(f.calls.find(call=>call.action==='configure').channels),[channel]);assert.ok(f.calls.some(call=>call.action==='checkpoint'));
 f.fail(true);f.handlers.get('CONNECTION_OPEN')();for(let n=0;n<8;n++)await Promise.resolve();assert.match(f.api.dmArchiveStatus().error,/offline/);f.handlers.get('LOGOUT')();assert.equal(f.api.dmArchiveStatus().error,'');
});
test('stopping one person does not await another person’s history request',async()=>{
 const f=await fixture();f.holdPage();const running=f.api.savePastDms(target);for(let n=0;n<16;n++)await Promise.resolve();
 let stopped=false;const other='623456789012345678',stop=f.api.stopDmArchive(other).then(()=>stopped=true);for(let n=0;n<24;n++)await Promise.resolve();
 try{assert.equal(stopped,true);assert.ok(f.calls.some(call=>call.action==='configure'&&call.target===other&&call.enabled===false));}finally{f.api.pauseDmArchive();f.releasePage();await running;await stop;}
});


test('exact linked recovery saves only the selected author and keeps the original ID',async()=>{
 const f=await fixture(),id='723456789012345678',url=`https://discord.com/channels/@me/${channel}/${id}`;
 f.context.fixturePage=async()=>({body:{id,author:{id:target},attachments:[{filename:'voice-message.ogg',content_type:'audio/ogg',url:'https://cdn.discordapp.com/attachments/123/456/voice-message.ogg'}],content:''}});
 await f.api.saveDmMessageLink(target,url);const saved=f.calls.find(call=>call.action==='ingest');assert.equal(saved.messages[0].id,id);assert.equal(saved.messages[0].audio.length,1);
 const writes=f.calls.filter(call=>call.action==='ingest').length;f.context.fixturePage=async()=>({body:{id,author:{id:owner}}});await assert.rejects(f.api.saveDmMessageLink(target,url),/unavailable/);assert.equal(f.calls.filter(call=>call.action==='ingest').length,writes);
 await assert.rejects(f.api.saveDmMessageLink(target,'https://attacker.example/channels/@me/'+channel+'/'+id),/HTTPS Discord/);
});
