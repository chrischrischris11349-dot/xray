// GPL-3.0-or-later. Collect only enrolled testers in explicitly enabled guild monitors.
import {createHash} from "node:crypto";
const days=value=>Number.isInteger(value)&&value>=0&&value<=365000?value:30;
const id=value=>typeof value==="string"&&/^\d{14,20}$/.test(value);
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const text=(value,max=4000)=>typeof value==="string"?value.slice(0,max):undefined;
function excerpt(message){const attachments=(message?.attachments??[]).filter(a=>a&&typeof a==='object').slice(0,20),urls=list=>list.map(a=>a.url).filter(url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)&&/^\/(ephemeral-)?attachments\//.test(u.pathname);}catch{return false;}}),kind=(a,type,extension)=>/^(audio|video|image)\//.test(a.content_type??'')?a.content_type.startsWith(type+'/'):extension.test(a.filename??'');return {messageText:text(message?.content),messageSentAt:typeof message?.timestamp==='string'?message.timestamp:undefined,messageFiles:attachments.map(a=>text(a.filename,256)).filter(Boolean),messageImages:urls(attachments.filter(a=>kind(a,'image',/\.(png|jpe?g|gif|webp|avif)$/i))),messageVideos:urls(attachments.filter(a=>kind(a,'video',/\.(mp4|webm|mov)$/i))),messageAudio:urls(attachments.filter(a=>kind(a,'audio',/\.(ogg|oga|opus|mp3|m4a|wav|flac)$/i))),messageDownloads:urls(attachments)};}
export function botHistory(db,data,now=()=>Date.now()){
  db.exec("CREATE TABLE IF NOT EXISTS bot_messages (id TEXT PRIMARY KEY,guild TEXT NOT NULL,channel TEXT NOT NULL,author TEXT NOT NULL,body TEXT NOT NULL,at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS bot_baselines (id TEXT PRIMARY KEY,body TEXT NOT NULL)");
  const getMessage=db.prepare("SELECT body FROM bot_messages WHERE id=?"),putMessage=db.prepare("INSERT INTO bot_messages VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,at=excluded.at"),dropMessage=db.prepare("DELETE FROM bot_messages WHERE id=?");
  const getBaseline=db.prepare("SELECT body FROM bot_baselines WHERE id=?"),putBaseline=db.prepare("INSERT INTO bot_baselines VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body");
  let state="setup-required",lastError="Configure the server-side Discord bot token and install the bot in a test server",lastEventAt=null;
  function targets(){
    const result=[];
    for(const row of db.prepare("SELECT ns,value FROM documents WHERE ns LIKE 'server-monitors.%'").all()){
      const owner=row.ns.slice("server-monitors.".length),monitors=parse(row.value);if(!id(owner)||!Array.isArray(monitors?.servers))continue;
      const profile=parse(data.readDocument(`profile-history.${owner}`).value);
      const enrolled=Object.entries(profile?.people??{}).filter(([target,record])=>id(target)&&record?.enabled===true).slice(0,30).map(([target])=>target);
      for(const server of monitors.servers.slice(0,32))if(server.enabled===true&&id(server.guildId)&&id(server.testerId)){
        for(const target of new Set([server.testerId,...enrolled]))result.push({owner,guild:server.guildId,target,categories:profile?.people?.[target]?.enabled?profile.people[target].categories:[],days:days(profile?.people?.[target]?.retentionDays)});
      }
    }
    return [...new Map(result.map(target=>[`${target.owner}:${target.guild}:${target.target}`,target])).values()];
  }
  function cacheCutoff(){const values=targets().map(target=>target.days);return values.includes(0)?0:now()-Math.max(30,...values)*864e5;}
  function update(owner,change){
    const ns=`bot-history.${owner}`,saved=data.readDocument(ns),doc=parse(saved.value)??{version:1,people:{}};
    if(doc.version!==1||!doc.people||typeof doc.people!=="object")throw Error("Invalid bot history document; existing data retained");
    change(doc);doc.collector={state,lastError,lastEventAt,updatedAt:now()};
    for(const person of Object.values(doc.people))person.events=(person.events??[]).filter(e=>(days(person.retentionDays)===0||e.at>=now()-days(person.retentionDays)*864e5)).slice(-200);
    const events=Object.values(doc.people).flatMap(person=>person.events.map(event=>({person,event}))).sort((a,b)=>a.event.at-b.event.at);
    for(const {person,event}of events.slice(0,Math.max(0,events.length-2000)))person.events=person.events.filter(e=>e!==event);
    let raw=JSON.stringify(doc);while(Buffer.byteLength(raw)>1_800_000){const people=Object.values(doc.people).filter(p=>p.events.length);if(!people.length)throw Error("Bot document metadata exceeds its limit");people.sort((a,b)=>a.events[0].at-b.events[0].at)[0].events.shift();raw=JSON.stringify(doc);}
    if(!data.writeDocument(ns,raw,saved.revision))throw Error("Bot history changed; existing document retained");
  }
  function status(next,error=""){state=next;lastError=String(error).slice(0,240);for(const owner of new Set(targets().map(t=>t.owner)))update(owner,()=>{});}
  function record(target,event){update(target.owner,doc=>{
    const person=doc.people[target.target]??={enabled:true,startedAt:now(),retentionDays:target.days,categories:target.categories,notes:"VPS bot observations",events:[]};
    const suffix=event.kind==="messageEdited"?createHash("sha256").update(JSON.stringify([event.messageRevision,event.messageText,event.messageFiles,event.messageImages,event.messageVideos])).digest("hex").slice(0,24):"";
    const eventId=event.messageId?`bot:${event.kind}:${event.channelId}:${event.messageId}:${suffix}`:`bot:${target.guild}:${event.kind}:${now()}:${person.events.length}`;
    if(person.events.some(existing=>existing.id===eventId))return;
    const {messageRevision,...fields}=event;const value={...fields,id:eventId,guildId:target.guild,at:now()};
    person.retentionDays=target.days;person.events.push(value);
  });}
  function dispatch(type,event){
    if(!event||typeof event!=="object")return;const enrolled=targets();
    if(type==="GUILD_CREATE"){
      for(const member of event.members??[])dispatch("GUILD_MEMBER_UPDATE",{...member,guild_id:event.id});for(const presence of event.presences??[])dispatch("PRESENCE_UPDATE",{...presence,guild_id:event.id});return;
    }
    if(type==="MESSAGE_DELETE_BULK"){for(const messageId of (event.ids??[]).slice(0,1000))dispatch("MESSAGE_DELETE",{...event,id:messageId});return;}
    const cached=type.startsWith("MESSAGE_")?parse(getMessage.get(event.id)?.body):null;
    const message=type==="MESSAGE_UPDATE"?{...cached,...event,author:event.author??cached?.author}:event;
    const guild=event.guild_id??cached?.guild_id,user=event.user?.id??event.user_id??event.author?.id??cached?.author?.id;
    const selected=enrolled.filter(t=>t.guild===guild&&t.target===user);if(!selected.length)return;
    lastEventAt=now();
    for(const target of selected){
      const category=type==="MESSAGE_CREATE"?"messages":type==="MESSAGE_UPDATE"?"edits":type==="MESSAGE_DELETE"?"deletions":type==="PRESENCE_UPDATE"?"presence":type.startsWith("GUILD_MEMBER_")?"profile":"membership";
      const keepBody=target.categories.includes("messages")||target.categories.includes("deletions");
      if(type.startsWith("MESSAGE_")){
        const detail={kind:type==="MESSAGE_CREATE"?"messageObserved":type==="MESSAGE_UPDATE"?"messageEdited":"messageDeleted",channelId:event.channel_id??cached?.channel_id,messageId:event.id,...(type==="MESSAGE_UPDATE"?{messageRevision:message.edited_timestamp}:{} )};
        if(target.categories.includes(category))record(target,{...detail,...(keepBody?excerpt(type==="MESSAGE_DELETE"?cached:message):{}),...(type==="MESSAGE_UPDATE"&&target.categories.includes("messages")&&cached?.content!==undefined?{messageBefore:text(cached.content)}:{})});
        else if(type!=="MESSAGE_CREATE")record(target,detail);
      }else if(type==="GUILD_MEMBER_ADD"||type==="GUILD_MEMBER_REMOVE")record(target,{kind:type==="GUILD_MEMBER_ADD"?"memberAdded":"memberRemoved"});
      else {
        const key=`${target.owner}:${guild}:${user}`,before=parse(getBaseline.get(key)?.body)??{},patch={};
        if(type==="PRESENCE_UPDATE"){
          if(typeof event.status==="string")patch.presence=event.status;
          if(!["offline","invisible"].includes(event.status)&&Array.isArray(event.activities)){
            const activity=event.activities.find(a=>a?.type===4);const state=text(activity?.state,128)??"",emoji=activity?.emoji;
            const mark=id(emoji?.id)?`<${emoji.animated?"a":""}:${text(emoji.name,80)??""}:${emoji.id}>`:text(emoji?.name,80)??"";patch.customStatus=[mark,state].filter(Boolean).join(" ")||null;
          }
        }
        if(type==="VOICE_STATE_UPDATE")patch.voiceChannel=event.channel_id??null;
        if(type==="GUILD_MEMBER_UPDATE"){for(const [field,name]of [["username","username"],["global_name","displayName"],["avatar","avatar"]])if(event.user&&Object.hasOwn(event.user,field))patch[name]=event.user[field];if(Object.hasOwn(event,"nick"))patch.serverNickname=event.nick;}
        for(const [field,value]of Object.entries(patch))if(Object.hasOwn(before,field)&&before[field]!==value&&(target.categories.includes(field==="customStatus"?"profile":category)||field==="voiceChannel"))record(target,{kind:field,before:text(String(before[field]??"(empty)"),300),after:text(String(value??"(empty)"),300)});
        putBaseline.run(key,JSON.stringify({...before,...patch}));
      }
    }
    if(type==="MESSAGE_DELETE")dropMessage.run(event.id);
    else if(type==="MESSAGE_CREATE"||type==="MESSAGE_UPDATE"){
      const keepBody=selected.some(t=>t.categories.includes("messages")||t.categories.includes("deletions"));
      putMessage.run(event.id,guild,event.channel_id??cached?.channel_id,user,JSON.stringify({id:event.id,guild_id:guild,channel_id:event.channel_id??cached?.channel_id,author:{id:user},content:keepBody?text(message.content):undefined,timestamp:message.timestamp,attachments:keepBody?(message.attachments??[]).slice(0,4):[]}),now());
      db.prepare("DELETE FROM bot_messages WHERE at<? OR id IN (SELECT id FROM bot_messages ORDER BY at DESC LIMIT -1 OFFSET 10000)").run(cacheCutoff());
    }
  }
  function prune(){db.prepare("DELETE FROM bot_messages WHERE at<?").run(cacheCutoff());for(const row of db.prepare("SELECT ns FROM documents WHERE ns LIKE 'bot-history.%'").all())update(row.ns.slice("bot-history.".length),()=>{});}
  return {dispatch,status,targets,prune};
}
