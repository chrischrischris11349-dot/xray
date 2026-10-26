export interface SearchScope {id:string;kind:"guild"|"dm";}
/** One explicit read of an existing message; never substitutes a neighbouring result. */
export async function originalMessage(get:(request:{url:string})=>Promise<any>,channel:string,message:string,author:string):Promise<any>{
 if(![channel,message,author].every(id=>/^\d{14,20}$/.test(id)))throw Error("Invalid original message ID");
 const response=await get({url:`/channels/${channel}/messages/${message}`});
 if(response?.status===429)throw Error("Discord rate limited this recovery. Wait before trying again.");
 if(response?.status>=400)throw Error(`Original message unavailable (HTTP ${response.status}). Use the account that can open this conversation; deleted originals cannot be refetched.`);
 const found=response?.body??response;
 if(found?.id!==message||found?.author?.id!==author)throw Error("Original message is deleted or unavailable in the current account; no neighbouring message was substituted");
 if(!found)throw Error("Original message is deleted or unavailable; its files cannot be recovered from the filename");
 return {...found,channel_id:channel};
}
export async function searchMessagePage(get:(request:{url:string})=>Promise<any>,scope:SearchScope,userId:string,cursor=0):Promise<{messages:any[];next:number|null;total:number|null}> {
  if(!/^\d{14,20}$/.test(userId) || !/^\d{14,20}$/.test(scope.id))throw Error("Invalid search ID.");
  if(scope.kind!=="guild" || !Number.isInteger(cursor) || cursor<0 || cursor>9975)throw Error("Invalid server search cursor; DM history uses string cursors.");
  const query=new URLSearchParams({author_id:userId,offset:String(cursor),limit:"25",sort_by:"timestamp",sort_order:"desc"});
  const response=await get({url:`/guilds/${scope.id}/messages/search?${query}`});
  const body=response?.body??response;
  if(response?.status===202)throw Error(`Search indexing is pending. Retry after ${body.retry_after??2} seconds.`);
  if(response?.status===429)throw Error(`Rate limited. Retry after ${body.retry_after??"a few"} seconds.`);
  if(response?.status>=400)throw Error(`Search unavailable (HTTP ${response.status}).`);
  const raw=body?.messages;
  if(!Array.isArray(raw))throw Error("Search returned an unsupported response, not an empty result.");
  const all=raw.flat().filter((m:any)=>m && typeof m.id==="string");
  const total=Number.isFinite(body?.total_results)?body.total_results:null;
  return {messages:all.filter((m:any)=>m.author?.id===userId),total,next:total!==null && cursor+25<total && cursor+25<=9975?cursor+25:null};
}
export async function searchDmPage(get:(request:{url:string})=>Promise<any>,id:string,userId:string,before?:string):Promise<{messages:any[];before?:string}> {
  if(!/^\d{14,20}$/.test(id) || !/^\d{14,20}$/.test(userId) || before && !/^\d{14,20}$/.test(before))throw Error("Invalid DM search ID.");
  const params=new URLSearchParams({limit:"100",...(before?{before}:{})});
  const response=await get({url:`/channels/${id}/messages?${params}`});
  if(response?.status>=400)throw Error(`DM history unavailable (HTTP ${response.status}).`);
  const rows=response?.body??response;if(!Array.isArray(rows))throw Error("DM history response unavailable.");
  const valid=rows.filter(m=>typeof m?.id==="string");
  return {messages:valid.filter(m=>m.author?.id===userId),before:rows.length===100?valid.reduce((old,m)=>!old || BigInt(m.id)<BigInt(old)?m.id:old,undefined as string|undefined):undefined};
}
