import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';
const output=await build({entryPoints:['core/src/history/dmBackfill.ts'],bundle:true,write:false,platform:'node',format:'cjs'}),context={module:{exports:{}}};vm.runInNewContext(output.outputFiles[0].text,context);const {backfillDm}=context.module.exports;
const scope={owner:'123456789012345678',target:'223456789012345678',channel:'323456789012345678',enabled:1,done:0};
test('initial load saves empty-author pages too, acknowledges pages before advancing, and completes oldest page',async()=>{
 const calls=[];await backfillDm(scope,{active:()=>true,page:async before=>{calls.push(['page',before]);return before?{messages:['old']}:{messages:[],before:'100',newest:'200'};},save:async rows=>calls.push(['save',...rows]),checkpoint:async change=>calls.push(['checkpoint',JSON.parse(JSON.stringify(change))]),progress(){},yield:async()=>{}});
 assert.deepEqual(calls,[['page',undefined],['save'],['checkpoint',{before:'100',done:false,head:'200'}],['page','100'],['save','old'],['checkpoint',{done:true}]]);
});
test('resume catches up missing recent pages before continuing older checkpoint, and a failed write never checkpoints',async()=>{
 const cursors=[],saved=[],checks=[];await backfillDm({...scope,head:'150',before_id:'50'},{active:()=>true,page:async before=>{cursors.push(before);return before==='50'?{messages:['backlog']}:{messages:['recent'],oldest:'100',newest:'250',before:'100'};},save:async rows=>saved.push(...rows),checkpoint:async change=>checks.push(change),progress(){},yield:async()=>{}});assert.deepEqual(cursors,[undefined,'50']);assert.deepEqual(saved,['recent','backlog']);assert.equal(checks[0].head,'250');
 let checkpoints=0;await assert.rejects(backfillDm(scope,{active:()=>true,page:async()=>({messages:[1],before:'1'}),save:async()=>{throw Error('offline');},checkpoint:async()=>{checkpoints++;},progress(){},yield:async()=>{}}),/offline/);assert.equal(checkpoints,0);
});
test('pause or account switch during a fetch stops uploads; completed archives still catch up on restart',async()=>{
 let active=true,saves=0;await backfillDm(scope,{active:()=>active,page:async()=>{active=false;return {messages:[1]};},save:async()=>{saves++;},checkpoint:async()=>{},progress(){},yield:async()=>{}});assert.equal(saves,0);
 let pages=0;await backfillDm({...scope,done:1,head:'100'},{active:()=>true,page:async()=>{pages++;return {messages:[],oldest:'90',newest:'200'};},save:async()=>{},checkpoint:async()=>{},progress(){},yield:async()=>{}});assert.equal(pages,1);
});

test('history cursor uses all authors and preserves all returned attachment images',async()=>{
 const output=await build({stdin:{contents:'export {searchDmPage} from "./core/src/ui/messageSearch";export {dmSnapshot} from "./core/src/history/dmSnapshot";',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'}),ctx={module:{exports:{}},URL,URLSearchParams};vm.runInNewContext(output.outputFiles[0].text,ctx);
 const user='223456789012345678',channel='323456789012345678',rows=Array.from({length:100},(_,n)=>({id:String(500000000000000000n-BigInt(n)),author:{id:n===0?user:'423456789012345678'}}));
 const page=await ctx.module.exports.searchDmPage(async()=>({body:rows}),channel,user);assert.equal(page.messages.length,1);assert.equal(page.before,rows.at(-1).id);assert.equal(page.messages[0].channel_id,channel);
 await assert.rejects(ctx.module.exports.searchDmPage(async()=>({status:429,body:{retry_after:3}}),channel,user),/Wait 3/);
 await assert.rejects(ctx.module.exports.searchDmPage(async()=>({body:[{id:'bad'}]}),channel,user),/invalid message IDs/);
 const snapshot=ctx.module.exports.dmSnapshot({id:rows[0].id,author:{id:user},content:'All ten photos',attachments:Array.from({length:10},(_,n)=>({filename:`${n}.png`,content_type:'image/png',url:`https://cdn.discordapp.com/attachments/123/${456+n}/${n}.png`}))},channel);assert.equal(snapshot.images.length,10);assert.equal(snapshot.files.length,10);
});
