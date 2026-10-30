import {localRecord,type LocalDatabase} from './offlineDb';
export type NativeCall=(command:string,args?:Record<string,unknown>)=>Promise<any>;
export function boundedNative(call:Promise<any>,milliseconds=3000):Promise<any>{let timer:ReturnType<typeof setTimeout>;return Promise.race([call,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Server did not respond; using local storage')),milliseconds);})]).finally(()=>clearTimeout(timer));}
export interface Replica {value:string|null;revision:number;serverRevision:number;dirty:boolean;confirmed:boolean;base:string|null;conflict?:boolean;serverConflict?:{value:string|null;revision:number};}
export class OfflineDocuments {
 private tails=new Map<string,Promise<unknown>>();
 private memory=new Map<string,Replica>();
 private offlineUntil=new Map<string,number>();
 constructor(private db:LocalDatabase,private changed:(owner:string,message:string)=>void=()=>{},private readTimeout=3000){}
 transfer(args:any,native:NativeCall):Promise<any>{
  const ns=String(args.ns??''),owner=ns.split('.').at(-1)!;
  if(!/^(?:profile-history|moderation-audit|server-monitors|local-message-edits|bot-history)\.\d{14,20}$/.test(ns))return native('document_store',args);
  const previous=this.tails.get(ns)??Promise.resolve(),job=previous.catch(()=>{}).then(()=>this.run(owner,ns,args,native));this.tails.set(ns,job);void job.finally(()=>{if(this.tails.get(ns)===job)this.tails.delete(ns);}).catch(()=>{});return job;
 }
 private async run(owner:string,ns:string,args:any,native:NativeCall){
  let old=this.memory.get(ns);try{const disk=(await this.db.get(owner,'document',ns))?.data as Replica|undefined;if(disk&&(!old||disk.revision>=old.revision))old=disk;}catch{}
  if(args.value!==null){
   if(ns.startsWith('bot-history.')||typeof args.value!=='string'||new TextEncoder().encode(args.value).length>2_000_000)throw Error('Invalid saved document.');
   if(!old||args.revision!==old.revision)throw Error('Saved data changed in another view. Reload before saving; existing copies were kept.');
   const next:Replica={...old,value:args.value,revision:old.revision+1,dirty:true};
   const durable=await this.save(owner,ns,next); // Try durable local storage before the network.
   if(old.conflict){if(!durable){this.memory.set(ns,old);throw Error('Local backup is full and server copies differ. This edit was not saved; export or free space before retrying.');}this.changed(owner,'Local changes saved. Server differs; neither copy was overwritten. Export before reconciling.');return{revision:next.revision,local:true};}
   if(durable&&(this.offlineUntil.get(owner)??0)>Date.now()){this.changed(owner,'Server unavailable · changes saved on this device');return{revision:next.revision,local:true};}
   try{
    // A previous offline edit must be reconciled with a fresh server read first.
    if(old.dirty||!old.confirmed){const reply=await boundedNative(native('document_store',{ns,value:null,revision:null}),this.readTimeout);this.validate(reply);
     if(reply.value===next.value){next.serverRevision=reply.revision;next.dirty=false;}
     else if(reply.revision===old.serverRevision&&reply.value===old.base||reply.value===null&&!old.confirmed){const ack=await native('document_store',{ns,value:next.value,revision:reply.revision});if(ack.revision!==reply.revision+1)throw Error('Server revision was not acknowledged.');next.serverRevision=ack.revision;next.dirty=false;}
     else{next.conflict=true;next.serverConflict={value:reply.value,revision:reply.revision};throw Error('Server differs; local changes were preserved without replacing it.');}
    }else{const ack=await native('document_store',{ns,value:next.value,revision:old.serverRevision});if(ack.revision!==old.serverRevision+1)throw Error('Server revision was not acknowledged.');next.serverRevision=ack.revision;next.dirty=false;}
    next.confirmed=true;next.base=next.value;const backedUp=await this.save(owner,ns,next);this.changed(owner,backedUp?'Server saved · local backup ready':'Server saved · local backup unavailable; check disk space');
   }catch(error){this.offlineUntil.set(owner,Date.now()+10000);if(/another device|changed on|differs/i.test(String(error)))next.conflict=true;if(!await this.save(owner,ns,next)){this.memory.set(ns,old);throw Error('The server and persistent local backup are unavailable. This change was not saved. Free local space and retry.');}this.changed(owner,next.conflict?'Local changes saved · server conflict kept for review':'Server unavailable · changes saved on this device');}
   return{revision:next.revision,local:next.dirty};
  }
  try{
   const reply=await boundedNative(native('document_store',args),this.readTimeout);this.validate(reply);this.offlineUntil.delete(owner);
   if(old?.dirty){
    if(reply.value===old.value){const clean={...old,dirty:false,confirmed:true,conflict:false,base:reply.value,serverRevision:reply.revision};await this.save(owner,ns,clean);this.changed(owner,'Server saved · local backup ready');return{value:clean.value,revision:clean.revision};}
    if(reply.revision===old.serverRevision&&reply.value===old.base||reply.value===null&&!old.confirmed){const ack=await native('document_store',{ns,value:old.value,revision:reply.revision});if(ack.revision!==reply.revision+1)throw Error('Server revision was not acknowledged.');const clean={...old,dirty:false,confirmed:true,conflict:false,base:old.value,serverRevision:ack.revision};await this.save(owner,ns,clean);this.changed(owner,'Pending local changes uploaded · backup ready');return{value:clean.value,revision:clean.revision};}
    const conflict={...old,conflict:true,serverConflict:{value:reply.value,revision:reply.revision}};await this.save(owner,ns,conflict);this.changed(owner,'Local changes saved · server differs; neither copy was overwritten');return{value:old.value,revision:old.revision,local:true};
   }
   const clean:Replica={value:reply.value,revision:Math.max(old?.revision??0,reply.revision),serverRevision:reply.revision,confirmed:true,dirty:false,base:reply.value};const backedUp=await this.save(owner,ns,clean);this.changed(owner,backedUp?'Server connected · local backup ready':'Server connected · local backup unavailable; check disk space');return{value:clean.value,revision:clean.revision,backupUnavailable:!backedUp};
  }catch(error){
   this.offlineUntil.set(owner,Date.now()+10000);
   const fallback:Replica=old??{value:null,revision:0,serverRevision:0,confirmed:false,dirty:false,base:null};const durable=await this.save(owner,ns,fallback);this.changed(owner,durable?old?'Server unavailable · using the saved local copy':'Server unavailable · local saving ready; no earlier backup is available':'Server and local backup unavailable · current view is in memory only');return{value:fallback.value,revision:fallback.revision,local:true};
  }
 }
 private async save(owner:string,ns:string,data:Replica){this.memory.set(ns,data);try{await this.db.batch([localRecord(owner,'document',ns,data,data.dirty)]);return true;}catch{return false;}}
 private validate(reply:any){if(!Number.isSafeInteger(reply?.revision)||reply.revision<0||reply.value!==null&&typeof reply.value!=='string')throw Error('Invalid server document.');}
}
