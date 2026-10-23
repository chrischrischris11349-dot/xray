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
export interface AvailableMessage {id:string;channelId:string;content?:string;timestamp?:string;deleted:boolean;events:HistoryEvent[];images:string[];}
function sentTime(message:any):string|undefined {
  try {const value=message.timestamp?.toDate?.()??message.timestamp;const date=value?new Date(value):new Date(Number((BigInt(message.id)>>22n)+1420070400000n));return Number.isFinite(date.getTime())?date.toISOString():undefined;}catch{return undefined;}
}
export function queryAvailableMessages(userId:string,channels:any[],read:(id:string)=>any,events:HistoryEvent[]):AvailableMessage[] {
  const result=new Map<string,AvailableMessage>();
  const loaded=new Set<string>();
  for(const channel of channels)for(const message of collectionArray(read(channel.id))){
    if(message?.author?.id!==userId || typeof message.id!=="string")continue;
    loaded.add(`${channel.id}:${message.id}`);
    result.set(`${channel.id}:${message.id}`,{id:message.id,channelId:channel.id,content:message.content,timestamp:sentTime(message),deleted:!!(message.deleted||message.mlDeleted),events:[],images:(message.attachments??[]).filter((f:any)=>/^image\//.test(f.content_type??f.contentType??"") || /\.(png|jpe?g|webp|gif|avif)$/i.test(f.filename??"")).map((f:any)=>f.url)});
  }
  for(const event of events){if(!event.messageId || !event.channelId)continue;const key=`${event.channelId}:${event.messageId}`;
    const row=result.get(key)??{id:event.messageId,channelId:event.channelId,deleted:false,events:[],images:[]};
    row.events.push(event);if(event.kind==="messageDeleted")row.deleted=true;
    if(!row.timestamp)row.timestamp=event.messageSentAt??sentTime({id:event.messageId});
    if(!loaded.has(key) && event.messageText!==undefined)row.content=event.messageText;
    row.images=[...new Set([...row.images,...event.messageImages??[]])].slice(0,4);result.set(key,row);
  }
  return [...result.values()].sort((a,b)=>a.id.length-b.id.length || a.id.localeCompare(b.id));
}
