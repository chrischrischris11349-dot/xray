/** Forward snapshots belong to the forwarding message; replies are not snapshots.
 * Read one bounded level only. Never traverse referenced_message or infer authors.
 */
export function messageArray(value:any):any[]{
 if(Array.isArray(value))return value;
 if(Array.isArray(value?._array))return value._array;
 if(typeof value?.toArray==='function')return value.toArray();
 if(typeof value?.values==='function')return [...value.values()];
 return value&&typeof value==='object'?Object.values(value):[];
}
export function messageParts(message:any):any[]{
 return [message,...messageArray(message?.message_snapshots??message?.messageSnapshots).slice(0,20).map(snapshot=>snapshot?.message).filter(part=>part&&typeof part==='object')].filter(Boolean);
}
export function messageContent(message:any):string|undefined{
 const parts=messageParts(message),forwarded=parts.slice(1).map(part=>typeof part.content==='string'?part.content:'').filter(Boolean);
 const own=typeof message?.content==='string'?message.content:undefined;
 return forwarded.length?[own,...forwarded.map(text=>`Forwarded snapshot:\n${text}`)].filter(Boolean).join('\n\n'):own;
}
