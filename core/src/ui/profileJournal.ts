import { conversationLabel,collectionArray } from "./messageHistory";
import { imageLink } from "./imageViewer";
import { exportControls, resultReport } from "./reportExport";
import { formatDateTime } from "../time";
import { retryHistoryLoad, captureProfile, clearProfileHistory, configureHistory, historyError, historyFor, historyStorageLabel, removeProfileHistory, saveProfileNote, subscribeHistory, retainRecoveredMedia,retainLoadedMedia } from "../history";
import { categories, type Category, type HistoryEvent } from "../history/model";
import { copyText } from "./dialog";
import { h } from "./dom";
import type { ProfileData } from "./profile";
import { http, myId, stores,currentChannelId } from "../discord";
import { deletionExcerpt, imageLinks } from "../history/model";
import { icon, type IconName } from "./icons";
import { linkedText } from "./reportText";
import { reconcileChildren, StableRows } from "./reconcile";
import { invoke } from "../shell/bridge";
import { serverDataEnabled } from "../shell/serverStorage";
import { ProfileHistory } from "../history/model";
import { archivedMedia } from "./archivedMedia";
import { originalMessage } from "./messageSearch";
import { hasNativeSave,saveAsButton,suggestedFilename } from "./saveAs";

const labels: Record<Category,string> = { profile: "Username, display name, avatar, banner, global bio and custom status text/emoji", presence: "Visible online / idle / DND / offline changes", membership: "Explicit shared-server member add/remove events", deletions: "Deleted messages · visible text excerpt and file names", edits: "Observed edits (content requires Observed messages)", messages: "Observed messages, text and image links (starts when enabled)" };
const eventNames: Record<string,string> = { username:"Username changed", displayName:"Display name changed", avatar:"Profile picture changed", banner:"Banner changed", bio:"Global bio changed", customStatus:"Custom status changed", presence:"Presence observed", memberAdded:"Server membership added", memberRemoved:"Server membership removed (left, kicked or banned)", messageDeleted:"Message deleted · actor unknown", messageEdited:"Message edited", messageObserved:"Message observed",messageLoaded:"Media loaded from conversation history" };
/** Shared delivery identity; independent observation timestamps are kept in exports. */
export function historyMessageIdentity(event:HistoryEvent):string{
 if(!event.messageId||!event.channelId)return event.id;
 return `${event.kind==="messageLoaded"?"messageObserved":event.kind}:${event.channelId}:${event.messageId}${event.kind==="messageEdited"?JSON.stringify([event.messageText,event.messageBefore,event.messageFiles]):""}`;
}
export function historyEventText(event: HistoryEvent): string {
  const parts=[eventNames[event.kind]??event.kind];
  if(event.before!==undefined || event.after!==undefined)parts.push(`${event.before??""} → ${event.after??""}`);
  if(event.guildId)parts.push(`server ${event.guildId}`);
  if(event.channelId)parts.push(conversationLabel(stores.channels?.getChannel?.(event.channelId),event.channelId));
  if(event.messageId)parts.push(`message ${event.messageId}`);
  let text=parts.join(" · ");
  if(["messageDeleted","messageObserved","messageLoaded","messageEdited"].includes(event.kind)){
    if(event.messageSentAt)text+=`\nSent: ${formatDateTime(new Date(event.messageSentAt))}`;
    if(event.messageBefore!==undefined)text+=`\nPrevious: ${event.messageBefore}\nEdited:`;
    text+=`\n${event.messageText??"Text unavailable · not retained before this observation"}`;
    if(event.messageText==="")text+="(No text in the observed message)";
    if(event.messageFiles?.length)text+=`\nFiles: ${event.messageFiles.join(", ")}`;
  }
  return text;
}
/** Recover missing attachment metadata only from this author's still-loaded message. */
export function historyEventWithMedia(event: HistoryEvent, author: string, lookup = (channel: string, id: string) => stores.messages?.getMessage?.(channel,id)): HistoryEvent {
  if (!event.channelId || !event.messageId || !event.kind.startsWith("message")) return event;
  const loaded = lookup(event.channelId,event.messageId);
  if (loaded?.author?.id !== author) return event;
  const excerpt = deletionExcerpt(loaded);
  // Existing observations are immutable snapshots: don't replace old text with a newer edit.
  return {...event,
    messageText:event.messageText ?? excerpt.messageText,
    messageFiles:event.messageFiles ?? excerpt.messageFiles,
    messageImages:event.messageImages ?? excerpt.messageImages,
    messageVideos:event.messageVideos ?? excerpt.messageVideos};
}
/** Media events open directly; other disclosures defer their long text until expanded. */
export function historyEventDetail(event:HistoryEvent,text=historyEventText(event),laterDeleted=false,recover?:()=>Promise<void>):HTMLElement {
  const glyph:IconName=event.kind==="messageDeleted"?"x":event.kind==="messageEdited"?"reply":event.kind==="messageObserved"?"messageCircle":event.kind==="presence"?"info":event.kind.startsWith("member")?"users":"idCard";
  const excerpt=(event.messageText??event.after??event.before??"").replace(/\s+/g," ").slice(0,120);
  const details=h("details",{class:"history-event"},h("summary",{},h("span",{class:"history-event-icon",trustedHtml:icon(glyph,16)}),h("span",{class:"history-event-heading"},h("strong",{text:(eventNames[event.kind]??event.kind)+(laterDeleted?" · Later observed deleted":"")}),h("time",{attrs:{datetime:new Date(event.at).toISOString()},text:formatDateTime(new Date(event.at))}),...(excerpt?[h("span",{class:"history-event-preview",text:excerpt})]:[]))));
  const populate=()=>{
    if(!details.open || details.childElementCount>1)return;
    details.append(h("div",{class:"history-event-body"},h("pre",{class:"pf-report-data"},linkedText(text)),...(event.messageImages?.length?[historyImages(event.messageImages)]:[]),...(event.messageVideos?.length?[historyVideos(event.messageVideos)]:[]),h("details",{class:"pf-report-details"},h("summary",{text:"All observed event fields"}),h("pre",{class:"pf-report-data"},linkedText(event)))));
    if(recover&&event.messageFiles?.length){
      const missing=!event.messageImages?.length&&!event.messageVideos?.length;
      const state=h("p",{class:"pf-note",attrs:{role:"status"},text:missing?"This older log saved a filename without a media URL.":"Refresh original attachment links if the archive failed before saving a copy."});
      const button=h("button",{class:"btn ghost",text:"Recover original attachments",on:{click:async()=>{button.disabled=true;state.textContent="Reading original message attachments…";try{await recover();state.textContent="Attachment URLs recovered; saving server copies…";}catch(error){state.textContent=String((error as Error)?.message??error);}finally{button.disabled=false;}}}});
      if(missing)details.append(state,button);else details.append(h("details",{},h("summary",{text:"Attachment recovery"}),state,button));
    }
  };
  details.addEventListener("toggle",populate);
  if (event.messageImages?.length || event.messageVideos?.length) { details.open=true;populate(); }
  return details;
}
export function profileReport(data: ProfileData, now = new Date()): string {
  const history = historyFor(data.id);
  const count = (loaded: ProfileData["mutualServers"]) => loaded.state === "ready" ? String(loaded.value.length) : loaded.state;
  return [`XRay profile report · ${data.name} (@${data.username})`, `Generated: ${formatDateTime(now)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`, `User ID: ${data.id}`,
    `Account created: ${formatDateTime(data.createdAt)}`, `Relationship: ${data.relationship ?? "Unavailable"}`, `Presence snapshot: ${data.presence}`,
    `Server context: ${data.serverName ?? "None selected"}`, `Joined server: ${data.joinedServerAt ? formatDateTime(data.joinedServerAt) : "Unavailable"}`,
    `Mutual servers: ${count(data.mutualServers)}`, `Mutual friends: ${data.mutualFriendCount ?? (data.mutualFriends.state === "ready" ? data.mutualFriends.value.length : data.mutualFriends.state)}`,
    `Avatar: ${data.avatar ?? "Unavailable"}`, `Banner: ${data.banner ?? "Unavailable"}`,
    ...(history?.events.filter(e=>e.kind==="memberAdded"||e.kind==="memberRemoved").map(e=>`Membership observation: ${historyEventText(e)} at ${formatDateTime(new Date(e.at))}`)??[]),
    `Badges: ${data.badges.join(", ") || "None available"}`, `Bio in this context: ${data.bio ?? "Unavailable"}`,
    `History (${historyStorageLabel()}): ${history?.enabled ? "Observing while XRay is connected" : "Off"}`, `Retained observed deletions: ${history?.events.filter(e => e.kind === "messageDeleted").length ?? 0}`,
    "Coverage: a current snapshot and opt-in observations, not a complete account history. Hidden/offline activity and private servers are unavailable. A deleted message does not identify who deleted it.",
    ...(history?.notes ? [`Your notes: ${history.notes}`] : [])].join("\n");
}

export function profileJournal(initial: ProfileData): { element: HTMLElement; update(data: ProfileData): void; close(): void } {
  let data = initial;
  const element = h("section", { class:"pf-block wide pf-journal", attrs:{"aria-label":"Profile report and history"} });
  const summary = h("p", {class:"pf-note"});
  let noteDirty = false, setupDirty = false, busy = false;
  const note = h("textarea", {class:"dialog-input pf-note-input",attrs:{rows:"3",maxlength:"2000","aria-label":"Your private profile notes",placeholder:"Your notes about this profile. Storage location is shown below."},on:{input:()=>{noteDirty=true;}}});
  note.value = historyFor(data.id)?.notes ?? "";
  const status = h("p", {class:"pf-note",attrs:{role:"status"}});
  const timeline = h("div");
  const eventList=h("ol",{class:"pf-timeline"}),eventRows=new StableRows();
  const setup = h("details", {class:"pf-history-setup"});
  const enable = h("input", {attrs:{type:"checkbox","aria-label":"Enable history for this profile"}});
  setup.addEventListener("change",()=>{setupDirty=true;});
  const selects = new Map<Category,HTMLInputElement>();
  const retention = h("input", {class:"dialog-input", attrs:{type:"number",min:"0",max:"365000",step:"1",required:"","aria-label":"History retention in days. Zero means no age expiry."}});
  const report = () => profileReport(data);
  const displayEvent = (event: HistoryEvent) => historyEventText(historyEventWithMedia(event,data.id));
  const run = (action: () => void | Promise<void>, message: string) => {
    if(busy)return;busy=true;status.textContent="Saving…";
    const controls=[...element.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>("button,input,textarea,select")];
    const disabled=controls.map(control=>control.disabled);controls.forEach(control=>{control.disabled=true;});
    void Promise.resolve().then(action).then(()=>{status.textContent=historyError() || `${message} Storage: ${historyStorageLabel()}.`;}).catch(error=>{status.textContent=historyError() || (error instanceof Error?error.message:"Could not save.");}).finally(()=>{busy=false;controls.forEach((control,i)=>{control.disabled=disabled[i];});});
  };
  let timelineKey = "",shownEvents=40,timelineRevision=0,loadedMediaCaptured=false;
  const draw = () => {
    if(historyError()) status.textContent=historyError();
    const record = historyFor(data.id);
    if(!loadedMediaCaptured&&record?.enabled&&record.categories.includes("messages")){loadedMediaCaptured=true;const channel=currentChannelId();if(channel)retainLoadedMedia(data.id,collectionArray(stores.messages?.getMessages?.(channel)));}
    if(!noteDirty) note.value=record?.notes??"";
    if(!setupDirty) { enable.checked=record?.enabled??false;retention.value=String(record?.retentionDays??30);for(const [category,input] of selects)input.checked=record?record.categories.includes(category):category!=="messages"; }
    if(!historyError() && !busy) status.textContent=`Storage: ${historyStorageLabel()}.`;
    const deleted = record?.events.filter(e => e.kind === "messageDeleted").length ?? 0;
    summary.textContent = `${data.relationship ?? "Relationship unavailable"} · ${data.presence} · ${data.mutualServers.state === "ready" ? `${data.mutualServers.value.length} shared servers` : "Shared servers loading/unavailable"}${data.joinedServerAt ? ` · Joined ${data.serverName ?? "this server"} ${data.joinedServerAt.toLocaleDateString()}` : ""}.`;
    const nextKey=JSON.stringify([timelineRevision,record?.enabled,record?.startedAt,record?.retentionDays,record?.events.length,record?.events.at(-1)?.id,shownEvents,record?null:historyError()]);
    if(nextKey===timelineKey)return;
    timelineKey=nextKey;
    const deletedMessages=new Set(record?.events.filter(e=>e.kind==="messageDeleted").map(e=>`${e.channelId}:${e.messageId}`));
    const visibleEvents=record?.events.slice(-shownEvents).reverse()??[];
    eventRows.retain(new Set(visibleEvents.map(event=>event.id)));
    reconcileChildren(eventList,visibleEvents.map(event=>{
      const displayed=historyEventWithMedia(event,data.id),text=historyEventText(displayed),laterDeleted=["messageObserved","messageLoaded"].includes(event.kind) && deletedMessages.has(`${event.channelId}:${event.messageId}`);
      return eventRows.get(event.id,JSON.stringify([displayed,text,laterDeleted]),()=>h("li",{},historyEventDetail(displayed,text,laterDeleted,async()=>{
        const client=http();if(!client?.get||!event.channelId||!event.messageId)throw Error("Discord message reading is unavailable");
        await retainRecoveredMedia(data.id,await originalMessage(request=>client.get(request),event.channelId,event.messageId,data.id));
      })));
    }));
    timeline.replaceChildren(h("h4",{class:"pf-title",text:record?.enabled?"History · observing":record?"History · off":historyError()?"History · loading or unavailable":"History · not configured"}),
      h("p",{class:"pf-note",text:record?`${record.events.length} retained events · ${deleted} of their messages observed deleted · retention ${record.retentionDays===0?"no age expiry":`${record.retentionDays} days`}. Record created ${formatDateTime(new Date(record.startedAt))}.` : historyError()?"History has not loaded. Existing data is not shown yet; check the status above and retry.":"No history yet. Expand Set up history to choose what XRay records."}),
      h("p",{class:"pf-note",text:"Only delivered events are observable. Server storage archives retained photo/video URLs as actual files and reports save failures. Older entries with no URL cannot recover a deleted file. Limits: 4,000 text characters, four images/videos of each kind, 200 events per profile / 2,000 across profiles and a 1.8 MB history document. Media archive: 250 MB per file / 20 GB total. Increasing days does not recover already pruned entries."}),
      ...(!record && historyError()?[h("button",{class:"btn ghost",text:"Retry loading history",on:{click:retryHistoryLoad}})]:[]),
      ...(record?.events.length ? [eventList] : []),
      ...(record && record.events.length > shownEvents ? [h("button",{class:"btn ghost",text:`Show older history (${record.events.length-shownEvents} remaining)`,on:{click:()=>{shownEvents+=40;draw();}}})] : []));
  };
  const saved = historyFor(data.id);
  enable.checked = saved?.enabled ?? false;
  retention.value=String(saved?.retentionDays ?? 30);
  setup.append(h("summary",{text:"Set up history"}),h("p",{class:"pf-note",text:"Opt in for this profile for your authorized testing. Storage follows Store profile data on my server in the XRay panel. History starts now; previous activity cannot be recovered."}),h("label",{class:"pf-history-option"},enable,"Enable history for this profile"));
  for (const category of categories) {
    const input=h("input",{attrs:{type:"checkbox","aria-label":labels[category]}}); input.checked=saved?saved.categories.includes(category):category!=="messages"; selects.set(category,input);
    setup.append(h("label",{class:"pf-history-option"},input,labels[category]));
  }
  setup.append(h("label",{class:"pf-history-option"},"Retention in days · 0 = no age expiry",retention), h("button",{class:"btn",attrs:{type:"button"},text:"Save history settings",on:{click:()=>run(()=>{if(!/^\d+$/.test(retention.value))throw Error("Enter a whole number of days; 0 means no age expiry.");return configureHistory(data.id,enable.checked,[...selects].filter(([,input])=>input.checked).map(([category])=>category),Number(retention.value));},"History settings saved.")}}));
  const erase = h("details",{class:"pf-history-setup"},h("summary",{text:"Clear or remove data"}),h("p",{class:"pf-note",text:"Clear removes retained events. Remove also deletes notes and turns history off for this profile."}),
    h("button",{class:"btn ghost",attrs:{type:"button"},text:"Clear events",on:{click:()=>run(()=>clearProfileHistory(data.id),"Events cleared.")}}),
    h("button",{class:"btn ghost",attrs:{type:"button"},text:"Remove history and notes",on:{click:()=>run(async()=>{await removeProfileHistory(data.id);note.value="";enable.checked=false;noteDirty=false;setupDirty=false;},"Data removed; history is off.")}}));
  element.append(h("h3",{class:"pf-title",text:"Profile report"}),summary,h("p",{class:"pf-note",text:"A factual snapshot of available Discord data, with your notes and observations. No inferred risk score or hidden account data."}),
    h("div",{class:"pf-journal-actions"},h("button",{class:"btn ghost",attrs:{type:"button"},text:"Copy profile report",on:{click:()=>copyText(report())}}),h("button",{class:"btn ghost",attrs:{type:"button"},text:"Copy report and history",on:{click:()=>copyText(`${report()}\n\nRetained observations (observation times):\n${historyFor(data.id)?.events.map(e=>`${new Date(e.at).toISOString()} ${displayEvent(e)}`).join("\n") || "None"}`)}})),
    h("label",{class:"pf-title",text:"Your notes"}),note,h("button",{class:"btn ghost",attrs:{type:"button"},text:"Save notes",on:{click:()=>run(async()=>{await saveProfileNote(data.id,note.value);noteDirty=false;},"Notes saved.")}}),status,setup,exportControls(()=>resultReport(`Profile history - ${data.username}`,[{profile:profileReport(data)},...historyFor(data.id)?.events??[]],{},"Opt-in observations only; missing edits, deletions and membership events cannot be reconstructed.")),timeline,erase);
  const vps=vpsProfileHistory(data.id);element.append(vps.element);
  const stop=subscribeHistory(id=>{if(id==="*" || id===data.id){timelineRevision++;draw();}});
  captureProfile(data.id); draw();
  return { element, update(next) { data=next; captureProfile(data.id); draw(); }, close(){stop();vps.close();} };
}

/** Separate read-only document avoids concurrent bot/client snapshot overwrites. */
function vpsProfileHistory(target:string){
  let active=true,busy=false,shown=40,events:HistoryEvent[]=[],collector:any;
  const owner=myId(),element=h("section",{class:"pf-history-setup"},h("h4",{class:"pf-title",text:"VPS bot history"})),status=h("p",{class:"pf-note",attrs:{role:"status"}}),list=h("ol",{class:"pf-timeline"});
  const draw=()=>{const desktop=new Set((historyFor(target)?.events??[]).map(historyMessageIdentity)),distinct=events.filter(event=>!desktop.has(historyMessageIdentity(event)));list.replaceChildren(...distinct.slice(-shown).reverse().map(event=>h("li",{},historyEventDetail(event))));more.hidden=shown>=distinct.length;};
  const refresh=h("button",{class:"btn ghost",text:"Refresh VPS history",on:{click:()=>void load()}}),more=h("button",{class:"btn ghost",text:"Show older VPS events",on:{click:()=>{shown+=40;draw();}}});more.hidden=true;
  async function load(){
    if(!owner||busy||!active)return;if(!serverDataEnabled(owner)){status.textContent="Enable Store profile data on my server to read the always-on collector. A bot must be installed in the monitored test servers.";return;}
    busy=true;refresh.disabled=true;status.textContent="Reading history collected by your VPS…";
    try{const response:any=await invoke("document_store",{ns:`bot-history.${owner}`,value:null,revision:null});if(!active||myId()!==owner)return;
      if(response?.value===null){events=[];status.textContent="The server has no bot history yet. Configure the bot, install it in the test servers, and enable a tester in the monitor list.";draw();return;}
      if(typeof response?.value!=="string")throw Error("The VPS returned an unreadable history document");const raw=JSON.parse(response.value);if(raw.version!==1||!raw.people)throw Error("Unsupported VPS history format");
      events=new ProfileHistory(JSON.stringify({version:1,people:{[target]:raw.people[target]}})).get(target)?.events??[];collector=raw.collector;
      status.textContent=`Collector: ${collector?.state??"Status not supplied"}. ${collector?.lastError??""} ${events.length} retained events for this tester. Bot access covers shared, permitted servers; private account DMs and global bio changes are not supplied by the bot gateway.`;draw();
    }catch(error){if(active)status.textContent=String((error as Error)?.message??error);}
    finally{busy=false;if(active)refresh.disabled=false;}
  }
  element.append(status,h("div",{class:"pf-journal-actions"},refresh,more),exportControls(()=>resultReport(`VPS history for ${target}`,events,{collector},"Read-only bot observations from enabled shared-server monitors; unavailable events cannot be reconstructed.")),list);
  if(serverDataEnabled(owner))void load();else status.textContent="Enable server profile storage and configure the bot to collect permitted tester activity while your PC is off.";
  return {element,close(){active=false;}};
}

/** Inline lazy thumbnails; opening an event does not require a second disclosure. */
export function historyImages(urls: string[]): HTMLElement {
  const block=h("div",{class:"history-event-images",attrs:{"aria-label":`Images (${urls.length})`}});
    for(const url of imageLinks(urls) ?? []){
      const holder=h("div");
      const show=(source:string,external=source)=>{
      const image=h("img",{attrs:{src:source,alt:"Observed message attachment",loading:"lazy",decoding:"async",referrerpolicy:"no-referrer"}});
      image.style.cssText="display:block;max-width:100%;width:auto;max-height:220px;border-radius:6px;margin-top:8px";
      const link=h("a",{attrs:{href:external,target:"_blank",rel:"noopener noreferrer",referrerpolicy:"no-referrer"}},image);
      image.addEventListener("error",()=>{link.replaceWith(h("a",{attrs:{href:external,target:"_blank",rel:"noopener noreferrer"},text:"Image unavailable or expired · open original link"}));},{once:true});
      imageLink(link,source,"Observed message attachment");holder.replaceChildren(link,...(hasNativeSave()?[saveAsButton(external,suggestedFilename(url,"photo"))]:[]));
      };show(url);block.append(holder);const archive=archivedMedia(url,"image",show);if(archive)block.append(archive);
    }
  return block;
}
export function historyVideos(urls:string[]):HTMLElement {
  const block=h("div");
  for(const url of imageLinks(urls)??[]){
    const holder=h("div"),show=(source:string,external=source)=>{
    const fallback=h("a",{attrs:{href:external,target:"_blank",rel:"noopener noreferrer",referrerpolicy:"no-referrer"},text:"Video unavailable or unsupported · open original"});
    const player=h("video",{class:"qr-media",attrs:{src:source,controls:"",preload:"none",playsinline:"","aria-label":"Observed video attachment"}});
    player.style.cssText="display:block;max-width:100%;max-height:360px;margin-top:8px";
    player.addEventListener("error",()=>player.replaceWith(fallback),{once:true});holder.replaceChildren(player,...(hasNativeSave()?[saveAsButton(external,suggestedFilename(url,"video"))]:[]));
    };show(url);block.append(holder);const archive=archivedMedia(url,"video",show);if(archive)block.append(archive);
  }return block;
}
