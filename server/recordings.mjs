import {mkdirSync,readdirSync,readFileSync,writeFileSync,appendFileSync,statSync,renameSync,unlinkSync,truncateSync,existsSync} from "node:fs";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
const ID=/^[a-f0-9-]{36}$/;
export function recordingStore(directory,{maxBytes=32*1024*1024,totalBytes=512*1024*1024,now=()=>Date.now()}={}) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const path=(id,suffix)=>{if(!ID.test(id))throw Error("Invalid recording ID");return join(directory,id+suffix);};
  const read=id=>JSON.parse(readFileSync(path(id,".json"),"utf8"));
  const save=meta=>{writeFileSync(path(meta.id,".tmp"),JSON.stringify(meta),{mode:0o600});renameSync(path(meta.id,".tmp"),path(meta.id,".json"));};
  function list(){const records=[];for(const file of readdirSync(directory)){const id=file.replace(/\.json$/,"");if(!file.endsWith(".json")||!ID.test(id))continue;try{const meta=read(id);const limit=meta.complete?7*864e5:2*36e5;if(now()-meta.startedAt>limit){for(const suffix of [".json",".webm",".part"]){try{unlinkSync(path(id,suffix));}catch{}}continue;}records.push(meta);}catch{}}return records.sort((a,b)=>b.startedAt-a.startedAt);}
  return {
    list:()=>list().map(({lastHash,...meta})=>meta),
    start(payload){if(payload?.consent!==true)throw Error("Confirm participant consent before recording");const records=list();if(records.length>=100 || records.reduce((sum,r)=>sum+r.bytes,0)>=totalBytes)throw Error("Recording storage quota reached");const meta={id:randomUUID(),startedAt:now(),channelId:typeof payload.channelId==="string"?payload.channelId.slice(0,20):null,mime:"audio/webm",bytes:0,next:0,complete:false};writeFileSync(path(meta.id,".part"),Buffer.alloc(0),{flag:"wx",mode:0o600});save(meta);return meta;},
    chunk({id,index,data}){const meta=read(id);if(meta.complete)throw Error("Recording already finalized");if(now()-meta.startedAt>2*36e5)throw Error("Recording session expired");if(typeof data!=="string"||data.length>180000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error("Invalid audio chunk");const bytes=Buffer.from(data,"base64");if(!bytes.length || bytes.length>128*1024)throw Error("Audio chunk exceeds limit");const digest=createHash("sha256").update(bytes).digest("hex");if(index===meta.next-1 && digest===meta.lastHash)return {next:meta.next,bytes:meta.bytes};if(index!==meta.next)throw Error("Chunk revision conflict");if(meta.bytes+bytes.length>maxBytes || list().reduce((sum,r)=>sum+r.bytes,0)+bytes.length>totalBytes)throw Error("Recording storage quota reached");const file=path(id,".part");if(statSync(file).size!==meta.bytes)truncateSync(file,meta.bytes);appendFileSync(file,bytes);meta.bytes+=bytes.length;meta.next++;meta.lastHash=digest;save(meta);return {next:meta.next,bytes:meta.bytes};},
    finish({id,partial=false}){const meta=read(id);if(!meta.complete){if(!meta.bytes)throw Error("No audio was received");if(!existsSync(path(id,".webm")))renameSync(path(id,".part"),path(id,".webm"));if(statSync(path(id,".webm")).size!==meta.bytes)throw Error("Recording size mismatch");meta.complete=true;meta.partial=partial===true;meta.finishedAt=now();save(meta);}return {id,bytes:meta.bytes,complete:true,partial:meta.partial===true};},
    abort({id}){const meta=read(id);if(meta.complete)throw Error("Saved recordings cannot be discarded through this action");for(const suffix of [".part",".json"]){try{unlinkSync(path(id,suffix));}catch{}}return {discarded:true};},
    read({id}){const meta=read(id);if(!meta.complete)throw Error("Recording is incomplete");if(meta.bytes>maxBytes)throw Error("Recording exceeds download limit");return {id,mime:meta.mime,data:readFileSync(path(id,".webm")).toString("base64")};},
  };
}
