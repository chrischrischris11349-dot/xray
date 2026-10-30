import {localRecord,type LocalDatabase,type LocalRecord} from './offlineDb';
import {boundedNative,type NativeCall} from './offlineDocuments';
const valid=(v:any)=>typeof v==='string'&&/^\d{14,20}$/.test(v);
export function mergeArchivedMessage(previous:any,row:any,mode:string,deletion?:number){
 if(!valid(row?.id)||!valid(row.channel)||!valid(row.author)||typeof row.content==='string'&&row.content.length>4000)throw Error('Invalid local archive message.');
 const newer=mode==='live'&&!previous?.deleted&&(!previous?.editedAt||row.editedAt&&Date.parse(row.editedAt)>=Date.parse(previous.editedAt));
 const value=previous?{...previous,...(newer?row:{})}:{...row,firstSavedAt:Date.now(),...(row.content!==undefined?{firstContent:row.content}:{})};
 if(deletion){value.deleted=true;value.deletedAt=deletion;}
 for(const field of ['images','videos','audio','downloads']){const links=new Map<string,string>();for(const source of [...(previous?.[field]??[]),...(row[field]??[])]){const url=new URL(source);if(url.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)||url.username||url.password)throw Error('Invalid attachment in local archive.');links.set(url.pathname,url.href);}if(links.size>20)throw Error('Saved attachment history exceeds its limit.');value[field]=[...links.values()];}
 value.files=[...new Set([...(previous?.files??[]),...(row.files??[])])];if(value.files.length>20)throw Error('Saved filename history exceeds its limit.');return value;
}
export class OfflineArchive {
 private tail:Promise<unknown>=Promise.resolve();
 private offlineUntil=new Map<string,number>();
 private seen=new Map<string,number>();
 constructor(private db:LocalDatabase,private changed:(owner:string,message:string)=>void=()=>{}){}
 transfer(owner:string,payload:any,native:NativeCall,remote=true):Promise<any>{const job=this.tail.catch(()=>{}).then(()=>this.run(owner,payload,native,remote));this.tail=job;return job;}
 private async run(owner:string,p:any,native:NativeCall,remote:boolean){
  if(!valid(owner)||!['status','configure','ingest','checkpoint','deleted','page'].includes(p.action))throw Error('Invalid local archive request.');
  const mutation=!['status','page'].includes(p.action);let operation:LocalRecord|undefined,local:any;
  if(mutation)try{
   const savedClock=(await this.db.get(owner,'archive-clock','sequence'))?.data.next;
   const previous=savedClock??(await this.db.list(owner,'archive-operation')).reduce((maximum,row)=>Math.max(maximum,Number(row.id.split('-')[0])),0);
   const sequence=Math.max(Date.now(),previous+1),clock=localRecord(owner,'archive-clock','sequence',{next:sequence},false);
   operation=localRecord(owner,'archive-operation',String(sequence).padStart(16,'0'),p,true);local=await this.apply(owner,p,operation,clock);
  }catch(error){if(!remote)throw error;const reply=await native('message_archive',{payload:{...p,owner}});this.changed(owner,'Server saved · local message backup unavailable; check disk space');return reply;}
  if(remote&&(!mutation||(this.offlineUntil.get(owner)??0)<=Date.now()))try{
   // All mutations are idempotent. Replay in order; never discard an unacknowledged operation.
   const queued=(await this.db.list(owner,'archive-operation').catch(()=>[])).sort((a,b)=>a.id.localeCompare(b.id));
   if(queued.length&&Date.now()-(this.seen.get(owner)??0)>10000)await boundedNative(native('message_archive',{payload:{action:'status',owner}}));
   for(const op of queued.slice(0,100)){await native('message_archive',{payload:{...op.data,owner}});await this.db.batch([], [op.key]);}
   this.seen.set(owner,Date.now());this.offlineUntil.delete(owner);
   if(mutation){this.changed(owner,queued.length>100?'Local messages saved · additional uploads pending':'Messages saved on server and this device');return local;}
   if(queued.length>100)return this.read(owner,p);
   const reply=await boundedNative(native('message_archive',{payload:{...p,owner}}));try{await this.mirror(owner,p,reply);this.changed(owner,'Server connected · message backup ready');}catch{this.changed(owner,'Server connected · local message backup unavailable; check disk space');return{...reply,backupUnavailable:true};}return reply;
  }catch{this.offlineUntil.set(owner,Date.now()+10000);this.changed(owner,'Server unavailable · using local message archive');}
  return mutation?local:this.read(owner,p);
 }
 private async apply(owner:string,p:any,operation:LocalRecord,clock:LocalRecord){
  const put:LocalRecord[]=[operation,clock];
  if(['configure','checkpoint','ingest','page'].includes(p.action)&&!valid(p.target))throw Error('Invalid archive target.');
  if(p.action==='configure'){
   if(!Array.isArray(p.channels)||!p.channels.length||p.channels.length>64||p.channels.some((id:any)=>!valid(id))||typeof p.enabled!=='boolean')throw Error('Choose known conversations before archiving.');
   for(const channel of new Set<string>(p.channels)){const id=`${p.target}:${channel}`,old=(await this.db.get(owner,'dm-scope',id))?.data;put.push(localRecord(owner,'dm-scope',id,{...old,owner,target:p.target,channel,enabled:+p.enabled,done:old?.done??0},true,p.target));}
  }else if(p.action==='checkpoint'){
   const id=`${p.target}:${p.channel}`,old=(await this.db.get(owner,'dm-scope',id))?.data;if(!old?.enabled)throw Error('Archive is not enabled.');
   for(const id of [p.before,p.head])if(id!==undefined&&id!==null&&!valid(id))throw Error('Invalid archive checkpoint.');
   const next={...old,before_id:p.before&&(!old.before_id||BigInt(p.before)<BigInt(old.before_id))?p.before:old.before_id,head:p.head&&(!old.head||BigInt(p.head)>BigInt(old.head))?p.head:old.head,done:old.done||p.done?1:0};put.push(localRecord(owner,'dm-scope',id,next,true,p.target));
  }else if(p.action==='ingest'){
   if(!valid(p.channel)||!['live','history'].includes(p.mode)||!Array.isArray(p.messages)||p.messages.length>25)throw Error('Invalid archive batch.');
   if(!(await this.db.get(owner,'dm-scope',`${p.target}:${p.channel}`))?.data.enabled)throw Error('Archive is not enabled.');
   for(const row of p.messages){if(row.author!==p.target||row.channel!==p.channel)throw Error('Message does not match the selected person.');const id=`${row.channel}:${row.id}`,old=(await this.db.get(owner,'dm-message',id))?.data,deleted=(await this.db.get(owner,'dm-deletion',id))?.data.at;put.push(localRecord(owner,'dm-message',id,mergeArchivedMessage(old,row,p.mode,deleted),true,p.target));}
  }else if(p.action==='deleted'){
   if(!valid(p.channel)||!Array.isArray(p.ids)||p.ids.length>100||p.ids.some((id:any)=>!valid(id)))throw Error('Invalid deletion marker.');
   for(const id of p.ids){const key=`${p.channel}:${id}`,at=(await this.db.get(owner,'dm-deletion',key))?.data.at??Date.now();put.push(localRecord(owner,'dm-deletion',key,{at},true));const old=(await this.db.get(owner,'dm-message',key))?.data;if(old)put.push(localRecord(owner,'dm-message',key,{...old,deleted:true,deletedAt:at},true,old.author));}
  }
  await this.db.batch(put);return p.action==='ingest'?{saved:p.messages.length,local:true}:p.action==='deleted'?{changed:p.ids.length,local:true}:this.read(owner,{action:'status',target:p.target});
 }
 private async mirror(owner:string,p:any,reply:any){
  const put:LocalRecord[]=[];
  if(Array.isArray(reply?.scopes))for(const scope of reply.scopes){if(scope.owner!==owner||!valid(scope.target)||!valid(scope.channel))throw Error('Invalid server archive scope.');put.push(localRecord(owner,'dm-scope',`${scope.target}:${scope.channel}`,scope,false,scope.target));}
  if(p.action==='page'){if(!Array.isArray(reply?.messages))throw Error('Invalid server archive page.');for(const row of reply.messages){if(row.author!==p.target)throw Error('Archive author mismatch.');const id=`${row.channel}:${row.id}`,old=(await this.db.get(owner,'dm-message',id))?.data,deleted=(await this.db.get(owner,'dm-deletion',id))?.data.at;put.push(localRecord(owner,'dm-message',id,{...mergeArchivedMessage(old,row,'live',deleted),...(row.deleted?{deleted:true,deletedAt:row.deletedAt}:{})},false,p.target));}}
  if(put.length)await this.db.batch(put);
 }
 private async read(owner:string,p:any){
  if(p.action==='status'){const scopes=(await this.db.list(owner,'dm-scope',p.target)).map(row=>row.data),messages=await this.db.list(owner,'dm-message');return{scopes:scopes.map(s=>({...s,count:messages.filter(m=>m.data.channel===s.channel&&m.data.author===s.target).length})),bytes:messages.reduce((n,r)=>n+r.bytes,0),maxBytes:1024*1024*1024,local:true};}
  if(!valid(p.target)||p.before!==undefined&&!valid(p.before)||!['all','text','media',undefined].includes(p.filter))throw Error('Invalid archive page.');
  const rows=(await this.db.list(owner,'dm-message',p.target)).map(r=>r.data).filter(row=>(!p.before||BigInt(row.id)<BigInt(p.before))&&(p.filter!=='text'||row.content?.trim())&&(p.filter!=='media'||['images','videos','audio','downloads'].some(f=>row[f]?.length))).sort((a,b)=>a.id.length===b.id.length?b.id.localeCompare(a.id):b.id.length-a.id.length);
  return{messages:rows.slice(0,10),next:rows.length>10?rows[9].id:null,local:true};
 }
}
