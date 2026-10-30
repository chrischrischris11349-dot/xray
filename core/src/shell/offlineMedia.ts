import {localRecord,type LocalDatabase} from './offlineDb';
import type {NativeCall} from './offlineDocuments';
export const bytes64=(bytes:Uint8Array)=>{let text='';for(let start=0;start<bytes.length;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(text);};
export const from64=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export function mediaKey(value:string){const url=new URL(value);if(url.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)||url.username||url.password)throw Error('Unsupported media backup URL.');return url.hostname+url.pathname;}
export class OfflineMedia {
 private urls=new Map<string,string>();
 constructor(private db:LocalDatabase,private changed:(owner:string,message:string)=>void=()=>{}){}
 async transfer(owner:string,args:any,native:NativeCall,remote=true):Promise<any>{
  const id=mediaKey(args.url),meta=(await this.db.get(owner,'media-meta',id))?.data;
  if(args.offset!==undefined){const cached=(await this.db.get(owner,'media-part',`${id}:${args.offset}`))?.data;if(cached&&meta&&cached.bytes===meta.bytes&&cached.mime===meta.mime)return{state:'ready',...cached,data:bytes64(new Uint8Array(await cached.blob.arrayBuffer())),blob:undefined,local:true};}
  else if(meta&&!args.retry){const parts=await this.db.list(owner,'media-part',id),ordered=parts.map(r=>r.data).sort((a,b)=>a.offset-b.offset);let next=0;for(const part of ordered){if(part.offset!==next||part.bytes!==meta.bytes||part.mime!==meta.mime)break;next=part.next;}if(next===meta.bytes){const key=`${owner}:${id}`,url=this.urls.get(key)??URL.createObjectURL(new Blob(ordered.map(p=>p.blob),{type:meta.mime}));this.urls.set(key,url);return{state:'ready',...meta,url,local:true};}}
  if(remote)try{
   const reply=await native('history_media',args);
   if(reply?.state==='ready'){
    if(!Number.isSafeInteger(reply.bytes)||reply.bytes<1||reply.bytes>250*1024*1024||typeof reply.mime!=='string')throw Error('Invalid saved media metadata.');
    if(args.offset===undefined)await this.db.batch([localRecord(owner,'media-meta',id,{bytes:reply.bytes,mime:reply.mime},false)]);
    else{if(reply.offset!==args.offset||typeof reply.data!=='string'||reply.data.length>700000)throw Error('Invalid saved media chunk.');const bytes=from64(reply.data);if(!bytes.length||reply.next!==args.offset+bytes.length||reply.next>reply.bytes||bytes.length>512*1024)throw Error('Saved media chunk is incomplete.');await this.db.batch([localRecord(owner,'media-meta',id,{bytes:reply.bytes,mime:reply.mime},false),localRecord(owner,'media-part',`${id}:${args.offset}`,{offset:args.offset,next:reply.next,bytes:reply.bytes,mime:reply.mime,blob:new Blob([bytes.buffer as ArrayBuffer],{type:reply.mime})},false,id)]);}
   }
   return reply;
  }catch{this.changed(owner,'Media server unavailable · trying the original attachment for a local backup');}
  return this.original(owner,id,args,native);
 }
 private async original(owner:string,id:string,args:any,native:NativeCall){
  const offset=args.offset??0;if(!Number.isSafeInteger(offset)||offset<0||offset>250*1024*1024)throw Error('Invalid local media offset.');
  const reply=await native('web_fetch',{method:'GET',url:args.url,headers:[['Range',`bytes=${offset}-${offset+512*1024-1}`]],body:null});
  if(![200,206].includes(reply?.status)||typeof reply.body!=='string'||reply.body.length>36_000_000)throw Error('Neither a local backup nor an accessible original attachment is available. Reconnect the server to retrieve its retained copy.');
  const headers=String(reply.headers??''),range=/^content-range:\s*bytes\s+(\d+)-(\d+)\/(\d+)/im.exec(headers),bytes=from64(reply.body),mime=/^content-type:\s*([^\r\n;]+)/im.exec(headers)?.[1].trim()??'application/octet-stream';
  const total=range?Number(range[3]):bytes.length;
  if(!bytes.length||total>250*1024*1024||reply.status===206&&(!range||Number(range[1])!==offset||Number(range[2])+1!==offset+bytes.length||bytes.length>512*1024)||reply.status===200&&offset!==0)throw Error('Original attachment returned an unsupported range or size. Existing local parts were kept.');
  const put=[localRecord(owner,'media-meta',id,{bytes:total,mime},false)];
  for(let start=0;start<bytes.length;start+=512*1024){const part=bytes.slice(start,start+512*1024),at=offset+start;put.push(localRecord(owner,'media-part',`${id}:${at}`,{offset:at,next:at+part.length,bytes:total,mime,blob:new Blob([part.buffer as ArrayBuffer],{type:mime})},false,id));}
  await this.db.batch(put);this.changed(owner,'Attachment saved locally · server copy unavailable');
  return args.offset===undefined?{state:'ready',bytes:total,mime,url:args.url,local:true,partial:bytes.length!==total}:{state:'ready',offset,next:offset+Math.min(bytes.length,512*1024),bytes:total,mime,data:bytes64(bytes.subarray(0,512*1024)),local:true};
 }
 async mirror(owner:string,url:string,native:NativeCall,active:()=>boolean){
  const meta=await this.transfer(owner,{owner,url},native);if(meta.state!=='ready')return false;
  for(let offset=0;offset<meta.bytes;){if(!active())return false;const part=await this.transfer(owner,{owner,url,offset},native);offset=part.next;}
  return true;
 }
 clearUrls(){for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();}
}
