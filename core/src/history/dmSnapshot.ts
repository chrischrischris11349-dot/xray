import {deletionExcerpt} from './model';
import {messageArray,messageParts} from './messageParts';
/** Read the forwarding message and its snapshots, never its reply target. */
export function dmSnapshot(message:any,channel:string){
 const parts=messageParts(message),count=parts.reduce((n,part)=>n+messageArray(part.attachments).length,0);
 if(count>20)throw Error('Message attachment count exceeds the archive limit; this page was not skipped.');
 const excerpt=deletionExcerpt(message),hasMedia=parts.some(part=>part.attachments!==undefined||part.embeds!==undefined);
 return {id:message.id,channel,author:message.author?.id,...(excerpt.messageText!==undefined?{content:excerpt.messageText}:{}),...(excerpt.messageSentAt?{sentAt:excerpt.messageSentAt}:{}),...(message.edited_timestamp??message.editedTimestamp?{editedAt:String(message.edited_timestamp??message.editedTimestamp)}:{}),...(hasMedia?{images:excerpt.messageImages??[],videos:excerpt.messageVideos??[],audio:excerpt.messageAudio??[],downloads:excerpt.messageDownloads??[],files:excerpt.messageFiles??[]}: {})};
}
