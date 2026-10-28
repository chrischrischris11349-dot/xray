import { searchMessagePage, searchDmPage, type SearchScope } from "./messageSearch";
import { http, stores } from "../discord";
import { historyFor } from "../history";
import { h } from "./dom";
import { channelList, collectionArray, conversationLabel, queryAvailableMessages, type AvailableMessage } from "./messageHistory";
import { historyEventDetail } from "./profileJournal";
import { exportControls, resultReport } from "./reportExport";
import { renderChatMessage } from "./chatMessage";

/** Reuse mini-chat's safe native image/video/embed renderer in the full report. */
export function renderAvailableMessage(row:AvailableMessage,channel?:any):HTMLElement {
  const attachments=[...row.attachments],seen=new Set(attachments.flatMap(a=>[a.url,a.proxy_url]));
  for(const [kind,urls]of [["image",row.images],["video",row.videos],["audio",row.audio??[]]] as const)for(const url of urls){
    if(seen.has(url))continue;seen.add(url);
    let filename=kind==="image"?"Observed image":"Observed video";try{filename=decodeURIComponent(new URL(url).pathname.split("/").pop()??filename);}catch{/* Keep the descriptive label. */}
    attachments.push({url,filename,content_type:`${kind}/${kind==="image"?"png":kind==="audio"?"ogg":"mp4"}`});
  }
  const message=renderChatMessage({id:row.id,timestamp:row.timestamp,deleted:row.deleted,attachments,embeds:row.embeds},false,row.content??"Text was not retained.");
  const marker=message.querySelector(".qr-deleted-label");if(marker)marker.textContent="Deleted · retained observation";
  return h("article",{class:"pf-block pf-message"},h("h4",{class:"pf-title",text:conversationLabel(channel,row.channelId)}),h("p",{class:"pf-note",text:`Message ${row.id}${row.deleted?" · Deleted (observed)":""}`}),message,...row.events.map(event=>historyEventDetail(event)));
}

export function availableMessages(userId:string):HTMLElement {
  const events=historyFor(userId)?.events??[];
  const sources:any[]=[stores.channels?.getMutablePrivateChannels?.()];
  for(const guild of collectionArray(stores.guilds?.getGuilds?.())){
    sources.push(stores.guildChannels?.getChannels?.(guild.id),stores.channels?.getMutableGuildChannelsForGuild?.(guild.id));
  }
  for(const id of [...collectionArray(stores.privateChannelSort?.getPrivateChannelIds?.()),...events.map(e=>e.channelId).filter(Boolean)])sources.push(stores.channels?.getChannel?.(id));
  const channels=channelList(...sources);
  const remote=new Map<string,any>();
  let records=queryAvailableMessages(userId,channels,id=>stores.messages?.getMessages?.(id),events);
  const section=h("section",{class:"pf-block wide"},h("h3",{class:"pf-title",text:"Available messages across servers and DMs"}));
  const coverage=`${records.length} messages from loaded conversations and retained observations. This is not a lifetime search. Unloaded messages and missing historical edits/deletions cannot be recovered from this cache.`;
  section.append(h("p",{class:"pf-note",text:coverage}),exportControls(()=>resultReport(`Messages by ${userId}`,records,{},coverage+` Fetched matches: ${remote.size}; scopes completed: ${scopeIndex}/${scopes.length}.`)));
  const scopes:SearchScope[]=[...collectionArray(stores.guilds?.getGuilds?.()).map(g=>({id:g.id,kind:"guild" as const})),...channels.filter(c=>c.type===1 || c.type===3).map(c=>({id:c.id,kind:"dm" as const}))];
  let scopeIndex=0,offset=0,before:string|undefined,busy=false;
  const searchStatus=h("p",{class:"pf-note",attrs:{role:"status"}});
  const fetchNext=h("button",{class:"btn",text:"Search next server / DM page",on:{click:()=>{void load();}}});
  const skip=h("button",{class:"btn ghost",text:"Skip this scope",on:{click:()=>{if(busy)return;scopeIndex++;offset=0;before=undefined;fetchNext.disabled=scopeIndex>=scopes.length;searchStatus.textContent=`Scope ${scopeIndex+1} of ${scopes.length}`;}}});
  async function load(){
    if(busy || scopeIndex>=scopes.length)return;const client=http();if(!client?.get){searchStatus.textContent="Discord search client unavailable. Cached results remain below.";return;}
    busy=true;fetchNext.disabled=true;const scope=scopes[scopeIndex];searchStatus.textContent=`Searching ${scope.kind} ${scope.id} (${scopeIndex+1}/${scopes.length})...`;
    try {
      const result=scope.kind==="guild"?await searchMessagePage(request=>client.get(request),scope,userId,offset):await searchDmPage(request=>client.get(request),scope.id,userId,before);
      for(const m of result.messages)remote.set(`${m.channel_id}:${m.id}`,m);
      if(scope.kind==="guild"){const next=(result as Awaited<ReturnType<typeof searchMessagePage>>).next;if(next===null){scopeIndex++;offset=0;}else offset=next;}
      else {before=(result as Awaited<ReturnType<typeof searchDmPage>>).before;if(!before)scopeIndex++;}
      const discovered=channelList(channels,...[...remote.values()].map(m=>stores.channels?.getChannel?.(m.channel_id)??{id:m.channel_id,type:scope.kind==="dm"?1:0,guild_id:scope.kind==="guild"?scope.id:undefined}));
      records=queryAvailableMessages(userId,discovered,id=>[...collectionArray(stores.messages?.getMessages?.(id)),...[...remote.values()].filter(m=>m.channel_id===id)],events);
      searchStatus.textContent=`${remote.size} matching messages fetched. ${scopeIndex>=scopes.length?"All listed scopes checked (subject to Discord search limits).":"More scopes/pages remain; click to continue."}`;
      page=0;draw();
    } catch(error){searchStatus.textContent=String((error as Error)?.message??error)+" Retry this page or skip this scope. Cached results remain available.";}
    finally{busy=false;fetchNext.disabled=scopeIndex>=scopes.length || remote.size>=1000;if(remote.size>=1000)searchStatus.textContent+=" Session capped at 1,000 fetched messages; export these results before starting another session.";}
  }
  section.append(h("p",{class:"pf-note",text:"Remote search is manual and paged. One request per click; no background scan. Permission and indexing limits apply. Deleted content comes only from retained observations."}),fetchNext,skip,searchStatus);
  const list=h("div"),status=h("span",{class:"pf-note"});let page=0;
  const draw=()=>{
    list.replaceChildren(...records.slice(page*25,page*25+25).map(row=>renderAvailableMessage(row,stores.channels?.getChannel?.(row.channelId))));
    status.textContent=records.length?`Page ${page+1} of ${Math.ceil(records.length/25)}`:"No messages loaded or retained for this user.";
    previous.disabled=page===0;next.disabled=(page+1)*25>=records.length;
  };
  const previous=h("button",{class:"btn ghost",text:"Previous",on:{click:()=>{page--;draw();}}});
  const next=h("button",{class:"btn ghost",text:"Next",on:{click:()=>{page++;draw();}}});
  section.append(list,h("div",{class:"pf-journal-actions"},previous,status,next));draw();return section;
}
