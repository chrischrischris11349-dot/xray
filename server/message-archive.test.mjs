import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {messageArchive} from './message-archive.mjs';
const owner='123456789012345678',target='223456789012345678',channel='323456789012345678',message='423456789012345678';
const row={id:message,channel,author:target,content:'Original',images:['https://cdn.discordapp.com/attachments/123/456/photo.png']};
test('history and live overlap deduplicate, deletions stay sticky, and archives survive a new store instance',()=>{
 const db=new DatabaseSync(':memory:'),media=[];let store=messageArchive(db,{onMedia:(...args)=>media.push(args)});
 assert.throws(()=>store.ingest({owner,target,channel,mode:'history',messages:[row]}),/not enabled/);
 store.configure({owner,target,channels:[channel],enabled:true});const put=(messages,mode='history')=>store.ingest({owner,target,channel,mode,messages});
 put([row]);put([row]);assert.equal(store.status({owner,target}).scopes[0].count,1);assert.equal(media.length,2);
 put([{...row,content:'Edited',images:[],editedAt:'2026-10-26T01:00:00Z'}],'live');assert.equal(store.page({owner,target}).messages[0].images.length,1);put([row]);assert.equal(store.page({owner,target}).messages[0].content,'Edited');assert.equal(store.page({owner,target}).messages[0].firstContent,'Original');
 put([{...row,content:'Replayed create'}],'live');assert.equal(store.page({owner,target}).messages[0].content,'Edited');store.deleted({owner,channel,ids:[message]});put([{...row,content:'Stale page'}]);put([{...row,content:'Later stale update'}],'live');
 store=messageArchive(db);const archived=store.page({owner,target}).messages[0];assert.equal(archived.content,'Edited');assert.equal(archived.deleted,true);assert.equal(archived.images[0],row.images[0]);assert.equal(store.page({owner:'523456789012345678',target}).messages.length,0);
 store.configure({owner,target,channels:[channel],enabled:false});assert.throws(()=>put([row]),/not enabled/);assert.equal(store.page({owner,target}).messages.length,1);db.close();
});
test('quota failure is atomic and checkpoints/page boundaries never lose previously stored rows',()=>{
 const db=new DatabaseSync(':memory:'),store=messageArchive(db,{maxBytes:1600});store.configure({owner,target,channels:[channel],enabled:true});
 store.ingest({owner,target,channel,mode:'history',messages:[row]});const bytes=store.status({owner}).bytes;
 assert.throws(()=>store.ingest({owner,target,channel,mode:'history',messages:[{...row,id:'423456789012345679'},{...row,id:'423456789012345680',content:'x'.repeat(2000)}]}),/quota/);assert.equal(store.page({owner,target}).messages.length,1);assert.equal(store.status({owner}).bytes,bytes);
 store.checkpoint({owner,target,channel,before:message,head:message});store.checkpoint({owner,target,channel,before:'423456789012345679',head:'423456789012345677'});assert.equal(store.status({owner}).scopes[0].before_id,message);assert.equal(store.status({owner}).scopes[0].head,message);
 assert.throws(()=>store.ingest({owner,target,channel,mode:'history',messages:[{...row,images:['https://localhost/private']}]}),/attachment/);db.close();
});

test('a deletion delivered while a history page is in flight marks the later saved snapshot deleted',()=>{
 const db=new DatabaseSync(':memory:'),store=messageArchive(db);store.configure({owner,target,channels:[channel],enabled:true});store.deleted({owner,channel,ids:[message]});store.ingest({owner,target,channel,mode:'history',messages:[row]});assert.equal(store.page({owner,target}).messages[0].deleted,true);assert.equal(store.page({owner,target}).messages[0].content,'Original');db.close();
});

test('text and media filters paginate saved audio without leaking another author into the selected profile',()=>{
 const db=new DatabaseSync(':memory:'),store=messageArchive(db);store.configure({owner,target,channels:[channel],enabled:true});store.ingest({owner,target,channel,mode:'history',messages:[{...row,images:[],content:'Text only'},{...row,id:'423456789012345679',content:'',images:[],audio:['https://cdn.discordapp.com/attachments/123/456/voice-message.ogg']}]});assert.equal(store.page({owner,target,filter:'media'}).messages.length,1);assert.equal(store.page({owner,target,filter:'text'}).messages[0].content,'Text only');assert.equal(store.page({owner,target:'623456789012345678',filter:'media'}).messages.length,0);assert.throws(()=>store.page({owner,target,filter:'sql'}),/filter/);db.close();
});
test('saved-message pages cover more than the rolling 200-event cap without duplicates',()=>{
 const db=new DatabaseSync(':memory:'),store=messageArchive(db);store.configure({owner,target,channels:[channel],enabled:true});
 for(let n=0;n<300;n++)store.ingest({owner,target,channel,mode:'history',messages:[{...row,id:String(BigInt(message)+BigInt(n))}]});
 const seen=new Set();let before;do{const result=store.page({owner,target,before});for(const row of result.messages){assert.ok(!seen.has(row.id));seen.add(row.id);}before=result.next;}while(before);assert.equal(seen.size,300);assert.equal(store.status({owner}).scopes[0].count,300);db.close();
});

test('archive HTTP requires authentication, rejects mismatched authors, and returns saved pages',async()=>{
 process.env.XRAY_LOG_TOKEN='test-archive-token-0123456789';const {openDb,store,createApp}=await import('./log-server.mjs');const {createServer}=await import('node:http');const {once}=await import('node:events');
 const db=openDb(':memory:'),archive=messageArchive(db),server=createServer(createApp(store(db),null,null,archive));server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}/message-archive`,post=(payload,auth=true)=>fetch(base,{method:'POST',headers:auth?{authorization:`Bearer ${process.env.XRAY_LOG_TOKEN}`}:{},body:JSON.stringify({owner,...payload})});
 try{assert.equal((await post({action:'status'},false)).status,401);assert.equal((await post({action:'restoreMedia'})).status,400);assert.equal((await post({action:'configure',target,channels:[channel],enabled:true})).status,200);
  assert.equal((await post({action:'ingest',target,channel,mode:'history',messages:[{...row,author:owner}]})).status,400);
  assert.equal((await post({action:'ingest',target,channel,mode:'history',messages:[row]})).status,200);const page=await (await post({action:'page',target})).json();assert.equal(page.messages.length,1);assert.equal(page.messages[0].content,'Original');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
});
