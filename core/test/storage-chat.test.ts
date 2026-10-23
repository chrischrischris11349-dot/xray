import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { DocumentSession, type DocumentTransport } from "../src/shell/documentSession";
import { ImageDrafts, type ReplyTarget } from "../src/ui/imageDrafts";
import { sendMiniChatMessage } from "../src/ui/imageUpload";
import { mayPin } from "../src/ui/miniChatActions";
import { typingText } from "../src/ui/quickReply";
import { renderChatMessage, messageVisualKey } from "../src/ui/chatMessage";
import { metadataUrl, readPhotoMetadata } from "../src/ui/photoMetadata";
import { deleteMessageAuthorized } from "../src/plugins/messageModeration";
import { DeletedMessages } from "../src/ui/deletedMessages";
import { historyEventText } from "../src/ui/profileJournal";

function fixture(initial: string | null = null) {
  const values = new Map<string,string>(); if(initial !== null)values.set("local",initial);
  let revision = 0, value: string | null = null, offline = false;
  const calls: string[] = [];
  const transport: DocumentTransport = {
    async read(ns) { calls.push(`read:${ns}`);if(offline)throw Error("offline");return {value,revision}; },
    async write(ns,next,expected) { calls.push(`write:${ns}`);if(offline)throw Error("offline");if(expected!==revision)throw Error("changed on another device");value=next;revision++;return {revision}; },
  };
  const local = { getItem:(key:string)=>values.get(key)??null,setItem:(key:string,v:string)=>{values.set(key,v);},removeItem:(key:string)=>{values.delete(key);} };
  return { local, transport, values, calls, offline:()=>{offline=true;}, snapshot:()=>({value,revision}) };
}
test("server migration verifies read-back before deleting the local copy",async()=>{
  const f=fixture('{"notes":"keep me"}'),session=new DocumentSession("profile-history.300760994454437890","local",f.local,true,f.transport);
  await session.load();assert.equal(f.values.get("local"),'{"notes":"keep me"}');assert.equal(f.snapshot().revision,1);
  assert.equal(f.calls.filter(c=>c.startsWith("read")).length,2);
  session.removeMigratedLocal();assert.equal(f.values.size,0);
  await session.write('{"notes":"new"}');assert.equal(f.values.size,0);assert.equal(f.snapshot().value,'{"notes":"new"}');
});
test("failed migration and conflicting server records preserve local data",async()=>{
  const f=fixture("original");f.offline();
  await assert.rejects(new DocumentSession("profile-history.300760994454437890","local",f.local,true,f.transport).load(),/offline/);assert.equal(f.values.get("local"),"original");
  const g=fixture("local");await g.transport.write("ns","remote",0);
  await assert.rejects(new DocumentSession("profile-history.300760994454437890","local",g.local,true,g.transport).load(),/Neither was overwritten/);
  assert.equal(g.snapshot().value,"remote");assert.equal(g.values.get("local"),"local");
  const h=fixture("original"),bad={...h.transport,read:async()=>({value:null,revision:0})};
  await assert.rejects(new DocumentSession("profile-history.300760994454437890","local",h.local,true,bad).load(),/verified/);assert.equal(h.values.get("local"),"original");
});
test("server writes serialize and stale devices or offline saves never fall back to disk",async()=>{
  const f=fixture(),a=new DocumentSession("moderation-audit.300760994454437890","local",f.local,true,f.transport),b=new DocumentSession(a.ns,"local",f.local,true,f.transport);
  await Promise.all([a.load(),b.load()]);
  await Promise.all([a.update(raw=>`${raw??""}a`),a.update(raw=>`${raw??""}b`)]);
  assert.equal(f.snapshot().value,"ab");await assert.rejects(b.write("stale"),/another device/);assert.equal(f.snapshot().value,"ab");
  f.offline();await assert.rejects(a.write("unsaved"),/offline/);assert.equal(f.values.size,0);assert.equal(a.value,"ab");
});
test("a changed local source is not deleted by migration cleanup",async()=>{
  const f=fixture("first"),s=new DocumentSession("profile-history.300760994454437890","local",f.local,true,f.transport);await s.load();f.values.set("local","changed while uploading");s.removeMigratedLocal();assert.equal(f.values.get("local"),"changed while uploading");
});
test("replies use the native reference, default to no ping, and preserve failed drafts",async()=>{
  const channel="300760994454437890",reply:ReplyTarget={id:"300760994454437891",channelId:channel,author:"Alex",preview:"hello",mention:false};
  let options:any;const sender={async sendMessage(_c:any,_m:any,_wait:any,opts:any){options=opts;return{ok:true};}};
  await sendMiniChatMessage(channel,"reply",[],sender,undefined,reply);
  assert.deepEqual(options.messageReference,{channel_id:channel,message_id:reply.id});assert.equal(options.allowedMentions.replied_user,false);
  reply.mention=true;await sendMiniChatMessage(channel,"reply",[],sender,undefined,reply);assert.equal(options.allowedMentions.replied_user,true);
  await assert.rejects(sendMiniChatMessage("different","reply",[],sender,undefined,reply),/different conversation/);
  const drafts=new ImageDrafts();drafts.get(channel).reply=reply;drafts.get(channel).text="reply";
  await assert.rejects(sendMiniChatMessage(channel,"reply",[],{async sendMessage(){throw Error("offline");}},undefined,reply));assert.equal(drafts.get(channel).reply,reply);
  const newer={...reply,id:"300760994454437892"};drafts.get(channel).reply=newer;drafts.complete(channel,"reply",[],reply);assert.equal(drafts.get(channel).reply,newer);
  drafts.clear();assert.equal(drafts.get(channel).reply,undefined);
  const token=drafts.token();drafts.get(channel).text="same text";drafts.clear();drafts.get(channel).text="same text";drafts.get(channel).reply=newer;
  drafts.complete(channel,"same text",[],reply,token);
  assert.equal(drafts.get(channel).text,"same text");assert.equal(drafts.get(channel).reply,newer,"a late send from the previous session must not clear a new draft");
});
test("typing excludes self and pin permission is separate from Manage Messages",()=>{
  assert.equal(typingText(["me"],"me",id=>id),"");assert.equal(typingText(["me","Alex","Alex"],"me",id=>id),"Alex is typing…");assert.equal(typingText(["a","b"],"me",id=>id),"a, b are typing…");
  assert.equal(mayPin({type:1},()=>false),true);assert.equal(mayPin({type:0,guild_id:"guild"},p=>p===(1n<<13n)),false);assert.equal(mayPin({type:0,guild_id:"guild"},p=>p===(1n<<51n)),true);assert.equal(mayPin(null,()=>true),false);
});
test("quoted messages and pin changes reconcile without interpreting message HTML",()=>{
  const {document}=parseHTML("<html><body></body></html>");(globalThis as any).document=document;
  const message={id:"300760994454437890",pinned:false,messageReference:{message_id:"other"},referencedMessage:{author:{username:"Alex"},content:"<script>bad</script>"}};
  const before=messageVisualKey(message,false,"hello");message.pinned=true;assert.notEqual(messageVisualKey(message,false,"hello"),before);
  const row=renderChatMessage(message,false,"hello");assert.equal(row.querySelector("script"),null);assert.match(row.textContent??"",/Pinned.*Alex: <script>/s);
});
test("photo parsing reads actual original EXIF and blocks arbitrary metadata download URLs",async()=>{
  // Minimal TIFF with an ASCII Make tag, embedded as a JPEG APP1 EXIF segment.
  const tiff=Buffer.alloc(38);tiff.write("II");tiff.writeUInt16LE(42,2);tiff.writeUInt32LE(8,4);tiff.writeUInt16LE(1,8);tiff.writeUInt16LE(0x010f,10);tiff.writeUInt16LE(2,12);tiff.writeUInt32LE(8,14);tiff.writeUInt32LE(26,18);tiff.write("TestCam\0",26);
  const payload=Buffer.concat([Buffer.from("Exif\0\0"),tiff]);const header=Buffer.from([255,216,255,225,0,0]);header.writeUInt16BE(payload.length+2,4);
  const photo=new Uint8Array(Buffer.concat([header,payload,Buffer.from([255,217])]));const metadata=await readPhotoMetadata(photo);assert.match(JSON.stringify(metadata),/TestCam/);assert.doesNotMatch(JSON.stringify(metadata),/latitude/);
  assert.match(metadataUrl("https://cdn.discordapp.com/attachments/123/456/photo.jpg?ex=123"),/attachments/);
  for(const url of ["http://cdn.discordapp.com/attachments/a", "https://evil.example/attachments/a", "https://cdn.discordapp.com/avatars/a", "https://user@cdn.discordapp.com/attachments/a"])assert.throws(()=>metadataUrl(url));
  await assert.rejects(readPhotoMetadata(new Uint8Array(21*1024*1024)),/20 MB/);
});
test("moderator deletion waits for durable audit and rechecks permissions after it",async()=>{
  let enable=true,calls=0;const policy=()=>({actor:"300760994454437890",author:"300760994454437891",enabled:enable,guild:true,manageMessages:true});
  const message={id:"300760994454437892",channel_id:"300760994454437893"};
  const deps={policy,request:async()=>{calls++;return{status:204};},audit:async()=>{throw Error("server offline");},report:()=>{},now:()=>new Date().toISOString()};
  await assert.rejects(deleteMessageAuthorized(message,deps),/server offline/);assert.equal(calls,0);
  await assert.rejects(deleteMessageAuthorized(message,{...deps,audit:async()=>{enable=false;}}),/permissions changed/);assert.equal(calls,0);
});


test("deleted mini-chat messages remain readable after store removal and invalidate stable rows",()=>{
  const {document}=parseHTML("<html><body></body></html>");(globalThis as any).document=document;
  const log=new DeletedMessages(()=>1234);
  const first={id:"300760994454437893",channel_id:"one",author:{id:"300760994454437890",username:"Alex"},content:"<b>Visible before deletion</b>",timestamp:"2026-10-22T16:38:24Z"};
  log.remember("one",[first]);
  assert.equal(log.handle({type:"MESSAGE_DELETE",channelId:"one",id:first.id},()=>undefined),true);
  const retained=log.merge("one",[])[0];
  assert.equal(retained.content,first.content);assert.equal(retained.deleted,true);
  assert.notEqual(messageVisualKey(first,false,first.content),messageVisualKey(retained,false,retained.content));
  const row=renderChatMessage(retained,false,retained.content);
  assert.match(row.textContent!,/Deleted.*Visible before deletion/);assert.equal(row.querySelector("b"),null);
  assert.equal(log.merge("two",[]).length,0);
  const stillInLogger=log.merge("one",[first]);assert.equal(stillInLogger.length,1);assert.equal(stillInLogger[0].deleted,true);
  assert.equal(log.handle({type:"MESSAGE_DELETE",channelId:"one",id:first.id,mlDeleted:true},()=>first),true);
  assert.equal(log.merge("one",[]).length,0);
  log.handle({type:"MESSAGE_DELETE_BULK",channelId:"one",ids:[first.id,"unknown"]},(_c,id)=>id===first.id?first:null);
  assert.equal(log.merge("one",[]).length,1);log.clear();assert.equal(log.merge("one",[]).length,0);
});
test("mini-chat deleted cache is bounded and copied reports show excerpts with honest unknowns",()=>{
  const log=new DeletedMessages();
  for(let i=0;i<100;i++)log.handle({type:"MESSAGE_DELETE",channelId:"one",id:String(i)},(_c,id)=>({id,content:"readable",author:{id:"author"}}));
  assert.equal(log.merge("one",[]).length,80);
  const event={id:"deletion",at:Date.now(),kind:"messageDeleted",messageText:"what was deleted",messageFiles:["photo.png"]};
  assert.match(historyEventText(event),/what was deleted\nFiles: photo.png/);
  assert.match(historyEventText({...event,messageText:undefined,messageFiles:undefined}),/Text unavailable/);
});
