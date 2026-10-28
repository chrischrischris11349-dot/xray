import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';import {parseHTML} from 'linkedom';
const output=await build({stdin:{contents:'export {ProfileHistory,deletionExcerpt} from "./core/src/history/model";export {HistoryObserver} from "./core/src/history/observer";export {changeSummary,profileArt} from "./core/src/history/profileChanges";export {NotificationMessages} from "./core/src/shell/notificationIdentity";export {sessionMessageView,onLocalMessageViewChanged} from "./core/src/ui/localMessageView";',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'}),ctx={module:{exports:{}},URL,TextEncoder};vm.runInNewContext(output.outputFiles[0].text,ctx);const api=ctx.module.exports;
const person='223456789012345678',channel='323456789012345678',source='https://cdn.discordapp.com/attachments/123/456/voice-message.ogg';
test('voice messages retain playable URLs through deletion and serialization, not just filenames',()=>{
 const history=new api.ProfileHistory(null,()=>10000);history.configure(person,true,['messages','deletions'],0);const observer=new api.HistoryObserver(history);
 observer.handle({type:'MESSAGE_CREATE',message:{id:'423456789012345678',channel_id:channel,author:{id:person},content:'',attachments:[{url:source,filename:'voice-message.ogg',content_type:'audio/ogg'}]}});observer.handle({type:'MESSAGE_DELETE',id:'423456789012345678',channelId:channel});
 const restored=new api.ProfileHistory(history.serialize(),()=>10000).get(person);assert.equal(restored.events[1].messageAudio[0],source);assert.equal(restored.events[1].messageDownloads[0],source);assert.equal(restored.events[1].messageFiles[0],'voice-message.ogg');
});
test('important profile changes, review markers and hash-to-picture URLs are explicit and persistent',()=>{
 const history=new api.ProfileHistory(null,()=>10000);history.configure(person,true,['profile','presence']);history.observe(person,{avatar:'a'.repeat(32),customStatus:'Old'});history.observe(person,{avatar:'b'.repeat(32),customStatus:'New',presence:'online'});
 const digest=api.changeSummary(history.get(person).events,0);assert.equal(digest.important.length,2);assert.ok(digest.groups.some(group=>group.label==='Status updated'));history.review(person,10000);const restored=new api.ProfileHistory(history.serialize(),()=>10000);assert.equal(api.changeSummary(restored.get(person).events,restored.get(person).reviewedAt).fresh.length,0);
 assert.match(api.profileArt('avatar',person,'a_'.concat('b'.repeat(32))),/\.gif\?size=256$/);assert.equal(api.profileArt('avatar',person,'<script>'),null);
});
test('short notification bodies resolve only a unique recent sender and local overrides emit redraws without store mutation',()=>{
 const recent=new api.NotificationMessages(()=>1000);recent.remember({id:'a',author:{id:person},content:':('});assert.equal(recent.match(':(').author.id,person);recent.remember({id:'b',author:{id:'other'},content:':('});assert.equal(recent.match(':('),null);
 let changed=0;const stop=api.onLocalMessageViewChanged(()=>changed++),message={id:'423456789012345678',channel_id:channel,content:'Original'};api.sessionMessageView.edit(message,'Edited');assert.equal(changed,1);assert.equal(message.content,'Original');api.sessionMessageView.load(api.sessionMessageView.serialize());assert.equal(changed,2);stop();api.sessionMessageView.clear();
});
test('audio and avatar event UIs contain actual media elements and original field disclosures',async()=>{

 // Pure renderer entrypoints are tree-shaken; unrelated journal exports need not initialize.
 const result=await build({stdin:{contents:'export {historyEventDetail} from "./core/src/ui/profileJournal";',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',loader:{'.svg':'text'}});
 const {document}=parseHTML('<html><body></body></html>');const context={module:{exports:{}},document,window:{addEventListener(){}},addEventListener(){},URL,TextEncoder};vm.runInNewContext(result.outputFiles[0].text,context);
 const audio=context.module.exports.historyEventDetail({id:'test',at:1000,kind:'messageObserved',messageAudio:[source]});assert.equal(audio.querySelector('audio').getAttribute('preload'),'none');assert.equal(audio.querySelector('audio').getAttribute('src'),source);
 const picture=context.module.exports.historyEventDetail({id:'photo',at:1000,kind:'avatar',before:'a'.repeat(32),after:'b'.repeat(32)},undefined,false,undefined,person);assert.equal(picture.querySelectorAll('figure img').length,2);
});


test('forwarded media and text survive a snapshot without attributing reply content to the sender',async()=>{
 const output=await build({stdin:{contents:'export {deletionExcerpt,ProfileHistory} from "./core/src/history/model";export {dmSnapshot} from "./core/src/history/dmSnapshot";export {HistoryObserver} from "./core/src/history/observer";',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'});
 const context={module:{exports:{}},URL,TextEncoder};vm.runInNewContext(output.outputFiles[0].text,context);const api=context.module.exports;
 const target='223456789012345678',channel='323456789012345678',video='https://cdn.discordapp.com/attachments/123/456/forwarded.mp4',audio='https://cdn.discordapp.com/attachments/123/457/voice-message.ogg';
 const message={id:'423456789012345678',author:{id:target},channel_id:channel,content:'',attachments:[],message_snapshots:[{message:{content:'A forwarded clip',attachments:[{url:video,filename:'forwarded.mp4',content_type:'video/mp4'},{url:audio,filename:'voice-message.ogg',content_type:'audio/ogg'}]}}],referenced_message:{content:'Private reply target',attachments:[{url:'https://cdn.discordapp.com/attachments/123/458/excluded.png'}]}};
 const snapshot=api.dmSnapshot(message,channel);assert.equal(snapshot.author,target);assert.equal(snapshot.content,'Forwarded snapshot:\nA forwarded clip');assert.deepEqual(Array.from(snapshot.videos),[video]);assert.deepEqual(Array.from(snapshot.audio),[audio]);assert.equal(snapshot.images.length,0);assert.doesNotMatch(JSON.stringify(snapshot),/Private reply target|excluded/);
 let now=1000000;const history=new api.ProfileHistory(null,()=>now),observer=new api.HistoryObserver(history);history.configure(target,true,['messages','deletions','presence'],0);observer.handle({type:'MESSAGE_CREATE',message});observer.handle({type:'MESSAGE_DELETE',channelId:channel,id:message.id});assert.equal(history.get(target).events.at(-1).messageVideos[0],video);
 history.observe(target,{presence:'online'},true);assert.equal(history.get(target).lastOnlineAt,undefined,'opening a cached profile is not a new online observation');
 const changed=observer.handle({type:'PRESENCE_UPDATE',user:{id:target},status:'dnd'});assert.ok(changed.has(target));assert.equal(history.get(target).lastOnlineAt,now);now+=60000;observer.handle({type:'PRESENCE_UPDATE',user:{id:target},status:'offline'});assert.equal(history.get(target).lastOnlineAt,now-60000);assert.equal(history.get(target).lastPresenceAt,now);
 const restored=new api.ProfileHistory(history.serialize(),()=>now);assert.equal(restored.get(target).lastOnlineAt,now-60000);restored.configure(target,true,['messages'],0);now+=60000;restored.observe(target,{presence:'online'});assert.equal(restored.get(target).lastOnlineAt,now-120000,'presence opt-out stops last-online observations');
});
