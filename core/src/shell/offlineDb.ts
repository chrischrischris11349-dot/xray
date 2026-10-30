import {storage} from '../env';
export interface LocalRecord {key:string;owner:string;kind:string;id:string;group:string;at:number;bytes:number;pending:boolean;data:any;}
export interface LocalDatabase {
 get(owner:string,kind:string,id:string):Promise<LocalRecord|undefined>;
 list(owner:string,kind?:string,group?:string):Promise<LocalRecord[]>;
 batch(put:LocalRecord[],remove?:string[]):Promise<void>;
}
export const recordKey=(owner:string,kind:string,id:string)=>`${owner}|${kind}|${encodeURIComponent(id)}`;
export const localStorageFailure=(error:unknown)=>/1 GB local backup limit|Local backup is full|Local backup could not be committed|QuotaExceededError|disk full|Local backup could not open/i.test(String((error as Error)?.message??error));
export function localRecord(owner:string,kind:string,id:string,data:any,pending=false,group=''):LocalRecord{
 let blobBytes=0;const text=JSON.stringify(data,(_key,value)=>{if(value instanceof Blob){blobBytes+=value.size;return{localBlob:true,size:value.size,type:value.type};}return value;});
 const bytes=blobBytes+new TextEncoder().encode(text).length;
 if(bytes>250*1024*1024)throw Error('This file exceeds the 250 MB local backup limit.');
 return {key:recordKey(owner,kind,id),owner,kind,id,group:`${owner}|${kind}|${group}`,at:Date.now(),bytes,pending,data};
}
const factory=typeof indexedDB==='undefined'?undefined:indexedDB;
export const offlineAvailable=!!factory||!!storage;
export const offlineBinaryAvailable=!!factory;
let opened:Promise<IDBDatabase>|undefined;
function open():Promise<IDBDatabase>{return opened??=new Promise((resolve,reject)=>{
 const request=factory!.open('xray-offline-v1',1);
 request.onupgradeneeded=()=>{const store=request.result.createObjectStore('records',{keyPath:'key'});store.createIndex('owner','owner');store.createIndex('group','group');};
 request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opened=undefined;};resolve(db);};
 request.onerror=()=>{opened=undefined;reject(Error('Local backup could not open. Check available disk space and WebView storage.'));};
 request.onblocked=()=>reject(Error('Another XRay window is blocking the local backup database. Restart XRay.'));
});}
const result=<T>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??Error('Local backup request failed'));});
const completed=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error(tx.error?.name==='QuotaExceededError'?'Local backup is full. Clear downloaded cache or free disk space; unsaved changes were not discarded.':'Local backup could not be committed. Existing copies were kept.'));tx.onerror=()=>{};});
/** IndexedDB keeps blobs off the JS heap. JSON-only fallback is for restricted/test runtimes. */
export const offlineDb:LocalDatabase={
 async get(owner,kind,id){if(!factory){const raw=storage?.getItem('xray.offline:'+recordKey(owner,kind,id));return raw?JSON.parse(raw):undefined;}const db=await open(),tx=db.transaction('records','readonly');return result(tx.objectStore('records').get(recordKey(owner,kind,id)));},
 async list(owner,kind,group){
  let rows:LocalRecord[];
  if(!factory){const keys=JSON.parse(storage?.getItem('xray.offline.keys')??'[]') as string[];rows=keys.map(key=>{const raw=storage?.getItem('xray.offline:'+key);return raw?JSON.parse(raw):undefined;}).filter(Boolean);}
  else{const db=await open(),tx=db.transaction('records','readonly'),store=tx.objectStore('records');rows=await result(group!==undefined&&kind?store.index('group').getAll(`${owner}|${kind}|${group}`):store.index('owner').getAll(owner));}
  return rows.filter(row=>row.owner===owner&&(!kind||row.kind===kind)&&(group===undefined||row.group===`${owner}|${kind}|${group}`));
 },
 async batch(put,remove=[]){
  put=[...new Map(put.map(row=>[row.key,row])).values()];
  if(!factory){if(!storage)throw Error('Persistent local backup is unavailable.');if(put.some(row=>row.data instanceof Blob))throw Error('Media backup requires IndexedDB. Existing JSON copies are still available.');const keys=new Set<string>(JSON.parse(storage.getItem('xray.offline.keys')??'[]'));for(const row of put){storage.setItem('xray.offline:'+row.key,JSON.stringify(row));keys.add(row.key);}for(const key of remove){storage.removeItem('xray.offline:'+key);keys.delete(key);}storage.setItem('xray.offline.keys',JSON.stringify([...keys]));return;}
  const db=await open(),tx=db.transaction('records','readwrite'),done=completed(tx),store=tx.objectStore('records');
  // The shared usage counter and changed records commit in the same transaction.
  try{const keys=[...new Set([...put.map(row=>row.key),...remove])];const [usage,...old]=await Promise.all([result<any>(store.get('@usage')),...keys.map(key=>result<LocalRecord|undefined>(store.get(key)))]);
   const bytes=(usage?.bytes??0)-old.reduce((sum,row)=>sum+(row?.bytes??0),0)+put.reduce((sum,row)=>sum+row.bytes,0);
   if(bytes>1024*1024*1024){tx.abort();await done.catch(()=>{});throw Error('The 1 GB local backup limit is reached. Clear downloaded cache or export saved records before adding more.');}
   remove.forEach(key=>store.delete(key));put.forEach(row=>store.put(row));store.put({key:'@usage',bytes});await done;
  }catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
 }
};
