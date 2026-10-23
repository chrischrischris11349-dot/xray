import { conversationLabel } from "./messageHistory";
import { imageLink } from "./imageViewer";
import { exportControls, resultReport } from "./reportExport";
import { formatDateTime } from "../time";
import { captureProfile, clearProfileHistory, configureHistory, historyError, historyFor, historyStorageLabel, removeProfileHistory, saveProfileNote, subscribeHistory } from "../history";
import { categories, type Category, type HistoryEvent } from "../history/model";
import { copyText } from "./dialog";
import { h } from "./dom";
import type { ProfileData } from "./profile";
import { stores } from "../discord";
import { deletionExcerpt, imageLinks } from "../history/model";

const labels: Record<Category,string> = { profile: "Username, display name, avatar, banner and global bio", presence: "Visible online / idle / DND / offline changes", membership: "Explicit shared-server member add/remove events", deletions: "Deleted messages · visible text excerpt and file names", edits: "Observed edits (content requires Observed messages)", messages: "Observed messages, text and image links (starts when enabled)" };
const eventNames: Record<string,string> = { username:"Username changed", displayName:"Display name changed", avatar:"Profile picture changed", banner:"Banner changed", bio:"Global bio changed", presence:"Presence observed", memberAdded:"Server membership added", memberRemoved:"Server membership removed (left, kicked or banned)", messageDeleted:"Message deleted · actor unknown", messageEdited:"Message edited", messageObserved:"Message observed" };
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
  let timelineKey = "";
  const draw = () => {
    if(historyError()) status.textContent=historyError();
    const record = historyFor(data.id);
    if(!noteDirty) note.value=record?.notes??"";
    if(!setupDirty) { enable.checked=record?.enabled??false;retention.value=String(record?.retentionDays??30);for(const [category,input] of selects)input.checked=record?record.categories.includes(category):category!=="messages"; }
    if(!historyError() && !busy) status.textContent=`Storage: ${historyStorageLabel()}.`;
    const deleted = record?.events.filter(e => e.kind === "messageDeleted").length ?? 0;
    summary.textContent = `${data.relationship ?? "Relationship unavailable"} · ${data.presence} · ${data.mutualServers.state === "ready" ? `${data.mutualServers.value.length} shared servers` : "Shared servers loading/unavailable"}${data.joinedServerAt ? ` · Joined ${data.serverName ?? "this server"} ${data.joinedServerAt.toLocaleDateString()}` : ""}.`;
    const nextKey=JSON.stringify([record?.enabled,record?.startedAt,record?.retentionDays,record?.events.length,record?.events.at(-1)?.id]);
    if(nextKey===timelineKey)return;
    timelineKey=nextKey;
    timeline.replaceChildren(h("h4",{class:"pf-title",text:record?.enabled?"History · observing":"History · off"}),
      h("p",{class:"pf-note",text:record?`${record.events.length} retained events · ${deleted} of their messages observed deleted · retention ${record.retentionDays} days. Record created ${formatDateTime(new Date(record.startedAt))}.` : "No history yet. Expand Set up history to choose what XRay records."}),
      h("p",{class:"pf-note",text:"Only events delivered while XRay is connected are observable. Message history retains up to 4,000 characters of previously visible text, four file names and four Discord image links. Images load when expanded; links can expire. Files themselves are not archived. Older entries may have no text. Actors are unknown. Profile-change values are limited to 300 characters."}),
      ...(record?.events.length ? [h("ol",{class:"pf-timeline"},...record.events.slice(-40).reverse().map(event=>h("li",{}, h("time",{attrs:{datetime:new Date(event.at).toISOString()},text:formatDateTime(new Date(event.at))}),h("span",{text:displayEvent(event)+(event.kind==="messageObserved" && record.events.some(e=>e.kind==="messageDeleted" && e.messageId===event.messageId && e.channelId===event.channelId) ? "\nLater observed deleted" : "")}), ...(event.messageImages?.length ? [historyImages(event.messageImages)] : []))))] : []),
      ...(record && record.events.length > 40 ? [h("p",{class:"pf-note",text:"Latest 40 shown. Copy report and history includes all retained events."})] : []));
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
  const stop=subscribeHistory(id=>{if(id==="*" || id===data.id) draw();});
  captureProfile(data.id); draw();
  return { element, update(next) { data=next; captureProfile(data.id); draw(); }, close:stop };
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
