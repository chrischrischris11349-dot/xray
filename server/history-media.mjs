// Server-side copies of opted-in Discord attachments. No public directory or user token.
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {mkdirSync,existsSync,unlinkSync,createReadStream,openSync,readSync,closeSync,renameSync} from "node:fs";
import {open,rename} from "node:fs/promises";
import {join} from "node:path";
const DAY=864e5,ID=/^[a-f0-9]{64}$/,OWNER=/^\d{14,20}$/;
export function attachmentUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&["cdn.discordapp.com","media.discordapp.net"].includes(u.hostname)&&(/^\/(?:ephemeral-)?attachments\/\d+\/\d+\/[^/]+$/.test(u.pathname)||u.hostname==='cdn.discordapp.com'&&/^\/(avatars|banners)\/\d{14,20}\/(?:a_)?[a-f\d]{32}\.(png|gif|webp)$/i.test(u.pathname))&&u.href.length<=2048?u:null;}catch{return null;}}
export function historyMedia(db,directory,{secret,fetcher=fetch,now=Date.now,maxFileBytes=250*1024*1024,totalBytes=20*1024**3}={}){
 if(!secret)throw Error("Media signing secret required");mkdirSync(directory,{recursive:true,mode:0o700});
 db.exec("CREATE TABLE IF NOT EXISTS history_media (id TEXT PRIMARY KEY,owner TEXT NOT NULL,source TEXT NOT NULL,state TEXT NOT NULL,mime TEXT,bytes INTEGER NOT NULL DEFAULT 0,error TEXT); CREATE TABLE IF NOT EXISTS history_media_refs (ns TEXT NOT NULL,id TEXT NOT NULL,expires INTEGER,PRIMARY KEY(ns,id));");
 if(!db.prepare("PRAGMA table_info(history_media)").all().some(column=>column.name==="blob"))db.exec("ALTER TABLE history_media ADD COLUMN blob TEXT");
 const blobKey=source=>createHash("sha256").update(attachmentUrl(source)?.pathname??source).digest("hex");
 for(const row of db.prepare("SELECT id,source FROM history_media WHERE blob IS NULL").all()){
  const blob=blobKey(row.source);if(existsSync(join(directory,row.id))){if(existsSync(join(directory,blob)))unlinkSync(join(directory,row.id));else renameSync(join(directory,row.id),join(directory,blob));}db.prepare("UPDATE history_media SET blob=? WHERE id=?").run(blob,row.id);
 }
 db.prepare("UPDATE history_media SET state='queued',bytes=0 WHERE state='saving'").run();
 let used=Number(db.prepare("SELECT COALESCE(SUM(bytes),0) n FROM (SELECT MAX(bytes) bytes FROM history_media WHERE state='ready' GROUP BY blob)").get().n),running=0;
 const downloading=new Map();
 const pending=new Set(),queue=[];
 const path=id=>{if(!ID.test(id))throw Error("Invalid media ID");return join(directory,id);};
 const key=(owner,url)=>createHash("sha256").update(owner+":"+url.pathname).digest("hex");
 const sign=(id,expires)=>createHmac("sha256",secret).update(id+":"+expires).digest("hex");
 const read=id=>db.prepare("SELECT * FROM history_media WHERE id=?").get(id);
 function enqueue(id){if(pending.has(id)||read(id)?.state==="ready")return;if(queue.length>=2000){db.prepare("UPDATE history_media SET state='failed',error='Archive queue full; retry later' WHERE id=?").run(id);return;}pending.add(id);queue.push(id);pump();}
 function pump(){while(running<2&&queue.length){const id=queue.shift();running++;void capture(id).finally(()=>{running--;pending.delete(id);pump();});}}
 async function capture(id){const row=read(id);if(!row||row.state==="ready")return;
  const other=downloading.get(row.blob);if(other){await other;const current=read(id);if(!current||current.state==="ready")return;}
  const job=copy(id);downloading.set(row.blob,job);try{await job;}finally{if(downloading.get(row.blob)===job)downloading.delete(row.blob);}
 }
 async function copy(id){let bytes=0,file,blob;try{
  const row=read(id);if(!row)return;blob=row.blob;
  const shared=db.prepare("SELECT mime,bytes FROM history_media WHERE blob=? AND state='ready' LIMIT 1").get(blob);
  if(shared&&existsSync(path(blob))){db.prepare("UPDATE history_media SET state='ready',mime=?,bytes=?,error=NULL WHERE id=?").run(shared.mime,shared.bytes,id);return;}
  db.prepare("UPDATE history_media SET state='saving',error=NULL WHERE id=?").run(id);
  const response=await fetcher(row.source,{redirect:"manual",signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Discord attachment unavailable (HTTP ${response.status})`);
  const mime=(response.headers.get("content-type")??"").split(";")[0].trim().toLowerCase();
  if(!/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime)|audio\/(ogg|webm|mpeg|mp4|wav|x-wav|flac|opus)|application\/(ogg|pdf|zip|octet-stream))$/.test(mime))throw Error("Unsupported attachment media type");
  if(Number(response.headers.get("content-length"))>maxFileBytes)throw Error("Attachment exceeds 250 MB archive limit");
  file=await open(path(blob)+".part","w",0o600);
  for await(const chunk of response.body){if(bytes+chunk.length>maxFileBytes||used+chunk.length>totalBytes)throw Error("Media archive storage quota reached");used+=chunk.length;bytes+=chunk.length;await file.writeFile(chunk);}
  await file.close();file=undefined;if(!bytes)throw Error("Empty media response");
  if(!db.prepare("SELECT id FROM history_media WHERE blob=? LIMIT 1").get(blob))throw Error("History reference was removed during upload");
  await rename(path(blob)+".part",path(blob));db.prepare("UPDATE history_media SET state='ready',mime=?,bytes=?,error=NULL WHERE blob=?").run(mime,bytes,blob);
 }catch(error){await file?.close().catch(()=>{});used=Math.max(0,used-bytes);if(blob)try{unlinkSync(path(blob)+".part");}catch{}db.prepare("UPDATE history_media SET state='failed',bytes=0,error=? WHERE id=?").run(String(error.message).slice(0,180),id);}}
 function syncDocument(ns,value,pruneAfter=true){
  if(!/^(?:(profile-history|bot-history)\.\d{14,20}|message-archive\.\d{14,20}\.\d{14,20}\.\d{14,20})$/.test(ns))return;
  const doc=JSON.parse(value),owner=ns.split(".")[1],refs=new Map();
  for(const [subject,person] of Object.entries(doc.people??{})){
   const days=Number.isInteger(person.retentionDays)&&person.retentionDays>=0&&person.retentionDays<=365000?person.retentionDays:30;
   for(const event of (person.events??[]).slice(-2000))for(const source of [...event.messageImages??[],...event.messageVideos??[],...event.messageAudio??[],...event.messageDownloads??[],...(['avatar','banner'].includes(event.kind)&&/^\d{14,20}$/.test(subject)?[event.before,event.after].filter(hash=>typeof hash==='string'&&/^(?:a_)?[a-f\d]{32}$/i.test(hash)).map(hash=>`https://cdn.discordapp.com/${event.kind==='avatar'?'avatars':'banners'}/${subject}/${hash}.${hash.startsWith('a_')?'gif':'png'}?size=256`):[])].slice(0,82)){
    const url=attachmentUrl(source);if(!url||!Number.isFinite(event.at))continue;const expires=days===0?null:event.at+days*DAY;if(expires!==null&&expires<=now())continue;
    const id=key(owner,url),old=refs.get(id);refs.set(id,{source:url.href,expires:old?.expires===null||expires===null?null:Math.max(old?.expires??0,expires)});
   }
  }
  db.exec("BEGIN");try{db.prepare("DELETE FROM history_media_refs WHERE ns=?").run(ns);
   for(const [id,ref]of refs){db.prepare("INSERT INTO history_media_refs VALUES (?,?,?)").run(ns,id,ref.expires);db.prepare("INSERT INTO history_media(id,owner,source,state,blob) VALUES (?,?,?,'queued',?) ON CONFLICT(id) DO UPDATE SET state=CASE WHEN history_media.state='failed' AND history_media.source<>excluded.source THEN 'queued' ELSE history_media.state END,source=excluded.source").run(id,owner,ref.source,blobKey(ref.source));}
   db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
  if(pruneAfter)prune();for(const id of refs.keys())if(read(id)?.state==="queued")enqueue(id);
 }
 function prune(){db.prepare("DELETE FROM history_media_refs WHERE expires IS NOT NULL AND expires<=?").run(now());
  for(const row of db.prepare("SELECT id,blob,bytes,state FROM history_media WHERE id NOT IN (SELECT id FROM history_media_refs)").all()){
   db.prepare("DELETE FROM history_media WHERE id=?").run(row.id);if(db.prepare("SELECT id FROM history_media WHERE blob=? LIMIT 1").get(row.blob))continue;
   if(row.state==="ready")used=Math.max(0,used-row.bytes);for(const suffix of ["",".part"]){try{unlinkSync(path(row.blob)+suffix);}catch{}}
  }
 }
 function resolve(owner,source,retry=false,offset){if(!OWNER.test(owner))throw Error("Invalid account");const url=attachmentUrl(source);if(!url)throw Error("Invalid Discord attachment URL");
  const id=key(owner,url),row=read(id);if(!row||row.owner!==owner)return {state:"missing",error:"No archived file for this observation"};
  if(retry&&row.state==="failed"){db.prepare("UPDATE history_media SET source=?,state='queued' WHERE id=?").run(url.href,id);enqueue(id);return {state:"queued"};}
  if(row.state!=="ready")return {state:row.state,error:row.error};if(!existsSync(path(row.blob)))return {state:"failed",error:"Archived file is missing on the server"};
  if(offset!==undefined){if(!Number.isSafeInteger(offset)||offset<0||offset>=row.bytes)throw Error("Invalid media chunk offset");const size=Math.min(512*1024,row.bytes-offset),buffer=Buffer.alloc(size),file=openSync(path(row.blob),"r");let read;try{read=readSync(file,buffer,0,size,offset);}finally{closeSync(file);}if(read!==size)throw Error("Archived media file is incomplete");return {state:"ready",mime:row.mime,bytes:row.bytes,offset,next:offset+size,data:buffer.toString("base64")};}
  const expires=now()+3600_000;return {state:"ready",mime:row.mime,bytes:row.bytes,path:`/media/file/${id}?expires=${expires}&signature=${sign(id,expires)}`};
 }
 function serve(req,res,url){const id=url.pathname.slice("/media/file/".length),expires=Number(url.searchParams.get("expires")),signature=url.searchParams.get("signature")??"";
  if(!ID.test(id)||!Number.isSafeInteger(expires)||expires<now()||expires>now()+3600_000||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(id,expires)))){res.writeHead(401);res.end();return;}
  const row=read(id);if(!row||row.state!=="ready"||!existsSync(path(row.blob))){res.writeHead(404);res.end();return;}
  const headers={"content-type":row.mime,"cache-control":"private, no-store","x-content-type-options":"nosniff","accept-ranges":"bytes","referrer-policy":"no-referrer",...(row.mime?.startsWith("application/")?{"content-disposition":"attachment"}:{})};
  let start=0,end=row.bytes-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||!match[1]&&!match[2]){res.writeHead(416);res.end();return;}
   if(!match[1])start=Math.max(0,row.bytes-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
   if(!Number.isSafeInteger(start)||start>end||start>=row.bytes){res.writeHead(416,{"content-range":`bytes */${row.bytes}`});res.end();return;}status=206;headers["content-range"]=`bytes ${start}-${end}/${row.bytes}`;
  }
  headers["content-length"]=end-start+1;res.writeHead(status,headers);if(req.method==="HEAD"){res.end();return;}const stream=createReadStream(path(row.blob),{start,end});stream.on("error",()=>res.destroy());res.on("close",()=>stream.destroy());stream.pipe(res);
 }
 return {syncDocument,resolve,serve,prune,async idle(){while(running||queue.length)await new Promise(r=>setTimeout(r,5));}};
}
