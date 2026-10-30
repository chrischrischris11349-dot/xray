import { myId } from "../discord";
import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { registerArchiveImage,forgetArchiveImage } from "./imageViewer";
const flights=new Map<string,Promise<any>>();
const blobs=new Map<string,{owner:string;bytes:number;url?:string;promise:Promise<string>;users:Set<HTMLElement>}>();
const watched=new WeakSet<Node>();let retainedBytes=0,retired=0;
function collectBlobs(){for(const [key,entry]of blobs)if(entry.url&&[...entry.users].every(node=>!node.isConnected)){URL.revokeObjectURL(entry.url);forgetArchiveImage(entry.url);retainedBytes-=entry.bytes;blobs.delete(key);}}
function watchBlob(root:Node){if(typeof MutationObserver==="undefined"||watched.has(root))return;watched.add(root);new MutationObserver(collectBlobs).observe(root,{childList:true,subtree:true});}
let active=0;const pending:Array<()=>void>=[];
function request(args:Record<string,unknown>):Promise<any>{return new Promise((resolve,reject)=>{
 const run=()=>{active++;void invoke("history_media",args).then(resolve,reject).finally(()=>{active--;pending.shift()?.();});};
 if(active<4)run();else pending.push(run);
});}
/** Only short-lived playback URLs enter the page; server credentials stay in Rust. */
export function archivedMedia(source:string,kind:"image"|"video"|"audio"|"file",show:(url:string,external?:string)=>void):HTMLElement|null {
 const account=myId();if(!account)return null;const owner:string=account;
 let busy=false,attempt=0,timer:ReturnType<typeof setTimeout>|undefined,ready:any;
 const status=h("span",{attrs:{role:"status"},text:"Checking server copy…"}),retry=h("button",{class:"btn ghost",text:"Retry archive",on:{click:()=>void (ready&&kind!=="file"?loadFile(true):load(true))}});
 retry.hidden=true;const block=h("div",{class:"pf-note"},status,retry);
 async function loadFile(force=false){if(busy)return;busy=true;retry.hidden=true;
  const key=`${owner}:${source}`;
  try{
   if(force){ready=await request({owner,url:source,retry:true});if(ready?.state!=="ready")throw Error(ready?.error??"Server copy is not ready yet; retry shortly");
    const old=blobs.get(key);if(old){old.users.delete(block);blobs.delete(key);blobs.set(`${key}:retired:${++retired}`,old);collectBlobs();}}
   let entry=blobs.get(key);
   if(!entry){const bytes=ready?.bytes;if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>250*1024*1024)throw Error("Archive reported an invalid file size");collectBlobs();if(retainedBytes+bytes>256*1024*1024)throw Error("Close a loaded video before loading more media; the in-memory playback limit is 256 MB");
    retainedBytes+=bytes;const created={owner,bytes,users:new Set([block]),promise:Promise.resolve(""),url:undefined as string|undefined};entry=created;blobs.set(key,created);
    created.promise=(async()=>{const parts:ArrayBuffer[]=[];let offset=0;
     while(offset<bytes){if(myId()!==owner||[...created.users].every(node=>!node.isConnected))throw Error("Playback load cancelled because the report or account changed");
      const chunk=await request({owner,url:source,offset});if(chunk?.state!=="ready"||chunk.offset!==offset||chunk.bytes!==bytes||chunk.mime!==ready.mime||typeof chunk.data!=="string"||chunk.data.length>700000)throw Error("Archive chunk was incomplete or changed");
      const raw=atob(chunk.data),part=Uint8Array.from(raw,c=>c.charCodeAt(0));if(!part.length||part.length>512*1024||chunk.next!==offset+part.length||chunk.next>bytes)throw Error("Archive chunk offset mismatch");parts.push(part.buffer as ArrayBuffer);offset=chunk.next;status.textContent=`Loading saved ${kind} · ${Math.round(offset/bytes*100)}%`;
     }
     if(myId()!==owner||[...created.users].every(node=>!node.isConnected))throw Error("Playback load cancelled because the report or account changed");
     const url=URL.createObjectURL(new Blob(parts,{type:ready.mime}));created.url=url;return url;
    })().catch(error=>{for(const [stored,value]of blobs)if(value===created){blobs.delete(stored);retainedBytes-=bytes;}throw error;});
   }else entry.users.add(block);
   const url=await entry!.promise;if(myId()!==owner||!block.isConnected){collectBlobs();return;}watchBlob(block.getRootNode());if(kind==="image")registerArchiveImage(url,ready.url);show(url,ready.url);status.textContent=`${kind==="image"?"Photo":kind==='audio'?'Voice message':'Video'} · loaded from ${ready.local?'this device':'your server copy'}`;retry.textContent="Reload saved copy";retry.hidden=false;
  }catch(error){status.textContent=String((error as Error)?.message??error);retry.textContent="Retry loading server copy";retry.hidden=false;}finally{busy=false;}
 }
 async function load(force=false){if(busy||myId()!==owner)return;busy=true;retry.hidden=true;clearTimeout(timer);
  try{const key=`${owner}:${source}`;let flight=flights.get(key);if(!flight){flight=request({owner,url:source,retry:force});flights.set(key,flight);void flight.finally(()=>{if(flights.get(key)===flight)flights.delete(key);}).catch(()=>{});}
   const result=await flight;if(myId()!==owner)return;
   if(result?.state==="ready"){ready=result;if(kind==='file'){show(result.url);status.textContent=result.local?'File available from this device':'File saved on your server';retry.textContent='Refresh saved file link';retry.hidden=false;return;}status.textContent=`${kind==="image"?"Photo":kind==='audio'?'Voice message':'Video'} · ${result.local?result.partial?'local backup downloading':'available on this device':'saved on your server'}`;retry.textContent=`Load ${kind} · ${(result.bytes/1048576).toFixed(1)} MB`;retry.hidden=false;
    if(kind==="image"){const begin=()=>{if(!busy)void loadFile();else queueMicrotask(()=>void loadFile());};if(typeof IntersectionObserver!=="undefined"){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();begin();}},{rootMargin:"160px"});observer.observe(block);}else queueMicrotask(begin);}return;}
   if(["queued","saving","missing"].includes(result?.state)){status.textContent="Saving attachment on your server…";if(attempt++<(result?.state==="missing"?5:30)){timer=setTimeout(()=>{if(block.isConnected)void load();},2000);return;}}
   status.textContent=result?.error??"Server copy not ready. The original link may still be available.";retry.hidden=false;
  }catch(error){status.textContent=String((error as Error)?.message??error);retry.hidden=false;}finally{busy=false;}
 }
 void load();return block;
}
