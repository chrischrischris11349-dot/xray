import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtempSync,rmSync,readdirSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:http";
import {once} from "node:events";
import {historyMedia,attachmentUrl} from "./history-media.mjs";
import {messageArchive} from './message-archive.mjs';
process.env.XRAY_LOG_TOKEN="test-media-token-0123456789";
const {openDb,store,createApp}=await import("./log-server.mjs");
const owner="300760994454437890",target="300760994454437891",source="https://cdn.discordapp.com/attachments/123/456/photo.png?ex=old";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6f8AAAAASUVORK5CYII=","base64");
const doc=(at,days=30)=>JSON.stringify({version:1,people:{[target]:{retentionDays:days,events:[{id:"one",at,kind:"messageObserved",messageImages:[source],messageVideos:["https://cdn.discordapp.com/attachments/123/789/movie.mp4"]}]}}});
test("server copies survive source deletion and restart, provide authenticated status and seekable playback",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"xray-media-")),db=openDb(":memory:"),data=store(db);let now=Date.now(),calls=0,available=true;
 const fetcher=async url=>{calls++;assert.equal(attachmentUrl(url)?.hostname,"cdn.discordapp.com");if(!available)return new Response(null,{status:404});return new Response(png,{headers:{"content-type":url.includes("movie")?"video/mp4":"image/png"}});};
 const options={secret:process.env.XRAY_LOG_TOKEN,fetcher,now:()=>now};let media=historyMedia(db,directory,options);data.onDocumentWrite((ns,value)=>media.syncDocument(ns,value));
 const ns=`profile-history.${owner}`;data.writeDocument(ns,doc(now),0);await media.idle();assert.equal(calls,2);available=false;
 media=historyMedia(db,directory,options);const ready=media.resolve(owner,source);assert.equal(ready.state,"ready");assert.equal(calls,2);
 const chunk=media.resolve(owner,source,false,0);assert.deepEqual(Buffer.from(chunk.data,"base64"),png);assert.equal(chunk.next,png.length);assert.throws(()=>media.resolve(owner,source,false,-1),/offset/);
 const server=createServer(createApp(data,null,media));server.listen(0,"127.0.0.1");await once(server,"listening");const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+"/media",{method:"POST",body:"{}"})).status,401);
  const response=await fetch(base+ready.path);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  const part=await fetch(base+ready.path,{headers:{range:"bytes=2-6"}});assert.equal(part.status,206);assert.deepEqual(Buffer.from(await part.arrayBuffer()),png.subarray(2,7));
  assert.equal((await fetch(base+ready.path,{headers:{range:"bytes=999999-"}})).status,416);
  assert.equal((await fetch(base+ready.path.replace(/signature=./,"signature=0"))).status,401);
  now+=3601_000;assert.equal((await fetch(base+ready.path)).status,401);
  assert.equal(media.resolve("300760994454437899",source).state,"missing");
  now+=31*864e5;media.prune();assert.equal(media.resolve(owner,source).state,"missing");
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();rmSync(directory,{recursive:true,force:true});}
});
test("archive preserves no-expiry references, deduplicates rotated links and reports size/download failures",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"xray-media-")),db=openDb(":memory:");let now=Date.now(),calls=0;
 const media=historyMedia(db,directory,{secret:"test",now:()=>now,maxFileBytes:100,fetcher:async()=>{calls++;return new Response(png,{headers:{"content-type":"image/png"}});}});
 try{
  const ns=`profile-history.${owner}`;media.syncDocument(ns,doc(now,0));await media.idle();assert.equal(media.resolve(owner,source).state,"ready");
  media.syncDocument(ns,doc(now,0).replace("ex=old","ex=new"));await media.idle();assert.equal(calls,2);now+=400*864e5;media.prune();assert.equal(media.resolve(owner,source).state,"ready");
  media.syncDocument(ns,JSON.stringify({people:{}}));assert.equal(media.resolve(owner,source).state,"missing");
  const small=historyMedia(db,directory,{secret:"test",maxFileBytes:1,fetcher:async()=>new Response(png,{headers:{"content-type":"image/png"}})});small.syncDocument(ns,doc(now));await small.idle();assert.equal(small.resolve(owner,source).state,"failed");assert.match(small.resolve(owner,source).error,/quota/);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
 for(const url of ["http://cdn.discordapp.com/attachments/123/456/a.png","https://127.0.0.1/attachments/123/456/a.png","https://cdn.discordapp.com.evil.test/attachments/123/456/a.png","https://user:pass@cdn.discordapp.com/attachments/123/456/a.png","https://cdn.discordapp.com/avatars/123/456.png"])assert.equal(attachmentUrl(url),null);
});
test("multiple accounts store one physical copy with independent access and retention",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"xray-media-")),db=openDb(":memory:");let calls=0;
 const media=historyMedia(db,directory,{secret:"test",fetcher:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return new Response(png,{headers:{"content-type":"image/png"}});}});
 try{const other="300760994454437899";media.syncDocument(`profile-history.${owner}`,doc(Date.now()));media.syncDocument(`profile-history.${other}`,doc(Date.now()));await media.idle();assert.equal(calls,2);assert.equal(readdirSync(directory).length,2);
  assert.equal(media.resolve(other,source).state,"ready");media.syncDocument(`profile-history.${owner}`,JSON.stringify({version:1,people:{}}));assert.equal(media.resolve(owner,source).state,"missing");assert.equal(media.resolve(other,source).state,"ready");assert.equal(readdirSync(directory).length,2);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});

test('permanent DM archive references survive the rolling profile log being pruned',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'xray-media-')),db=openDb(':memory:');let now=Date.now();
 const media=historyMedia(db,directory,{secret:'test',now:()=>now,fetcher:async()=>new Response(png,{headers:{'content-type':'image/png'}})});
 try{media.syncDocument(`profile-history.${owner}`,doc(now,1));media.syncDocument(`message-archive.${owner}.300760994454437892.300760994454437893`,doc(now,0));await media.idle();media.syncDocument(`profile-history.${owner}`,JSON.stringify({people:{}}));now+=4000*864e5;media.prune();assert.equal(media.resolve(owner,source).state,'ready');assert.deepEqual(Buffer.from(media.resolve(owner,source,false,0).data,'base64'),png);}finally{db.close();rmSync(directory,{recursive:true,force:true});}
});

test('archive media reindexing after restart can stream stored messages without nested transaction failures',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'xray-media-')),db=openDb(':memory:');
 const media=historyMedia(db,directory,{secret:'test',fetcher:async()=>new Response(png,{headers:{'content-type':'image/png'}})});
 const archive=messageArchive(db,{onMedia:(account,row)=>media.syncDocument(`message-archive.${account}.${row.channel}.${row.id}`,JSON.stringify({people:{[target]:{retentionDays:0,events:[{at:Date.now(),messageImages:row.images}]}}}),false)});
 try{archive.configure({owner,target,channels:['300760994454437892'],enabled:true});archive.ingest({owner,target,channel:'300760994454437892',mode:'history',messages:[{id:'300760994454437893',author:target,channel:'300760994454437892',images:[source]}]});await media.idle();archive.restoreMedia();await media.idle();assert.equal(media.resolve(owner,source).state,'ready');}finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
test("existing account-specific files migrate to shared storage without losing playback",()=>{
 const directory=mkdtempSync(join(tmpdir(),"xray-media-")),db=openDb(":memory:"),id=createHash("sha256").update(owner+":"+new URL(source).pathname).digest("hex");
 db.exec("CREATE TABLE history_media (id TEXT PRIMARY KEY,owner TEXT NOT NULL,source TEXT NOT NULL,state TEXT NOT NULL,mime TEXT,bytes INTEGER NOT NULL DEFAULT 0,error TEXT)");db.prepare("INSERT INTO history_media VALUES (?,?,?,'ready','image/png',?,NULL)").run(id,owner,source,png.length);writeFileSync(join(directory,id),png);
 try{const media=historyMedia(db,directory,{secret:"test"});const result=media.resolve(owner,source,false,0);assert.equal(result.state,"ready");assert.deepEqual(Buffer.from(result.data,"base64"),png);assert.equal(readdirSync(directory).length,1);}finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
