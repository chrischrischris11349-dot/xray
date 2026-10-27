import {collectionArray} from '../ui/messageHistory';
import {deletionExcerpt,imageLinks} from './model';
/** Keep all supported returned attachments; unlike the rolling excerpt this doesn't silently take four. */
export function dmSnapshot(message:any,channel:string){
 const excerpt=deletionExcerpt(message),attachments=collectionArray(message.attachments),images:string[]=[],videos:string[]=[];
 const files=attachments.map(file=>String(file.filename??file.fileName??'Attachment'));
 for(const file of attachments){const urls=imageLinks([file.url,file.proxy_url??file.proxyURL])??[],mime=file.content_type??file.contentType??'',name=file.filename??file.fileName??'';
  const list=/^image\//.test(mime)||/\.(png|jpe?g|webp|gif|avif)$/i.test(name)?images:/^video\//.test(mime)||/\.(mp4|webm|mov)$/i.test(name)?videos:null;
  if(list&&urls[0])list.push(urls[0]);
 }
 for(const embed of collectionArray(message.embeds)){
  for(const image of [embed.image,embed.thumbnail]){const url=imageLinks([image?.url,image?.proxy_url??image?.proxyURL])?.[0];if(url)images.push(url);}
  const url=imageLinks([embed.video?.url,embed.video?.proxy_url??embed.video?.proxyURL])?.[0];if(url)videos.push(url);
 }
 const uniqueImages=[...new Set(images)],uniqueVideos=[...new Set(videos)];
 if(files.length>20||uniqueImages.length>20||uniqueVideos.length>20)throw Error('Message attachment count exceeds the archive limit; this page was not skipped.');
 return {id:message.id,channel,author:message.author?.id,...(typeof message.content==='string'?{content:message.content}:{}),...(excerpt.messageSentAt?{sentAt:excerpt.messageSentAt}:{}),...(message.edited_timestamp?{editedAt:String(message.edited_timestamp)}:{}),...(message.attachments!==undefined||message.embeds!==undefined?{images:uniqueImages,videos:uniqueVideos,files}: {})};
}
