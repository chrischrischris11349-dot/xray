import assert from "node:assert/strict";
import {test} from "node:test";
import {openDb,store} from "./log-server.mjs";
import {botHistory} from "./bot-history.mjs";
import {startDiscordBot} from "./discord-bot.mjs";
const owner="300760994454437899",target="300760994454437890",guild="300760994454437891",channel="300760994454437892",message="300760994454437893";
function fixture(){const db=openDb(":memory:"),data=store(db);data.writeDocument(`server-monitors.${owner}`,JSON.stringify({version:1,servers:[{guildId:guild,testerId:target,enabled:true}]}),0);data.writeDocument(`profile-history.${owner}`,JSON.stringify({version:1,people:{[target]:{enabled:true,categories:["messages","edits","deletions","profile","presence"],retentionDays:30}}}),0);return{db,data,read:()=>JSON.parse(data.readDocument(`bot-history.${owner}`).value)};}
test("VPS bot retains opted-in messages/images and edits/deletions across collector restart",()=>{
 const {db,data,read}=fixture();let history=botHistory(db,data);history.status("connected");
 history.dispatch("MESSAGE_CREATE",{id:message,guild_id:guild,channel_id:channel,author:{id:target},content:"original",attachments:[{filename:"image.png",url:"https://cdn.discordapp.com/attachments/123/456/image.png"},{filename:"clip.webm",content_type:"video/webm",url:"https://cdn.discordapp.com/attachments/123/457/clip.webm"}]});
 history=botHistory(db,data);history.dispatch("MESSAGE_UPDATE",{id:message,guild_id:guild,channel_id:channel,content:"edited"});history.dispatch("MESSAGE_DELETE",{id:message,guild_id:guild,channel_id:channel});
 const events=read().people[target].events;assert.deepEqual(events.map(e=>e.kind),["messageObserved","messageEdited","messageDeleted"]);assert.equal(events[1].messageBefore,"original");assert.equal(events[2].messageText,"edited");assert.equal(events[2].messageImages.length,1);assert.equal(events[2].messageVideos.length,1);db.close();
});
test("VPS bot ignores other servers/users and stops when enrollment is disabled",()=>{
 const {db,data,read}=fixture(),history=botHistory(db,data);history.status("connected");
 const event={id:message,guild_id:guild,channel_id:channel,author:{id:target},content:"allowed"};history.dispatch("MESSAGE_CREATE",{...event,guild_id:"300760994454437894"});assert.deepEqual(read().people,{});
 const config=data.readDocument(`server-monitors.${owner}`);data.writeDocument(`server-monitors.${owner}`,JSON.stringify({version:1,servers:[{guildId:guild,testerId:target,enabled:false}]}),config.revision);history.dispatch("MESSAGE_CREATE",event);assert.deepEqual(read().people,{});db.close();
});
test("collector requires Bot authentication and reports missing configuration without logging tokens",async()=>{
 const {db,data,read}=fixture();const missing=await startDiscordBot(db,data,{token:""});assert.equal(read().collector.state,"setup-required");missing.stop();
 let authorization;await startDiscordBot(db,data,{token:"synthetic-test-value",fetcher:async(_url,options)=>{authorization=options.headers.Authorization;return{ok:true,json:async()=>({bot:false})};}});
 assert.equal(authorization,"Bot synthetic-test-value");assert.equal(read().collector.state,"authentication-failed");assert.doesNotMatch(JSON.stringify(read()),/synthetic-test-value/);db.close();
});
test("gateway identifies as a bot and stops on disallowed privileged intents",async()=>{
 const {db,data,read}=fixture();let socket;
 class MockSocket extends EventTarget{readyState=1;sent=[];constructor(){super();socket=this;}send(text){this.sent.push(JSON.parse(text));}close(){}}
 const bot=await startDiscordBot(db,data,{token:"synthetic-test-value",Socket:MockSocket,fetcher:async url=>({ok:true,json:async()=>url.endsWith("users/@me")?{bot:true}:{url:"wss://gateway.discord.gg",session_start_limit:{remaining:10}}})});
 socket.dispatchEvent(new MessageEvent("message",{data:JSON.stringify({op:10,d:{heartbeat_interval:1000}})}));assert.equal(socket.sent[0].op,2);assert.ok(socket.sent[0].d.intents&32768);
 const event=new Event("close");Object.assign(event,{code:4014});socket.dispatchEvent(event);assert.equal(read().collector.state,"configuration-required");bot.stop();db.close();
});
test("multiple opted-in profile testers can be observed in an enabled shared server",()=>{
 const {db,data,read}=fixture(),alt="300760994454437895";const profile=data.readDocument(`profile-history.${owner}`),raw=JSON.parse(profile.value);raw.people[alt]={enabled:true,categories:["messages"],retentionDays:30};data.writeDocument(`profile-history.${owner}`,JSON.stringify(raw),profile.revision);
 const history=botHistory(db,data);history.dispatch("MESSAGE_CREATE",{id:message,guild_id:guild,channel_id:channel,author:{id:alt},content:"Consented second tester"});assert.equal(read().people[alt].events[0].messageText,"Consented second tester");db.close();
});
