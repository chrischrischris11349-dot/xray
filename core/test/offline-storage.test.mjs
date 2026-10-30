import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
const compiled=await build({stdin:{contents:`export * from './core/src/shell/offlineDocuments';export * from './core/src/shell/offlineArchive';export * from './core/src/shell/offlineMedia';export * from './core/src/shell/offlineRecordings';export * from './core/src/shell/offlineDb';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'});
const context={module:{exports:{}},Blob,URL,TextEncoder,Uint8Array,ArrayBuffer,crypto:webcrypto,atob,btoa,setTimeout,clearTimeout,console,window:{localStorage:null}};vm.runInNewContext(compiled.outputFiles[0].text,context);
const {OfflineDocuments,OfflineArchive,OfflineMedia,OfflineRecordings,localRecord}=context.module.exports;
const owner='123456789012345678',other='223456789012345678',target='323456789012345678',channel='423456789012345678',message='523456789012345678',ns=`profile-history.${owner}`;
class Database{rows=new Map();fail=false;async get(o,k,id){return structuredClone(this.rows.get(`${o}|${k}|${encodeURIComponent(id)}`));}async list(o,k,g){return [...this.rows.values()].filter(r=>r.owner===o&&(!k||r.kind===k)&&(g===undefined||r.group===`${o}|${k}|${g}`)).map(r=>structuredClone(r));}async batch(put,remove=[]){if(this.fail)throw Error('disk full');const next=new Map(this.rows);for(const key of remove)next.delete(key);for(const row of put)next.set(row.key,structuredClone(row));this.rows=next;}}
const offline=async()=>{throw Error('server offline');};
test('document backups survive restart, accept offline edits and reconcile once without overwriting another device',async()=>{
 const db=new Database(),states=[];let value='original',revision=4,writes=0;
 const native=async(_cmd,args)=>{if(args.value===null)return{value,revision};assert.equal(args.revision,revision);value=args.value;writes++;return{revision:++revision};};
 let docs=new OfflineDocuments(db,(_o,text)=>states.push(text));const initial=await docs.transfer({ns,value:null},native);assert.equal(initial.value,'original');
 docs=new OfflineDocuments(db);assert.equal((await docs.transfer({ns,value:null},offline)).value,'original');await docs.transfer({ns,value:'offline edit',revision:initial.revision},offline);
 docs=new OfflineDocuments(db);assert.equal((await docs.transfer({ns,value:null},offline)).value,'offline edit');assert.equal((await docs.transfer({ns,value:null},native)).value,'offline edit');assert.equal(value,'offline edit');assert.equal(writes,1);await docs.transfer({ns,value:null},native);assert.equal(writes,1);
 assert.equal((await docs.transfer({ns:`profile-history.${other}`,value:null},offline)).value,null);
});
test('a conflicting server copy is preserved while local edits remain durable and visible',async()=>{
 const db=new Database(),docs=new OfflineDocuments(db);let value='base',revision=1;
 const native=async(_cmd,args)=>args.value===null?{value,revision}:(()=>{throw Error('changed on another device');})();
 await docs.transfer({ns,value:null},native);await docs.transfer({ns,value:'my pending note',revision:1},offline);value='another device note';revision=2;
 const loaded=await new OfflineDocuments(db).transfer({ns,value:null},native);assert.equal(loaded.value,'my pending note');assert.equal(loaded.local,true);assert.equal(value,'another device note');const preserved=(await db.get(owner,'document',ns)).data;assert.equal(preserved.conflict,true);assert.equal(preserved.serverConflict.value,'another device note');assert.equal(preserved.serverConflict.revision,2);
 await assert.rejects(docs.transfer({ns,value:'stale',revision:0},native),/changed/);await assert.rejects(docs.transfer({ns:`bot-history.${owner}`,value:'bad',revision:1},native),/Invalid/);
});
test('a stalled server read falls back to the durable copy and the next local edit does not wait for that server',async()=>{
 const db=new Database(),docs=new OfflineDocuments(db,()=>{},5);await docs.transfer({ns,value:null},async()=>({value:'saved',revision:1}));
 const reply=await docs.transfer({ns,value:null},()=>new Promise(()=>{}));assert.equal(reply.value,'saved');assert.equal(reply.local,true);
 let called=false;await docs.transfer({ns,value:'offline update',revision:reply.revision},async()=>{called=true;throw Error('must not block this save');});assert.equal(called,false);assert.equal((await db.get(owner,'document',ns)).data.value,'offline update');
});
test('archive replay order survives clock rollback and an unreadable local database still permits healthy server saves',async()=>{
 const db=new Database();await db.batch([localRecord(owner,'archive-clock','sequence',{next:Date.now()+100000},false)]);
 let archive=new OfflineArchive(db);await archive.transfer(owner,{action:'configure',target,channels:[channel],enabled:true},offline,false);
 archive=new OfflineArchive(db);await archive.transfer(owner,{action:'checkpoint',target,channel,done:true},offline,false);const queued=(await db.list(owner,'archive-operation')).sort((a,b)=>a.id.localeCompare(b.id));assert.equal(queued.length,2);assert.equal(queued[0].data.action,'configure');assert.equal(queued[1].data.action,'checkpoint');
 db.get=async()=>{throw Error('database could not open');};let calls=0;const reply=await archive.transfer(owner,{action:'configure',target,channels:[channel],enabled:true},async()=>{calls++;return{saved:true};});assert.equal(calls,1);assert.equal(reply.saved,true);
});
test('local disk failure never claims an offline edit was saved and healthy server reads still work',async()=>{
 const db=new Database(),docs=new OfflineDocuments(db),native=async()=>({value:'server value',revision:1});await docs.transfer({ns,value:null},native);db.fail=true;
 await assert.rejects(docs.transfer({ns,value:'not saved',revision:1},offline),/not saved/);assert.equal((await db.get(owner,'document',ns)).data.value,'server value');assert.equal((await docs.transfer({ns,value:null},native)).value,'server value');
});
test('offline message archive deduplicates messages, keeps original text/media and preserves deletion markers across restarts',async()=>{
 const db=new Database();let archive=new OfflineArchive(db);await archive.transfer(owner,{action:'configure',target,channels:[channel],enabled:true},offline);
 const image='https://cdn.discordapp.com/attachments/123/456/photo.png?ex=old',voice='https://cdn.discordapp.com/attachments/123/789/voice.ogg';
 const row={id:message,channel,author:target,content:'original',images:[image],audio:[voice]};await archive.transfer(owner,{action:'ingest',target,channel,mode:'history',messages:[row,row]},offline);await archive.transfer(owner,{action:'deleted',channel,ids:[message]},offline);
 archive=new OfflineArchive(db);await archive.transfer(owner,{action:'ingest',target,channel,mode:'history',messages:[{...row,content:'older replacement',images:[image.replace('old','new')]}]},offline);
 const page=await archive.transfer(owner,{action:'page',target,filter:'media'},offline);assert.equal(page.messages.length,1);assert.equal(page.messages[0].content,'original');assert.equal(page.messages[0].firstContent,'original');assert.equal(page.messages[0].deleted,true);assert.equal(page.messages[0].images.length,1);assert.match(page.messages[0].images[0],/new/);assert.equal(page.messages[0].audio[0],voice);
 assert.equal((await archive.transfer(other,{action:'page',target},offline)).messages.length,0);
});
test('archive retries retain failed operations and checkpoint progress never moves backwards',async()=>{
 const db=new Database(),archive=new OfflineArchive(db);await archive.transfer(owner,{action:'configure',target,channels:[channel],enabled:true},offline);for(const before of ['523456789012345670','523456789012345680'])await archive.transfer(owner,{action:'checkpoint',target,channel,before},offline);
 const state=await archive.transfer(owner,{action:'status',target},offline);assert.equal(state.scopes[0].before_id,'523456789012345670');
 let calls=0,fail=true;const native=async(_cmd,args)=>{calls++;if(fail)throw Error('offline');return args.payload.action==='status'?{scopes:[],bytes:0,maxBytes:1000}:{saved:1};};
 await archive.transfer(owner,{action:'status'},native);assert.equal((await db.list(owner,'archive-operation')).length,3);fail=false;await archive.transfer(owner,{action:'status'},native);assert.equal((await db.list(owner,'archive-operation')).length,0);const after=calls;await archive.transfer(owner,{action:'status'},native);assert.equal(calls,after+1);
});
test('never-archived deletions remain marked when a later accessible original is saved',async()=>{
 const db=new Database(),archive=new OfflineArchive(db);await archive.transfer(owner,{action:'configure',target,channels:[channel],enabled:true},offline);await archive.transfer(owner,{action:'deleted',channel,ids:[message]},offline);await archive.transfer(owner,{action:'ingest',target,channel,mode:'history',messages:[{id:message,channel,author:target,content:'observed original'}]},offline);assert.equal((await archive.transfer(owner,{action:'page',target},offline)).messages[0].deleted,true);
});
test('media downloaded from an accessible original plays after server/source failure without network requests',async()=>{
 const db=new Database(),url='https://cdn.discordapp.com/attachments/123/456/voice.ogg';let calls=0;
 const native=async(command)=>{calls++;if(command==='history_media')throw Error('offline');return{status:206,headers:'content-type: audio/ogg\r\ncontent-range: bytes 0-2/3',body:btoa('abc')};};
 let media=new OfflineMedia(db);const first=await media.transfer(owner,{url},native);assert.equal(first.local,true);assert.equal(first.bytes,3);media=new OfflineMedia(db);const count=calls;const cached=await media.transfer(owner,{url},offline);assert.match(cached.url,/^blob:/);const part=await media.transfer(owner,{url,offset:0},offline);assert.equal(atob(part.data),'abc');assert.equal(calls,count);await assert.rejects(media.transfer(other,{url},offline));media.clearUrls();
});
test('missing or invalid media parts fail explicitly instead of creating a fake playable file',async()=>{
 const db=new Database(),media=new OfflineMedia(db),url='https://cdn.discordapp.com/attachments/123/456/video.mp4';
 await assert.rejects(media.transfer(owner,{url,offset:0},async command=>command==='history_media'?{state:'ready',bytes:10,mime:'video/mp4',offset:0,next:10,data:btoa('x')}:{status:404,body:''}),/available|incomplete/);
 await assert.rejects(media.transfer(owner,{url:'https://attacker.example/a'},offline),/Unsupported/);assert.equal((await db.list(owner,'media-part')).length,0);
});
test('consented recordings save locally, survive restart and retry a failed server finish without duplicate uploads',async()=>{
 const db=new Database();let recordings=new OfflineRecordings(db);const row=await recordings.transfer(owner,{action:'start',consent:true,participantIds:[target]},offline,false);assert.match(row.id,/^[a-f0-9-]{36}$/);
 const chunk={action:'chunk',id:row.id,index:0,data:btoa('voice bytes')};await recordings.transfer(owner,chunk,offline,false);await recordings.transfer(owner,chunk,offline,false);await recordings.transfer(owner,{action:'finish',id:row.id},offline,false);
 recordings=new OfflineRecordings(db);assert.equal((await recordings.transfer(owner,{action:'list'},offline,false)).length,1);assert.equal(atob((await recordings.transfer(owner,{action:'read',id:row.id,offset:0},offline,false)).data),'voice bytes');assert.equal((await recordings.transfer(other,{action:'list'},offline,false)).length,0);
 let starts=0,fail=true;const native=async(_cmd,args)=>{if(args.payload.action==='start'){starts++;return{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};}if(args.payload.action==='finish'&&fail)throw Error('finish unavailable');return{};};
 await assert.rejects(recordings.sync(owner,native));fail=false;await recordings.sync(owner,native);assert.equal(starts,1);assert.equal((await db.get(owner,'recording',row.id)).pending,false);
 await assert.rejects(recordings.transfer(owner,{action:'start',consent:false},offline,false),/consent/);
});
