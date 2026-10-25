import { conversationLabel } from "./messageHistory";
import { imageLink } from "./imageViewer";
import { exportControls, resultReport } from "./reportExport";
import { formatDateTime } from "../time";
import { retryHistoryLoad, captureProfile, clearProfileHistory, configureHistory, historyError, historyFor, historyStorageLabel, removeProfileHistory, saveProfileNote, subscribeHistory } from "../history";
import { categories, type Category, type HistoryEvent } from "../history/model";
import { copyText } from "./dialog";
import { h } from "./dom";
import type { ProfileData } from "./profile";
import { myId, stores } from "../discord";
import { deletionExcerpt, imageLinks } from "../history/model";
import { icon, type IconName } from "./icons";
import { linkedText } from "./reportText";
import { reconcileChildren, StableRows } from "./reconcile";
import { invoke } from "../shell/bridge";
import { serverDataEnabled } from "../shell/serverStorage";
import { ProfileHistory } from "../history/model";

const labels: Record<Category,string> = { profile: "Username, display name, avatar, banner, global bio and custom status text/emoji", presence: "Visible online / idle / DND / offline changes", membership: "Explicit shared-server member add/remove events", deletions: "Deleted messages · visible text excerpt and file names", edits: "Observed edits (content requires Observed messages)", messages: "Observed messages, text and image links (starts when enabled)" };
const eventNames: Record<string,string> = { username:"Username changed", displayName:"Display name changed", avatar:"Profile picture changed", banner:"Banner changed", bio:"Global bio changed", customStatus:"Custom status changed", presence:"Presence observed", memberAdded:"Server membership added", memberRemoved:"Server membership removed (left, kicked or banned)", messageDeleted:"Message deleted · actor unknown", messageEdited:"Message edited", messageObserved:"Message observed" };
export function historyEventText(event: HistoryEvent): string {
  const parts=[eventNames[event.kind]??event.kind];
  if(event.before!==undefined || event.after!==undefined)parts.push(`${event.before??""} → ${event.after??""}`);
  if(event.guildId)parts.push(`server ${event.guildId}`);
  if(event.channelId)parts.push(conversationLabel(stores.channels?.getChannel?.(event.channelId),event.channelId));
  if(event.messageId)parts.push(`message ${event.messageId}`);
  let text=parts.join(" · ");
  if(["messageDeleted","messageObserved","messageEdited"].includes(event.kind)){
    if(event.messageSentAt)text+=`\nSent: ${formatDateTime(new Date(event.messageSentAt))}`;
    if(event.messageBefore!==undefined)text+=`\nPrevious: ${event.messageBefore}\nEdited:`;
    text+=`\n${event.messageText??"Text unavailable · not retained before this observation"}`;
    if(event.messageText==="")text+="(No text in the observed message)";
    if(event.messageFiles?.length)text+=`\nFiles: ${event.messageFiles.join(", ")}`;
  }
  return text;
}
/** Native disclosure keeps long text and attachment work off the initial render. */
export function historyEventDetail(event:HistoryEvent,text=historyEventText(event),laterDeleted=false):HTMLElement {
  const glyph:IconName=event.kind==="messageDeleted"?"x":event.kind==="messageEdited"?"reply":event.kind==="messageObserved"?"messageCircle":event.kind==="presence"?"info":event.kind.startsWith("member")?"users":"idCard";
  const excerpt=(event.messageText??event.after??event.before??"").replace(/\s+/g," ").slice(0,120);
  const details=h("details",{class:"history-event"},h("summary",{},h("span",{class:"history-event-icon",trustedHtml:icon(glyph,16)}),h("span",{class:"history-event-heading"},h("strong",{text:(eventNames[event.kind]??event.kind)+(laterDeleted?" · Later observed deleted":"")}),h("time",{attrs:{datetime:new Date(event.at).toISOString()},text:formatDateTime(new Date(event.at))}),...(excerpt?[h("span",{class:"history-event-preview",text:excerpt})]:[]))));
  details.addEventListener("toggle",()=>{
    if(!details.open || details.childElementCount>1)return;
    details.append(h("div",{class:"history-event-body"},h("pre",{class:"pf-report-data"},linkedText(text)),...(event.messageImages?.length?[historyImages(event.messageImages)]:[]),...(event.messageVideos?.length?[historyVideos(event.messageVideos)]:[]),h("details",{class:"pf-report-details"},h("summary",{text:"All observed event fields"}),h("pre",{class:"pf-report-data"},linkedText(event)))));
  });
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
  const retention = h("select", {class:"dialog-input", attrs:{"aria-label":"History retention"}}, h("option",{attrs:{value:"7"},text:"7 days"}),h("option",{attrs:{value:"30"},text:"30 days"}));
  const report = () => profileReport(data);
  const displayEvent = (event: HistoryEvent) => {
    // Older metadata-only entries can display text already held by the logger.
    // No request is made and unavailable/deleted content is never fabricated.
    const retained = event.kind === "messageDeleted" && event.messageText === undefined && event.channelId && event.messageId
      ? stores.messages?.getMessage?.(event.channelId,event.messageId) : undefined;
    return historyEventText(retained?.author?.id === data.id ? {...event,...deletionExcerpt(retained)} : event);
  };
  const run = (action: () => void | Promise<void>, message: string) => {
    if(busy)return;busy=true;status.textContent="Saving…";
    const controls=[...element.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>("button,input,textarea,select")];
    const disabled=controls.map(control=>control.disabled);controls.forEach(control=>{control.disabled=true;});
    void Promise.resolve().then(action).then(()=>{status.textContent=historyError() || `${message} Storage: ${historyStorageLabel()}.`;}).catch(error=>{status.textContent=historyError() || (error instanceof Error?error.message:"Could not save.");}).finally(()=>{busy=false;controls.forEach((control,i)=>{control.disabled=disabled[i];});});
  };
  let timelineKey = "",shownEvents=40;
  const draw = () => {
    if(historyError()) status.textContent=historyError();
    const record = historyFor(data.id);
    if(!noteDirty) note.value=record?.notes??"";
    if(!setupDirty) { enable.checked=record?.enabled??false;retention.value=String(record?.retentionDays??30);for(const [category,input] of selects)input.checked=record?record.categories.includes(category):category!=="messages"; }
    if(!historyError() && !busy) status.textContent=`Storage: ${historyStorageLabel()}.`;
    const deleted = record?.events.filter(e => e.kind === "messageDeleted").length ?? 0;
    summary.textContent = `${data.relationship ?? "Relationship unavailable"} · ${data.presence} · ${data.mutualServers.state === "ready" ? `${data.mutualServers.value.length} shared servers` : "Shared servers loading/unavailable"}${data.joinedServerAt ? ` · Joined ${data.serverName ?? "this server"} ${data.joinedServerAt.toLocaleDateString()}` : ""}.`;
    const nextKey=JSON.stringify([record?.enabled,record?.startedAt,record?.retentionDays,record?.events.length,record?.events.at(-1)?.id,shownEvents,record?null:historyError()]);
    if(nextKey===timelineKey)return;
    timelineKey=nextKey;
    const deletedMessages=new Set(record?.events.filter(e=>e.kind==="messageDeleted").map(e=>`${e.channelId}:${e.messageId}`));
    const visibleEvents=record?.events.slice(-shownEvents).reverse()??[];
    eventRows.retain(new Set(visibleEvents.map(event=>event.id)));
    reconcileChildren(eventList,visibleEvents.map(event=>{
      const text=displayEvent(event),laterDeleted=event.kind==="messageObserved" && deletedMessages.has(`${event.channelId}:${event.messageId}`);
      return eventRows.get(event.id,JSON.stringify([event,text,laterDeleted]),()=>h("li",{},historyEventDetail(event,text,laterDeleted)));
    }));
    timeline.replaceChildren(h("h4",{class:"pf-title",text:record?.enabled?"History · observing":record?"History · off":historyError()?"History · loading or unavailable":"History · not configured"}),
      h("p",{class:"pf-note",text:record?`${record.events.length} retained events · ${deleted} of their messages observed deleted · retention ${record.retentionDays} days. Record created ${formatDateTime(new Date(record.startedAt))}.` : historyError()?"History has not loaded. Existing data is not shown yet; check the status above and retry.":"No history yet. Expand Set up history to choose what XRay records."}),
      h("p",{class:"pf-note",text:"Only events delivered while XRay is connected are observable. Message history retains up to 4,000 characters of previously visible text, four file names and four Discord image links. Images load when expanded; links can expire. Files themselves are not archived. Older entries may have no text. Actors are unknown. Profile-change values are limited to 300 characters."}),
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
  setup.append(h("label",{class:"pf-history-option"},"Retention",retention), h("button",{class:"btn",attrs:{type:"button"},text:"Save history settings",on:{click:()=>run(()=>configureHistory(data.id,enable.checked,[...selects].filter(([,input])=>input.checked).map(([category])=>category),Number(retention.value)),"History settings saved.")}}));
  const erase = h("details",{class:"pf-history-setup"},h("summary",{text:"Clear or remove data"}),h("p",{class:"pf-note",text:"Clear removes retained events. Remove also deletes notes and turns history off for this profile."}),
    h("button",{class:"btn ghost",attrs:{type:"button"},text:"Clear events",on:{click:()=>run(()=>clearProfileHistory(data.id),"Events cleared.")}}),
    h("button",{class:"btn ghost",attrs:{type:"button"},text:"Remove history and notes",on:{click:()=>run(async()=>{await removeProfileHistory(data.id);note.value="";enable.checked=false;noteDirty=false;setupDirty=false;},"Data removed; history is off.")}}));
  element.append(h("h3",{class:"pf-title",text:"Profile report"}),summary,h("p",{class:"pf-note",text:"A factual snapshot of available Discord data, with your notes and observations. No inferred risk score or hidden account data."}),
    h("div",{class:"pf-journal-actions"},h("button",{class:"btn ghost",attrs:{type:"button"},text:"Copy profile report",on:{click:()=>copyText(report())}}),h("button",{class:"btn ghost",attrs:{type:"button"},text:"Copy report and history",on:{click:()=>copyText(`${report()}\n\nRetained observations (observation times):\n${historyFor(data.id)?.events.map(e=>`${new Date(e.at).toISOString()} ${displayEvent(e)}`).join("\n") || "None"}`)}})),
    h("label",{class:"pf-title",text:"Your notes"}),note,h("button",{class:"btn ghost",attrs:{type:"button"},text:"Save notes",on:{click:()=>run(async()=>{await saveProfileNote(data.id,note.value);noteDirty=false;},"Notes saved.")}}),status,setup,exportControls(()=>resultReport(`Profile history - ${data.username}`,[{profile:profileReport(data)},...historyFor(data.id)?.events??[]],{},"Opt-in observations only; missing edits, deletions and membership events cannot be reconstructed.")),timeline,erase);
  const vps=vpsProfileHistory(data.id);element.append(vps.element);
  const stop=subscribeHistory(id=>{if(id==="*" || id===data.id) draw();});
  captureProfile(data.id); draw();
  return { element, update(next) { data=next; captureProfile(data.id); draw(); }, close(){stop();vps.close();} };
}

/** Separate read-only document avoids concurrent bot/client snapshot overwrites. */
function vpsProfileHistory(target:string){
  let active=true,busy=false,shown=40,events:HistoryEvent[]=[],collector:any;
  const owner=myId(),element=h("section",{class:"pf-history-setup"},h("h4",{class:"pf-title",text:"VPS bot history"})),status=h("p",{class:"pf-note",attrs:{role:"status"}}),list=h("ol",{class:"pf-timeline"});
  const draw=()=>{list.replaceChildren(...events.slice(-shown).reverse().map(event=>h("li",{},historyEventDetail(event))));more.hidden=shown>=events.length;};
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

/** Defer remote image loads until requested, and retain an honest expired-link fallback. */
export function historyImages(urls: string[]): HTMLElement {
  const details=h("details",{},h("summary",{text:`Images (${urls.length})`}));
  details.addEventListener("toggle",()=>{
    if(!details.open || details.childElementCount>1)return;
    for(const url of imageLinks(urls) ?? []){
      const image=h("img",{attrs:{src:url,alt:"Observed message attachment",loading:"lazy",decoding:"async",referrerpolicy:"no-referrer"}});
      image.style.cssText="display:block;max-width:100%;width:auto;max-height:220px;border-radius:6px;margin-top:8px";
      const link=h("a",{attrs:{href:url,target:"_blank",rel:"noopener noreferrer",referrerpolicy:"no-referrer"}},image);
      image.addEventListener("error",()=>{link.textContent="Image unavailable or expired - open original link";},{once:true});
      imageLink(link,url,"Observed message attachment");
      details.append(link);
    }
  });return details;
}
export function historyVideos(urls:string[]):HTMLElement {
  const block=h("div");
  for(const url of imageLinks(urls)??[]){
    const fallback=h("a",{attrs:{href:url,target:"_blank",rel:"noopener noreferrer",referrerpolicy:"no-referrer"},text:"Video unavailable or unsupported · open original"});
    const player=h("video",{class:"qr-media",attrs:{src:url,controls:"",preload:"none",playsinline:"","aria-label":"Observed video attachment"}});
    player.style.cssText="display:block;max-width:100%;max-height:360px;margin-top:8px";
    player.addEventListener("error",()=>player.replaceWith(fallback),{once:true});block.append(player);
  }return block;
}
