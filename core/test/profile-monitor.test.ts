import assert from "node:assert/strict";
import {test} from "node:test";
import {parseHTML} from "linkedom";
import {makeFloatingPanel} from "../src/ui/floatingPanel";
import {pluginState} from "../src/settings";
import {linkedText,connectionUrl} from "../src/ui/reportText";
import {recordCard,reportPhoto,reportAvatar} from "../src/ui/importedReport";
import {ServerMonitors} from "../src/monitoring/model";
import {NotificationMessages,notificationIdentity} from "../src/shell/notificationIdentity";
const tester="300760994454437890",guild="300760994454437891";
test("nested report links are safe anchors without interpreting supplied HTML",()=>{
 const {document}=parseHTML("<html><body></body></html>");(globalThis as any).document=document;
 const content=linkedText({nested:[{url:"https://example.com/path?q=1"}],optional:null,text:'<img src=x onerror="bad()"> http://example.org'});
 const links=content.querySelectorAll("a");assert.equal(links.length,2);for(const link of links){assert.equal(link.target,"_blank");assert.equal(link.rel,"noopener noreferrer");}
 assert.equal(content.querySelector("img"),null);assert.equal(linkedText("javascript:alert(1)").querySelector("a"),null);assert.equal(linkedText("https://user:password@example.org").querySelector("a"),null);
 const card=recordCard({title:"Example",fields:[{key:"links",value:["https://example.net"]}]});assert.equal(card.querySelectorAll("a").length,1);
 assert.equal(connectionUrl({type:"spotify",name:"Name",id:"abc"}),"https://open.spotify.com/user/abc");
});
test("avatar shapes are validated and failed images get an accessible fallback",()=>{
 const {document,Event}=parseHTML("<html><body></body></html>");(globalThis as any).document=document;
 assert.equal(reportAvatar({url:"https://cdn.discordapp.com/avatars/123/a.png"}),"https://cdn.discordapp.com/avatars/123/a.png");assert.equal(reportAvatar("javascript:alert(1)"),null);
 const image=reportPhoto("https://cdn.discordapp.com/avatars/123/missing.png","Alex","pf-avatar");document.body.append(image);image.dispatchEvent(new Event("error"));assert.match(document.body.querySelector('[role="img"]')!.getAttribute("aria-label")!,/unavailable/);
});
test("monitor selections persist and selected testers produce bounded metadata-only events",()=>{
 let now=Date.now();const monitors=new ServerMonitors(null,()=>now++);monitors.add(guild,"Team");monitors.configure(guild,tester,true);
 const message={id:"300760994454437892",author:{id:tester},channel_id:"channel",guild_id:guild,content:"Never persist this body"};const lookup=()=>message,guildFor=()=>guild;
 assert.equal(monitors.observe({type:"MESSAGE_CREATE",message},lookup,guildFor),true);assert.equal(monitors.observe({type:"MESSAGE_CREATE",message:{...message,author:{id:"other"}}},lookup,guildFor),false);
 assert.equal(monitors.observe({type:"MESSAGE_DELETE",channelId:"channel",id:message.id,mlDeleted:true},lookup,guildFor),false);
 const presence=(status:string)=>({type:"PRESENCE_UPDATE",user:{id:tester},status,activities:[{name:"Example game",details:"Lobby"}]});assert.equal(monitors.observe(presence("offline"),lookup,guildFor),false);assert.equal(monitors.observe(presence("online"),lookup,guildFor),true);
 const raw=monitors.serialize();assert.doesNotMatch(raw,/Never persist/);const restored=new ServerMonitors(raw,()=>now++);assert.equal(restored.servers[0].testerId,tester);restored.configure(guild,tester,false);assert.equal(restored.observe({type:"MESSAGE_CREATE",message},lookup,guildFor),false);now+=8*864e5;restored.prune();assert.equal(restored.servers[0].events.length,0);
});
test("notification matching is short-lived and refuses ambiguous senders",()=>{
 let now=1;const context=new NotificationMessages(()=>now);const a={id:"1",author:{id:tester},content:"Unique message"};context.remember(a);assert.equal(context.match("Unique message"),a);context.remember({...a,id:"2"});assert.equal(context.match("Unique message"),null);now+=16000;assert.equal(context.match("Unique message"),null);
 const identity=notificationIdentity("Discord",{data:{author:{id:tester,username:"Alex",avatar:null}}},()=>null,()=>null);assert.equal(identity.title,"Alex");assert.match(identity.icon,/embed\/avatars\/\d.png/);
});

test("hiding a floating chat does not overwrite its persisted size",()=>{
 const {document}=parseHTML("<html><body></body></html>");(globalThis as any).document=document;
 Object.assign(globalThis,{innerWidth:1280,innerHeight:720,cancelAnimationFrame:()=>{}});
 let observe:()=>void=()=>{};(globalThis as any).ResizeObserver=class{constructor(callback:()=>void){observe=callback;}observe(){}disconnect(){}};
 const panel=document.createElement("section");Object.defineProperties(panel,{offsetWidth:{value:0},offsetHeight:{value:0}});
 pluginState("floating-test").data={x:300,y:60,width:540,height:510};const close=makeFloatingPanel(panel,{key:"floating-test"});observe();
 assert.equal(panel.style.width,"540px");assert.equal(panel.style.height,"510px");close();assert.equal(pluginState("floating-test").data!.width,540);
});

test("drag samples share one animation frame and commit without a jump",()=>{
 const {document,Event}=parseHTML("<html><body></body></html>");(globalThis as any).document=document;
 let frame:FrameRequestCallback=()=>{},requests=0;
 Object.assign(globalThis,{innerWidth:1280,innerHeight:720,requestAnimationFrame:(fn:FrameRequestCallback)=>{frame=fn;return ++requests;},cancelAnimationFrame:()=>{},ResizeObserver:class{observe(){}disconnect(){}}});
 const panel=document.createElement("section"),head=document.createElement("header");head.className="drag-head";panel.append(head);
 Object.assign(panel,{setPointerCapture:()=>{},hasPointerCapture:()=>false});
 pluginState("drag-test").data={x:100,y:70,width:400,height:400};const close=makeFloatingPanel(panel,{key:"drag-test",header:".drag-head"});
 const pointer=(type:string,x:number,y:number)=>{const event=new Event(type,{bubbles:true});Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});head.dispatchEvent(event);};
 pointer("pointerdown",110,80);pointer("pointermove",150,100);pointer("pointermove",210,140);assert.equal(requests,1);assert.equal(panel.style.left,"100px");frame(0);assert.equal(panel.style.transform,"translate3d(100px,60px,0)");pointer("pointerup",210,140);assert.equal(panel.style.left,"200px");assert.equal(panel.style.top,"130px");assert.equal(panel.style.transform,"");assert.equal(pluginState("drag-test").data!.x,200);close();
});
