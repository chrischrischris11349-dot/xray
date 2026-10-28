import type { HistoryEvent } from "../history/model";

export function conversationLabel(channel:any,id?:string):string {
  if(channel?.type===1 || channel?.isDM?.())return `DM · ${channel.name || id || channel.id}`;
  if(channel?.type===3 || channel?.isGroupDM?.())return `Group DM · ${channel.name || id || channel.id}`;
  return channel ? `#${channel.name || id || channel.id}${channel.guild_id??channel.guildId ? ` · server ${channel.guild_id??channel.guildId}` : ""}` : `Conversation type unavailable · ${id??"unknown"}`;
}
/** Discord collections have used arrays, wrappers, maps and .toArray across releases. */
export function collectionArray(value:any):any[] {
  if(Array.isArray(value))return value;
  if(typeof value?.toArray==="function")return value.toArray();
  if(Array.isArray(value?._array))return value._array;
  if(value instanceof Map)return [...value.values()];
  return value && typeof value==="object"?Object.values(value):[];
}
export function channelList(...sources:any[]):any[] {
  const found=new Map<string,any>(),seen=new Set<any>();
  const visit=(value:any,depth=0)=>{if(!value || typeof value!=="object" || depth>6 || seen.has(value))return;seen.add(value);
    if(typeof value.id==="string" && (typeof value.type==="number" || value.guild_id || value.guildId)){found.set(value.id,value);return;}
    for(const item of collectionArray(value))visit(item,depth+1);
  };sources.forEach(source=>visit(source));return [...found.values()];
}
export interface AvailableMessage {id:string;channelId:string;content?:string;timestamp?:string;deleted:boolean;events:HistoryEvent[];images:string[];videos:string[];audio?:string[];attachments:any[];embeds:any[];}
function sentTime(message:any):string|undefined {
  try {const value=message.timestamp?.toDate?.()??message.timestamp;const date=value?new Date(value):new Date(Number((BigInt(message.id)>>22n)+1420070400000n));return Number.isFinite(date.getTime())?date.toISOString():undefined;}catch{return undefined;}
}
export function queryAvailableMessages(userId:string,channels:any[],read:(id:string)=>any,events:HistoryEvent[]):AvailableMessage[] {
  const result=new Map<string,AvailableMessage>();
  const loaded=new Set<string>();
  for(const channel of channels)for(const message of collectionArray(read(channel.id))){
    if(message?.author?.id!==userId || typeof message.id!=="string")continue;
    loaded.add(`${channel.id}:${message.id}`);
    const attachments=collectionArray(message.attachments).slice(0,10).map(f=>({url:f.url,filename:f.filename??f.fileName,content_type:f.content_type??f.contentType,proxy_url:f.proxy_url??f.proxyURL,size:f.size,spoiler:f.spoiler}));
    const media=(value:any)=>value?{url:value.url,proxy_url:value.proxy_url??value.proxyURL}:undefined;
    const embeds=collectionArray(message.embeds).slice(0,10).map(e=>({type:e.type,url:e.url,title:e.title,description:e.description,provider:e.provider?{name:e.provider.name}:undefined,image:media(e.image),thumbnail:media(e.thumbnail),video:media(e.video),fields:collectionArray(e.fields).map(f=>({name:f.name,value:f.value}))}));
    result.set(`${channel.id}:${message.id}`,{id:message.id,channelId:channel.id,content:message.content,timestamp:sentTime(message),deleted:!!(message.deleted||message.mlDeleted),events:[],images:attachments.filter(f=>/^image\//.test(f.content_type??"") || /\.(png|jpe?g|webp|gif|avif)$/i.test(f.filename??"")).map(f=>f.url),videos:attachments.filter(f=>/^video\//.test(f.content_type??"") || /\.(mp4|webm|mov)$/i.test(f.filename??"")).map(f=>f.url),audio:attachments.filter(f=>/^audio\//.test(f.content_type??"")||/\.(ogg|oga|opus|mp3|m4a|wav|flac)$/i.test(f.filename??"")).map(f=>f.url),attachments,embeds});
  }
  for(const event of events){if(!event.messageId || !event.channelId)continue;const key=`${event.channelId}:${event.messageId}`;
    const row=result.get(key)??{id:event.messageId,channelId:event.channelId,deleted:false,events:[],images:[],videos:[],attachments:[],embeds:[]};
    row.events.push(event);if(event.kind==="messageDeleted")row.deleted=true;
    if(!row.timestamp)row.timestamp=event.messageSentAt??sentTime({id:event.messageId});
    if(!loaded.has(key) && event.messageText!==undefined)row.content=event.messageText;
    row.audio=[...new Set([...row.audio??[],...event.messageAudio??[]])].slice(0,20);
    row.images=[...new Set([...row.images,...event.messageImages??[]])].slice(0,10);
    row.videos=[...new Set([...row.videos,...event.messageVideos??[]])].slice(0,10);
    result.set(key,row);
  }
  return [...result.values()].sort((a,b)=>a.id.length-b.id.length || a.id.localeCompare(b.id));
}
