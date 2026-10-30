import {localRecord,type LocalDatabase} from './offlineDb';
import {bytes64,from64} from './offlineMedia';
import {boundedNative,type NativeCall} from './offlineDocuments';
export class OfflineRecordings {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private db:LocalDatabase,private changed:(owner:string,message:string)=>void=()=>{}){}
 transfer(owner:string,p:any,native:NativeCall,remote=true):Promise<any>{const job=this.tail.catch(()=>{}).then(()=>this.run(owner,p,native,remote));this.tail=job;return job;}
 private async run(owner:string,p:any,native:NativeCall,remote:boolean):Promise<any>{
  if(p.action==='list'){
   if(remote)try{const rows=await native('recording_transfer',{payload:p});if(!Array.isArray(rows))throw Error('Invalid recording list');const existing=await this.db.list(owner,'recording');const known=new Set(existing.flatMap(r=>[r.data.remoteId,r.data.retryRemoteId]));await this.db.batch(rows.filter(r=>!known.has(r.id)).map(r=>localRecord(owner,'recording',r.id,{...r,remoteId:r.id},false)));}catch{this.changed(owner,'Recording server unavailable · showing locally saved clips');}
   return (await this.db.list(owner,'recording')).map(r=>r.data).sort((a,b)=>b.startedAt-a.startedAt);
  }
  if(p.action==='start'){
   if(p.consent!==true)throw Error('Confirm participant consent before recording.');let meta:any;
   if(remote)try{meta=await boundedNative(native('recording_transfer',{payload:p}));meta={...meta,remoteId:meta.id};}catch{}
   meta??={id:crypto.randomUUID(),startedAt:Date.now(),channelId:p.channelId,owner,participantIds:p.participantIds??[],mime:'audio/webm',bytes:0,next:0,complete:false,consent:true};
   const pending=!meta.remoteId;meta.consent=true;await this.db.batch([localRecord(owner,'recording',meta.id,meta,pending)]);this.changed(owner,pending?'VC audio is saving locally':'VC audio uses server storage with a local backup');return meta;
  }
  if(typeof p.id!=='string'||!/^[a-f0-9-]{36}$/.test(p.id))throw Error('Invalid recording ID.');
  const record=await this.db.get(owner,'recording',p.id),meta=record?.data;
  if(!meta)throw Error('This recording is not available for the current account. Refresh the list.');
  if(p.action==='chunk'){
   if(meta.complete||!Number.isSafeInteger(p.index)||typeof p.data!=='string'||p.data.length>180000)throw Error('Invalid recording chunk.');const bytes=from64(p.data);if(!bytes.length||bytes.length>128*1024)throw Error('Invalid recording chunk size.');
   const id=`${p.id}:${p.index}`,prior=(await this.db.get(owner,'recording-part',id))?.data;
   if(p.index===meta.next-1&&prior){if(bytes64(new Uint8Array(await prior.blob.arrayBuffer()))!==p.data)throw Error('Recording chunk changed.');return{bytes:meta.bytes,next:meta.next};}
   if(p.index!==meta.next||meta.bytes+bytes.length>32*1024*1024)throw Error('Recording sequence or 32 MB limit exceeded.');
   const next={...meta,bytes:meta.bytes+bytes.length,next:meta.next+1};await this.db.batch([localRecord(owner,'recording-part',id,{offset:meta.bytes,blob:new Blob([bytes.buffer as ArrayBuffer],{type:meta.mime})},true,p.id),localRecord(owner,'recording',p.id,next,true)]);
   if(remote&&meta.remoteId&&!record?.pending)try{const ack=await native('recording_transfer',{payload:{...p,id:meta.remoteId}});if(ack.next!==next.next||ack.bytes!==next.bytes)throw Error('Recording acknowledgement changed');await this.db.batch([localRecord(owner,'recording',p.id,next,false)]);}catch{this.changed(owner,'Server unavailable · recording continues safely on this device');}
   return{bytes:next.bytes,next:next.next,local:true};
  }
  if(p.action==='finish'){
   if(!meta.bytes)throw Error('No audio was received.');const complete={...meta,complete:true,partial:p.partial===true,finishedAt:Date.now()};await this.db.batch([localRecord(owner,'recording',p.id,complete,true)]);
   if(remote&&meta.remoteId&&!record?.pending)try{await native('recording_transfer',{payload:{...p,id:meta.remoteId}});await this.db.batch([localRecord(owner,'recording',p.id,complete,false)]);}catch{this.changed(owner,'Recording saved locally · server upload pending');}
   return{id:p.id,bytes:meta.bytes,complete:true,partial:complete.partial,local:!(await this.db.get(owner,'recording',p.id))?.data.remoteId||(await this.db.get(owner,'recording',p.id))?.pending};
  }
  if(p.action==='abort'){
   if(meta.complete)throw Error('Completed recordings cannot be discarded with Abort.');if(remote&&meta.remoteId)await native('recording_transfer',{payload:{...p,id:meta.remoteId}}).catch(()=>{});const parts=await this.db.list(owner,'recording-part',p.id);await this.db.batch([], [record!.key,...parts.map(r=>r.key)]);return{discarded:true};
  }
  if(p.action!=='read'||!meta.complete||!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>=meta.bytes)throw Error('Invalid recording playback request.');
  const parts=(await this.db.list(owner,'recording-part',p.id)).map(r=>r.data).sort((a,b)=>a.offset-b.offset);let end=0;for(const part of parts){if(part.offset!==end)break;end+=part.blob.size;}
  if(end===meta.bytes){const blob=new Blob(parts.map(r=>r.blob),{type:meta.mime}),chunk=new Uint8Array(await blob.slice(p.offset,Math.min(meta.bytes,p.offset+512*1024)).arrayBuffer());return{id:p.id,mime:meta.mime,bytes:meta.bytes,offset:p.offset,next:p.offset+chunk.length,data:bytes64(chunk),local:true};}
  const cached=(await this.db.get(owner,'recording-playback',`${p.id}:${p.offset}`))?.data;if(cached)return{...cached,data:bytes64(new Uint8Array(await cached.blob.arrayBuffer())),blob:undefined,local:true};
  if(!remote)throw Error('This recording segment has not been downloaded yet.');
  const reply=await native('recording_transfer',{payload:{...p,id:meta.remoteId??p.id}});if(reply.offset!==p.offset||reply.bytes!==meta.bytes||typeof reply.data!=='string'||reply.data.length>700000)throw Error('Invalid recording playback chunk');const bytes=from64(reply.data);if(reply.next!==p.offset+bytes.length||!bytes.length||bytes.length>512*1024)throw Error('Incomplete recording playback chunk');
  await this.db.batch([localRecord(owner,'recording-playback',`${p.id}:${p.offset}`,{...reply,data:undefined,blob:new Blob([bytes.buffer as ArrayBuffer],{type:meta.mime})},false,p.id)]);return reply;
 }
 async sync(owner:string,native:NativeCall){
  for(const record of await this.db.list(owner,'recording')){if(!record.pending||!record.data.complete)continue;const meta=record.data,parts=(await this.db.list(owner,'recording-part',meta.id)).map(r=>r.data).sort((a,b)=>a.offset-b.offset);if(parts.reduce((n,r)=>n+r.blob.size,0)!==meta.bytes)throw Error('A local recording is incomplete; existing segments were kept.');
   // Start a fresh complete upload after an interrupted remote session. Original
   // unfinished server sessions expire; the stable local clip ID never changes.
   const started=meta.retryRemoteId?{id:meta.retryRemoteId}:await native('recording_transfer',{payload:{action:'start',consent:meta.consent===true,owner,channelId:meta.channelId,participantIds:meta.participantIds}});
   meta.retryRemoteId=started.id;meta.uploadedNext??=0;await this.db.batch([localRecord(owner,'recording',meta.id,meta,true)]);
   for(let index=meta.uploadedNext;index<parts.length;index++){await native('recording_transfer',{payload:{action:'chunk',id:started.id,index,data:bytes64(new Uint8Array(await parts[index].blob.arrayBuffer()))}});meta.uploadedNext=index+1;await this.db.batch([localRecord(owner,'recording',meta.id,meta,true)]);}
   await native('recording_transfer',{payload:{action:'finish',id:started.id,partial:meta.partial===true}});const saved={...meta,remoteId:started.id};delete saved.retryRemoteId;delete saved.uploadedNext;await this.db.batch([localRecord(owner,'recording',meta.id,saved,false)]);
  }
 }
}
