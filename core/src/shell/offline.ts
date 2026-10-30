import {myId} from '../discord';
import {storage} from '../env';
import {offlineDb,localRecord,offlineAvailable,offlineBinaryAvailable,localStorageFailure} from './offlineDb';
import {OfflineDocuments,type NativeCall} from './offlineDocuments';
import {OfflineArchive} from './offlineArchive';
import {OfflineMedia} from './offlineMedia';
import {OfflineRecordings} from './offlineRecordings';
const listeners=new Set<()=>void>(),messages=new Map<string,string>();
const documentMessages=new Map<string,string>(),knownDocumentMedia=new Map<string,Set<string>>();
function changed(owner:string,message:string){messages.set(owner,message);listeners.forEach(fn=>fn());}
export const onOfflineStorageChanged=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const offlineStorageMessage=(owner=myId())=>owner?messages.get(owner)??'Server preferred · local backups enabled':'';
export const offlineDocumentMessage=(owner=myId())=>owner?documentMessages.get(owner)??'':'';
const documents=new OfflineDocuments(offlineDb,(owner,message)=>{documentMessages.set(owner,message);changed(owner,message);}),archive=new OfflineArchive(offlineDb,changed),media=new OfflineMedia(offlineDb,changed),recordings=new OfflineRecordings(offlineDb,changed);
let nativeCall:NativeCall|undefined;
const remotePreferred=(owner:string)=>storage?.getItem(`xray.serverData.v1:${owner}`)==='true';
const mediaTasks=new Map<string,string>();let mediaWorking=0,mediaRevision=0;
function documentMedia(raw:any):string[]{try{const value=typeof raw==='string'?JSON.parse(raw):raw;return [...new Set<string>(Object.values(value?.people??{}).flatMap((person:any)=>(person.events??[]).flatMap((event:any)=>['messageImages','messageVideos','messageAudio','messageDownloads'].flatMap(kind=>event[kind]??[]))))];}catch{return[];}}
export async function queueLocalMedia(owner:string,urls:string[]){
 if(!offlineBinaryAvailable)return;
 for(const url of urls){let id:string;try{const source=new URL(url);if(source.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(source.hostname))continue;id=source.hostname+source.pathname;}catch{continue;}
  const key=`${owner}:${id}`;if(mediaTasks.get(key)===url)continue;
  try{const old=await offlineDb.get(owner,'media-job',id);if(old?.data.url!==url)await offlineDb.batch([localRecord(owner,'media-job',id,{url},true)]);mediaTasks.set(key,url);mediaRevision++;if(mediaTasks.size>5000)mediaTasks.delete(mediaTasks.keys().next().value!);}catch{changed(owner,'Message saved · media backup could not queue; check local disk space');continue;}
 }
 void drainMedia(owner);
}
async function drainMedia(owner:string){
 if(mediaWorking||!nativeCall||myId()!==owner)return;mediaWorking++;const native=nativeCall,revision=mediaRevision;
 try{for(const job of await offlineDb.list(owner,'media-job')){if(myId()!==owner)return;let saved=false;
   for(let attempt=0;attempt<8&&myId()===owner;attempt++){try{saved=await media.mirror(owner,job.data.url,native,()=>myId()===owner);if(saved)break;}catch(error){if(localStorageFailure(error)){changed(owner,'Media backup paused · local storage is full or unavailable; existing files were kept');return;}break;}await new Promise(resolve=>setTimeout(resolve,1500));}
   if(saved)await offlineDb.batch([], [job.key]);else changed(owner,'Saved history is available · some media still needs a source/server retry');
  }}finally{mediaWorking--;if(revision!==mediaRevision&&myId()===owner)void drainMedia(owner);}
}
export async function withOfflineStorage(command:string,args:Record<string,unknown>|undefined,native:NativeCall):Promise<any>{
 nativeCall=native;
 if(!offlineAvailable)return native(command,args);
 if(command==='document_store'){
  const ns=String(args?.ns??''),owner=ns.split('.').at(-1)!;let previous=knownDocumentMedia.get(ns);
  if(ns.startsWith('profile-history.')&&!previous){const old=await offlineDb.get(owner,'document',ns).catch(()=>undefined);previous=new Set(documentMedia(old?.data.value));}
  const reply=await documents.transfer(args,native);
  if(previous){const urls=documentMedia(args?.value??reply.value);knownDocumentMedia.set(ns,new Set(urls));void queueLocalMedia(owner,urls.filter(url=>!previous!.has(url))).catch(()=>{});}
  return reply;
 }
 const owner=command==='history_media'?args?.owner:command==='message_archive'?(args?.payload as any)?.owner:myId();
 if(typeof owner!=='string'||!/^\d{14,20}$/.test(owner))return native(command,args);
 if(command==='message_archive'){const payload=(args as any).payload,reply=await archive.transfer(owner,payload,native,remotePreferred(owner));if(payload.action==='ingest')void queueLocalMedia(owner,payload.messages.flatMap((row:any)=>['images','videos','audio','downloads'].flatMap(kind=>row[kind]??[]))).catch(()=>{});return reply;}
 if(command==='history_media')return offlineBinaryAvailable?media.transfer(owner,args,native,remotePreferred(owner)):native(command,args);
 if(command==='recording_transfer')return offlineBinaryAvailable?recordings.transfer(owner,(args as any).payload,native,remotePreferred(owner)):native(command,args);
 if(command==='intel_request'||command==='oathnet_lookup'){
  const id=JSON.stringify([command,args]),reply=await native(command,args);
  try{await offlineDb.batch([localRecord(owner,'lookup',id,reply,false)]);}catch{changed(owner,'Live lookup returned · local backup unavailable');}
  // A failed live search must stay a failed live search. Saved results are
  // explicitly opened from the backup panel, never substituted as fresh data.
  return reply;
 }
 return native(command,args);
}
export async function offlineStorageStats(owner=myId()){
 if(!owner)throw Error('Sign in first.');const rows=await offlineDb.list(owner);return{records:rows.length,bytes:rows.reduce((sum,r)=>sum+r.bytes,0),pending:rows.filter(r=>r.pending&&['document','archive-operation','recording','media-job'].includes(r.kind)).length,documents:rows.filter(r=>r.kind==='document').length,messages:rows.filter(r=>r.kind==='dm-message').length};
}
/** Remove only redownloadable playback parts. Saved history, edits and local-only audio stay. */
export async function clearDownloadedCache(owner=myId()){
 if(!owner)throw Error('Sign in first.');const rows=await offlineDb.list(owner);const remove=rows.filter(r=>!r.pending&&['media-part','media-meta','recording-playback','lookup'].includes(r.kind));await offlineDb.batch([],remove.map(r=>r.key));media.clearUrls();changed(owner,'Downloaded cache cleared · saved history, edits and pending uploads were kept');return remove.reduce((sum,r)=>sum+r.bytes,0);
}
export async function syncOfflineStorage(owner=myId()){
 if(!owner||!nativeCall)throw Error('Sign in and wait for XRay storage to initialize.');const native=nativeCall;
 for(const row of await offlineDb.list(owner,'document'))await documents.transfer({ns:row.id,value:null,revision:null},native);
 await archive.transfer(owner,{action:'status'},native,true);await recordings.sync(owner,native);void drainMedia(owner);changed(owner,'Server retry finished · check pending count for any preserved conflicts');
}
let copying:string|undefined,cancelCopy=false;
export const stopOfflineCopy=()=>{cancelCopy=true;if(copying)changed(copying,'Pausing server copy · completed local data will be kept');};
/** Copies the operator's existing archive only; does not search Discord or enroll new targets. */
export async function copyServerArchive(owner=myId(),includeMedia=true){
 if(!owner||!nativeCall)throw Error('Sign in and wait for storage to initialize.');if(copying)throw Error('A server copy is already running.');copying=owner;cancelCopy=false;const native=nativeCall,active=()=>!cancelCopy&&myId()===owner;
 try{
  const historyMedia=new Set<string>();for(const kind of ['profile-history','moderation-audit','server-monitors','local-message-edits','bot-history']){if(!active())return;const reply=await documents.transfer({ns:`${kind}.${owner}`,value:null,revision:null},native);if(reply.backupUnavailable)throw Error('Local backup could not be written. Existing copies were kept; free space and retry.');if(includeMedia&&kind==='profile-history')documentMedia(reply.value).forEach(url=>historyMedia.add(url));}
  const status=await archive.transfer(owner,{action:'status'},native,true);if(status.local)throw Error('The server is unavailable. Existing local backups were kept; retry when it returns.');
  const targets=[...new Set<string>(status.scopes.map((scope:any)=>scope.target))];let count=0,files=0,unavailable=0;
  for(const target of targets){let before:string|undefined;const cursors=new Set<string>();
   while(active()){const page=await archive.transfer(owner,{action:'page',target,...(before?{before}:{})},native,true);if(page.local)throw Error('Server copy paused because the server became unavailable. Completed local pages remain.');if(page.backupUnavailable)throw Error('Local backup limit reached or storage unavailable. Previously copied pages remain; clear downloaded cache and retry.');count+=page.messages.length;changed(owner,`Copying server archive · ${count} messages · ${files} media files`);
    if(includeMedia)for(const row of page.messages)for(const url of ['images','videos','audio','downloads'].flatMap(kind=>row[kind]??[]) as string[])historyMedia.add(url);
    if(!page.next)break;if(cursors.has(page.next))throw Error('Server returned a repeated archive cursor. Local pages were kept.');cursors.add(page.next);before=page.next;
   }
  }
  if(includeMedia)for(const url of historyMedia){if(!active())return;changed(owner,`Message backup ready · ${count} messages · copying media ${files+unavailable+1}/${historyMedia.size}`);try{if(await media.mirror(owner,url,native,active))files++;else unavailable++;}catch(error){if(localStorageFailure(error))throw error;unavailable++;}}
  if(active()&&includeMedia)for(const clip of await recordings.transfer(owner,{action:'list'},native,true)){if(!clip.complete)continue;try{for(let offset=0;offset<clip.bytes&&active();){const part=await recordings.transfer(owner,{action:'read',id:clip.id,offset},native,true);offset=part.next;}}catch(error){if(localStorageFailure(error))throw error;unavailable++;}}
  changed(owner,active()?`Local backup ready · ${count} messages · ${files} media files · ${unavailable} unavailable media sources · profile records and available recordings`:'Server copy paused · completed local data was kept');
  return{complete:active(),messages:count,files,unavailable};
 }catch(error){changed(owner,`Server copy paused · ${String((error as Error)?.message??error).slice(0,250)}`);throw error;}
 finally{if(cancelCopy)changed(owner,'Server copy paused · completed local data was kept');copying=undefined;}
}
