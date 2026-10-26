import { historyEventText } from "../src/ui/profileJournal";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ProfileHistory } from "../src/history/model";
import { HistoryObserver } from "../src/history/observer";
import { discordDate, memberJoinedAt } from "../src/ui/memberDates";
import { gatherProfile, mergeProfile, mergeProfileMember, profileSections, type ProfileData } from "../src/ui/profile";
import { deleteMessageAuthorized, mayEnableModeration, messageAllowed } from "../src/plugins/messageModeration";
import { notificationIdentity } from "../src/shell/notificationIdentity";
const person="300760994454437890", actor="300760994454437891", channel="300760994454437892", messageId="300760994454437893";
test("loaded conversation media is retained once for opted-in profiles, with original sent time and deletion media",()=>{
 const history=new ProfileHistory();history.configure(person,true,["messages","deletions"]);history.configure(actor,true,["deletions"]);
 const video="https://cdn.discordapp.com/attachments/300760994454437892/300760994454437893/older.mp4",sent="2026-10-24T12:00:00Z";
 const message={id:messageId,author:{id:person},timestamp:sent,content:"Old caption",attachments:[{filename:"older.mp4",url:video,content_type:"video/mp4"}]};
 const observer=new HistoryObserver(history);
 const load={type:"LOAD_MESSAGES_SUCCESS",channelId:channel,messages:[message,{...message,id:"300760994454437894",author:{id:actor}},{...message,id:"300760994454437895",attachments:[]}]};
 assert.deepEqual([...observer.handle(load)],[person]);observer.handle(load);observer.handle({type:"MESSAGE_CREATE",message:{...message,channel_id:channel}});
 assert.equal(history.get(person)!.events.length,1);assert.equal(history.get(actor)!.events.length,0);
 const event=history.get(person)!.events[0];assert.equal(event.kind,"messageLoaded");assert.equal(event.messageSentAt,new Date(sent).toISOString());assert.deepEqual(event.messageVideos,[video]);assert.match(historyEventText(event),/loaded from conversation history/);
 observer.handle({type:"MESSAGE_DELETE",channelId:channel,id:messageId});const restored=new ProfileHistory(history.serialize());assert.deepEqual(restored.get(person)!.events.at(-1)!.messageVideos,[video]);
});

test("profile distinguishes loading, absent fields, failed reads and missing server context",()=>{
 const base=gatherProfile({id:person,username:"tester"});
 const facts=(data:ProfileData)=>Object.fromEntries((profileSections(data).find(s=>s.id==="dates") as any).facts);
 assert.equal(facts(base)["Premium since"],"Loading from Discord…");assert.equal(facts(base)["Joined this server"],"Choose a shared server above");
 const loaded=mergeProfile(base,{user_profile:{},premium_since:null,legacy_username:null,mutual_guilds:[],mutual_friends:[],connected_accounts:[]});
 assert.equal(facts(loaded)["Premium since"],"No premium date shared");assert.equal(facts(loaded)["Legacy username"],"No legacy username shared");
 const server={...base,guildId:"one",memberState:"loading" as const};assert.equal(facts(server)["Joined this server"],"Loading member details…");
 const member={...server,...mergeProfileMember(server,{guild_id:"one",user:{id:person},joined_at:"2026-06-20T17:30:01Z",nick:null,premium_since:null})};
 assert.match(facts(member)["Joined this server"],/20 June 2026/);assert.equal(facts(member)["Server nickname"],"No server nickname");assert.equal(facts(member)["Boosting since"],"Not boosting this server");
 assert.match(facts({...server,memberState:"failed",memberError:"Permission denied"})["Joined this server"],/Permission denied/);
});

test("server join dates accept native/raw forms and never cross server/user context",()=>{
  const iso="2026-06-20T17:30:01.123Z";
  for(const value of [iso,new Date(iso),Date.parse(iso),String(Date.parse(iso)),{toDate:()=>new Date(iso)}]) assert.equal(discordDate(value)?.toISOString(),iso);
  for(const value of [null,undefined,"",false,true,"bad",{}]) assert.equal(discordDate(value),null);
  assert.equal(memberJoinedAt({joined_at:iso})?.toISOString(),iso);
  const data={id:person,guildId:"one",joinedServerAt:null,boostingSince:null,serverNickname:null} as ProfileData;
  assert.equal(mergeProfileMember(data,{guild_id:"one",user:{id:person},joined_at:iso}).joinedServerAt?.toISOString(),iso);
  assert.equal(mergeProfileMember(data,{guild_id:"two",joined_at:iso}).joinedServerAt,null);
  assert.equal(mergeProfileMember(data,{user:{id:actor},joined_at:iso}).joinedServerAt,null);
  assert.equal(mergeProfileMember({...data,joinedServerAt:new Date(iso)},{joined_at:null}).joinedServerAt,null);
});
test("history is opt-in, treats unknown fields as unknown and records only selected categories",()=>{
  let now=Date.parse("2026-10-22T12:00:00Z");const history=new ProfileHistory(null,()=>now++);
  history.observe(person,{bio:"before",presence:"offline"}); assert.equal(Object.keys(history.document.people).length,0);
  history.configure(person,true,["profile"]);history.observe(person,{bio:"before",presence:"offline"});
  history.observe(person,{bio:"after",presence:"online"});history.observe(person,{bio:null});
  assert.deepEqual(history.get(person)?.events.map(e=>e.kind),["bio","bio"]);
  history.observe(person,{username:"newly loaded"});assert.equal(history.get(person)?.events.length,2);
  history.observe(person,{bio:"stale cache"},true);assert.equal(history.get(person)?.events.length,2);
  history.configure(person,false);history.observe(person,{bio:"off"});assert.equal(history.get(person)?.events.length,2);
  history.configure(person,true);history.observe(person,{bio:"resume baseline"});assert.equal(history.get(person)?.events.length,2);
  const restored=new ProfileHistory(history.serialize(),()=>now++);restored.observe(person,{bio:"after a restart"});assert.equal(restored.get(person)?.events.length,2);
});
test("observer saves only opted-in deleted excerpts and attributes deletions to known authors",()=>{
  const history=new ProfileHistory();history.configure(person,true);
  const cached={id:messageId,channel_id:channel,author:{id:person},content:"Visible message before deletion",attachments:[{filename:"photo.png",url:"https://private-download.invalid"}],guild_id:"server"};
  const observer=new HistoryObserver(history,(_channel,id)=>id===messageId?cached:null);
  observer.handle({type:"MESSAGE_CREATE",message:cached});
  observer.handle({type:"MESSAGE_DELETE",channelId:channel,id:messageId,mlDeleted:true});
  assert.equal(history.get(person)?.events.length,0);
  observer.handle({type:"MESSAGE_DELETE_BULK",channelId:channel,ids:[messageId,"unknown"]});
  observer.handle({type:"MESSAGE_DELETE",channelId:channel,id:messageId});
  assert.equal(history.get(person)?.events.length,1);assert.equal(history.get(person)?.events[0].kind,"messageDeleted");
  assert.equal(history.get(person)?.events[0].messageText,cached.content);
  assert.deepEqual(history.get(person)?.events[0].messageFiles,["photo.png"]);
  observer.handle({type:"MESSAGE_UPDATE",message:{id:messageId,channel_id:channel,edited_timestamp:"2026-10-22T12:00:00Z",content:"EDITED SECRET"}});
  observer.handle({type:"MESSAGE_UPDATE",xrayLocalEdit:true,message:{...cached,edited_timestamp:"another"}});
  assert.equal(history.get(person)?.events.length,2);assert.equal(history.get(person)?.events[1].kind,"messageEdited");
  assert.doesNotMatch(history.serialize(),/EDITED SECRET|private-download/);
  const restored=new ProfileHistory(history.serialize());assert.equal(restored.get(person)?.events[0].messageText,cached.content);
  history.configure(actor,true,["edits"]);
  observer.handle({type:"MESSAGE_CREATE",message:{...cached,id:"300760994454437899",author:{id:actor},content:"Do not retain this"}});
  observer.handle({type:"MESSAGE_DELETE",channelId:channel,id:"300760994454437899"});
  assert.equal(history.get(actor)?.events.length,0);assert.doesNotMatch(history.serialize(),/Do not retain/);
});
test("deleted text uses the newest observed edit, handles partial updates and stays byte-bounded",()=>{
  const history=new ProfileHistory();history.configure(person,true);
  const observer=new HistoryObserver(history);
  observer.handle({type:"MESSAGE_CREATE",message:{id:messageId,channel_id:channel,author:{id:person},content:"original"}});
  observer.handle({type:"MESSAGE_UPDATE",message:{id:messageId,channel_id:channel,content:"latest text"}});
  observer.handle({type:"MESSAGE_UPDATE",message:{id:messageId,channel_id:channel,embeds:[]}});
  observer.handle({type:"MESSAGE_DELETE",channelId:channel,id:messageId});
  assert.equal(history.get(person)?.events[0].messageText,"latest text");
  for(let user=0;user<10;user++) {
    const id=String(300760994454437900n+BigInt(user));history.configure(id,true);
    for(let i=0;i<200;i++)history.add(id,"deletions",{id:`d:${i}`,kind:"messageDeleted",messageText:"😀".repeat(500),messageFiles:Array(4).fill("😀".repeat(80))});
  }
  const raw=history.serialize();assert.ok(new TextEncoder().encode(raw).byteLength<=1_800_000);
  const saved=new ProfileHistory(raw);assert.ok(Object.values(saved.document.people).some(record=>record.events.some(event=>event.messageText)));
});
test("presence, profile and membership observations are explicit, deduplicated and bounded",()=>{
  let now=Date.now();const history=new ProfileHistory(null,()=>now++);history.configure(person,true);
  const observer=new HistoryObserver(history);
  observer.handle({type:"PRESENCE_UPDATES",updates:[{user:{id:person},status:"offline"}]});
  observer.handle({type:"PRESENCE_UPDATES",updates:[{user:{id:person},status:"online"}]});
  observer.handle({type:"PRESENCE_UPDATES",updates:[{user:{id:person},status:"online"},{user:{id:actor},status:"online"}]});
  observer.handle({type:"GUILD_MEMBERS_CHUNK",guildId:"server",members:[]});
  observer.handle({type:"GUILD_MEMBER_REMOVE",guildId:"server",user:{id:person}});
  assert.deepEqual(history.get(person)?.events.map(e=>e.kind),["presence","memberRemoved"]);
  assert.equal(history.get(actor),undefined);
  for(let i=0;i<210;i++)history.add(person,"membership",{id:`member:${i}`,kind:"memberAdded"});
  assert.equal(history.get(person)?.events.length,200);
  now+=31*864e5;history.prune();assert.equal(history.get(person)?.events.length,0);
  history.note(person,"notes");history.remove(person);assert.equal(history.get(person),undefined);
});
test("moderator mode gates other-author deletion while server editing stays author-only",async()=>{
  const message={id:messageId,channel_id:channel,author:{id:person}};
  const policy={actor,author:person,enabled:true,guild:true,manageMessages:true};
  const audit:any[]=[];let calls=0,reports=0;
  const deps={policy:()=>policy,request:async()=>{calls++;return{status:204};},audit:(entry:any)=>audit.push(entry),report:()=>reports++,now:()=>"2026-10-22T12:00:00Z"};
  assert.equal(mayEnableModeration(actor,false),false);assert.equal(mayEnableModeration(undefined,true),false);assert.equal(mayEnableModeration(actor,true),true);
  assert.equal(messageAllowed("edit",policy),false);assert.equal(messageAllowed("localEdit",policy),true);
  await deleteMessageAuthorized(message,deps);assert.equal(calls,1);assert.equal(reports,1);assert.equal(audit.at(-1).actorId,actor);assert.equal(audit.at(-1).outcome,"confirmed");
  policy.enabled=false;await assert.rejects(deleteMessageAuthorized(message,deps),/controls are off/);assert.equal(calls,1);assert.equal(messageAllowed("localEdit",policy),false);
  policy.enabled=true;policy.manageMessages=false;await assert.rejects(deleteMessageAuthorized(message,deps));assert.equal(calls,1);
  policy.manageMessages=true;
  await assert.rejects(deleteMessageAuthorized(message,{...deps,request:async()=>({status:403})}),/403/);assert.equal(audit.at(-1).outcome,"rejected");assert.equal(reports,1);
  await assert.rejects(deleteMessageAuthorized(message,{...deps,audit:()=>{throw Error("storage full");}}),/storage full/);assert.equal(calls,1);
  assert.equal(messageAllowed("edit",{...policy,author:actor,enabled:false}),true);
  const ownAudit:any[]=[];
  await deleteMessageAuthorized(message,{...deps,policy:()=>({...policy,author:actor,enabled:false,guild:false,manageMessages:false}),audit:entry=>ownAudit.push(entry)});
  assert.equal(calls,2);assert.equal(ownAudit.length,0);
});
test("notification images prefer exact sender avatars, then the known server icon",()=>{
  const guild=()=>"https://cdn.discordapp.com/icons/123/server.png?size=64";
  const options={data:{guildId:"123",author:{id:person,avatar:"abc"}}};
  assert.equal(notificationIdentity("Server",options,()=>null,()=>null,guild).icon,`https://cdn.discordapp.com/avatars/${person}/abc.png?size=64`);
  assert.equal(notificationIdentity("Server",{data:{guildId:"123"}},()=>null,()=>null,guild).icon,guild());
  assert.equal(notificationIdentity("Discord",{},()=>null,()=>null).icon,"");
});


test("observed message images require opt-in, survive restart and accompany deletion",()=>{
 const h=new ProfileHistory();h.configure(person,true,["messages","deletions"]);
 const o=new HistoryObserver(h);const url="https://cdn.discordapp.com/attachments/123/456/image.png?ex=123";
 const msg={id:messageId,channel_id:channel,author:{id:person},content:"Image test",attachments:[{filename:"image.png",url},{filename:"tracker.png",url:"https://tracker.invalid/test.png"}]};
 o.handle({type:"MESSAGE_CREATE",message:msg});o.handle({type:"MESSAGE_DELETE",channelId:channel,id:messageId});
 const events=new ProfileHistory(h.serialize()).get(person)!.events;
 assert.deepEqual(events.map(e=>e.kind),["messageObserved","messageDeleted"]);
 for(const e of events){assert.deepEqual(e.messageImages,[url]);assert.equal(e.messageText,"Image test");}
 const off=new ProfileHistory();off.configure(person,true,["profile"]);new HistoryObserver(off).handle({type:"MESSAGE_CREATE",message:msg});assert.equal(off.get(person)!.events.length,0);
});
test("restored image links reject credentials, scripts and arbitrary hosts",()=>{
 const h=new ProfileHistory();h.configure(person,true,["messages"]);
 h.add(person,"messages",{id:"one",kind:"messageObserved",messageImages:["javascript:alert(1)","https://cdn.discordapp.com.evil.test/attachments/x/y/a.png","https://user:pass@cdn.discordapp.com/attachments/x/y/a.png","https://media.discordapp.net/attachments/x/y/a.png"]});
 assert.deepEqual(new ProfileHistory(h.serialize()).get(person)!.events[0].messageImages,["https://media.discordapp.net/attachments/x/y/a.png"]);
});

test("native attachment collections and URL-only media survive edit, deletion and restart",()=>{
 const url="https://cdn.discordapp.com/attachments/123/456/photo.png?ex=123",video="https://media.discordapp.net/attachments/123/456/clip.mp4";
 for(const attachments of [new Map([["a",{url}],["b",{proxyURL:video}]]),{a:{url},b:{proxy_url:video}},[{url},null,{proxy_url:video}]]){
  const h=new ProfileHistory();h.configure(person,true,["messages","edits","deletions"]);const o=new HistoryObserver(h);
  o.handle({type:"MESSAGE_CREATE",message:{id:messageId,channel_id:channel,author:{id:person},content:"Files",attachments}});
  o.handle({type:"MESSAGE_UPDATE",message:{id:messageId,channel_id:channel,content:"Edited",edited_timestamp:"2026-10-25T12:00:00Z"}});
  o.handle({type:"MESSAGE_DELETE",channelId:channel,id:messageId});
  const events=new ProfileHistory(h.serialize()).get(person)!.events;assert.equal(events.length,3);
  for(const event of events){assert.deepEqual(event.messageImages,[url]);assert.deepEqual(event.messageVideos,[video]);}
 }
});


test("custom status history displays previous/new text and explicit clearing",()=>{
  const rendered=historyEventText({id:"custom:1",at:Date.now(),kind:"customStatus",before:"At work",after:"(empty)"});
  assert.match(rendered,/Custom status changed/);assert.match(rendered,/At work/);assert.match(rendered,/\(empty\)/);
});

test("custom retention and no age expiry survive restart without changing size bounds",()=>{
 let now=Date.now();const h=new ProfileHistory(null,()=>now);h.configure(person,true,["messages"],365);
 h.add(person,"messages",{id:"old",kind:"messageObserved",messageText:"keep"});now+=100*864e5;
 const restored=new ProfileHistory(h.serialize(),()=>now);assert.equal(restored.get(person)?.retentionDays,365);assert.equal(restored.get(person)?.events.length,1);
 restored.configure(person,true,["messages"],0);now+=1000*864e5;assert.equal(new ProfileHistory(restored.serialize(),()=>now).get(person)?.events.length,1);
 assert.throws(()=>restored.configure(person,true,["messages"],-1),/whole number/);assert.throws(()=>restored.configure(person,true,["messages"],1.5),/whole number/);
});
