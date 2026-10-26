import { menu } from "../api/menus";
import { currentChannelId, http, myId, stores } from "../discord";
import { accountDocument, serverDataEnabled, storageSwitching } from "../shell/serverStorage";
import { reportEvent } from "../shell/report";
import { confirmAction, showDialog } from "../ui/dialog";
import { h } from "../ui/dom";
import { uiRoot } from "../ui/root";
import { definePlugin } from "./types";
import { personalEditingEnabled } from "./personalLocalEdit";

const MANAGE_MESSAGES = 1n << 13n;
let enabledFor: string | undefined;
const listeners = new Set<() => void>();
export const moderationEnabled = () => !!enabledFor && enabledFor === myId();
function canManage(channelId?: string): boolean {
  const channel = channelId ? stores.channels?.getChannel?.(channelId) : null;
  return !!channel?.guild_id && stores.permissions?.can?.(MANAGE_MESSAGES,channel) === true;
}
export function mayEnableModeration(actor: string | undefined, manageMessages: boolean): boolean { return !!actor && manageMessages; }
export function setModeration(on: boolean): void {
  if (on && !mayEnableModeration(myId(),canManage(currentChannelId()))) throw new Error("Open a server channel where you have Manage Messages to enable moderator controls. This toggle grants no Discord permissions.");
  enabledFor=on?myId():undefined; listeners.forEach(listener=>listener());
}
export interface MessagePolicy { actor?: string; author?: string; enabled: boolean; guild: boolean; manageMessages: boolean }
export function messageAllowed(action: "delete" | "edit" | "localEdit", policy: MessagePolicy): boolean {
  if (!policy.actor || !policy.author) return false;
  if (policy.actor === policy.author) return true;
  if (action === "edit") return false; // Discord never permits changing another author's text.
  if (action === "localEdit") return policy.enabled;
  return policy.enabled && policy.guild && policy.manageMessages;
}
function policyFor(message: any): MessagePolicy {
  const channel=stores.channels?.getChannel?.(message.channel_id);
  return {actor:myId(),author:message.author?.id,enabled:moderationEnabled(),guild:!!channel?.guild_id,manageMessages:canManage(message.channel_id)};
}
export const canEditLocally = (message: any) => personalEditingEnabled() && !!message?.author?.id && !!myId();
interface Audit { actorId: string; messageId: string; channelId: string; at: string; outcome: "requested" | "confirmed" | "rejected" }
async function auditEntry(entry: Audit): Promise<void> {
  if (storageSwitching()) throw new Error("Wait for the storage change to finish before moderating messages.");
  await accountDocument("moderation-audit",entry.actorId).update(raw => {
  let entries: Audit[]=[];
  try { const parsed=raw && raw.length<400_000?JSON.parse(raw):[]; if(!Array.isArray(parsed))throw new Error(); entries=parsed.filter(e=>e?.actorId===entry.actorId && typeof e.at==="string" && Date.parse(e.at)>=Date.now()-30*864e5); } catch { throw new Error("Saved audit data is unreadable. Moderator deletion was not started."); }
  const previous=entries.findIndex(e=>e.at===entry.at && e.messageId===entry.messageId && e.channelId===entry.channelId);
  if(previous>=0) entries[previous]=entry; else entries.push(entry);
  return JSON.stringify(entries.slice(-500));
  });
}
export interface DeleteDependencies { policy(): MessagePolicy; request(channel: string,id: string): Promise<{status:number}>; audit(entry: Audit): void | Promise<void>; report(entry: Audit): void; now(): string }
/** Checked immediately before the authenticated request; Discord enforces actual permissions. */
export async function deleteMessageAuthorized(message: any, deps: DeleteDependencies = {
  policy:()=>policyFor(message), request:async(channel,id)=>{
    const client=http(); if(typeof client?.del!=="function") throw new Error("Discord's delete action is not ready. Open the channel and retry.");
    return client.del({url:`/channels/${channel}/messages/${id}`,headers:{"X-Audit-Log-Reason":"XRay%20moderator%20controls"}});
  }, audit:auditEntry, now:()=>new Date().toISOString(), report:entry=>reportEvent({kind:"plugin",source:"messageModeration",text:"Moderator message deletion confirmed",detail:{actorId:entry.actorId,at:entry.at,messageId:entry.messageId,channelId:entry.channelId}}),
}): Promise<void> {
  const policy=deps.policy();
  if(!messageAllowed("delete",policy)) throw new Error("Moderator controls are off or Manage Messages is missing for this channel.");
  if(!/^\d{14,20}$/.test(message.id) || !/^\d{14,20}$/.test(message.channel_id)) throw new Error("This is not a server-backed Discord message.");
  const moderated=policy.actor!==policy.author;
  const entry: Audit={actorId:policy.actor!,messageId:message.id,channelId:message.channel_id,at:deps.now(),outcome:"requested"};
  if(moderated) await deps.audit(entry);
  const latestPolicy = deps.policy();
  if (latestPolicy.actor !== policy.actor || !messageAllowed("delete",latestPolicy)) {
    if (moderated) await deps.audit({...entry,outcome:"rejected"});
    throw new Error("The account or permissions changed while saving the audit. Deletion was not started.");
  }
  let response;
  try { response=await deps.request(message.channel_id,message.id); }
  catch(error) { if(moderated)await deps.audit({...entry,outcome:"rejected"}); throw error; }
  if(!response || response.status<200 || response.status>=300) {
    if(moderated)await deps.audit({...entry,outcome:"rejected"});
    throw new Error(`Discord rejected deletion${response?.status?` (${response.status})`:""}. No local permission override was applied.`);
  }
  if(moderated) {
    try { await deps.audit({...entry,outcome:"confirmed"}); }
    catch { throw new Error("Discord deleted the message, but the audit confirmation could not be saved. The request entry remains in the audit."); }
    deps.report({...entry,outcome:"confirmed"});
  }
}
export default definePlugin({
  id:"messageModeration", name:"Moderator message controls",category:"Chat",impact:"light",impactReason:"Checks permissions only on interaction",needsReload:false,enabledByDefault:true,
  description:"Global controls for real moderator deletion where Manage Messages allows it. Other people's text edits remain explicitly local. Starts off each launch.",
  start(ctx) {
    const indicator=h("button",{class:"moderation-indicator",attrs:{type:"button","aria-pressed":"false"},on:{click:()=>{try{setModeration(!moderationEnabled());}catch(error){showDialog({title:"Moderator controls",body:String((error as Error).message)});}}}});
    const update=()=>{const on=moderationEnabled();indicator.textContent=`Moderator controls · ${on?"On":"Off"}`;indicator.setAttribute("aria-pressed",String(on));indicator.title=on?"Global XRay controls enabled. Discord permissions still apply. Click to turn off.":"Global XRay controls off. Enable from a channel where you have Manage Messages.";};
    const mount=()=>uiRoot().append(indicator);
    listeners.add(update); update();
    if(document.documentElement) mount(); else document.addEventListener("DOMContentLoaded",mount,{once:true});
    ctx.onAction("LOGOUT",()=>setModeration(false));
    ctx.onAction("CONNECTION_OPEN",update);
    ctx.menu("message",(items,{message})=>{
      if(!message?.id || !message.channel_id) return;
      const allowed=messageAllowed("delete",policyFor(message));
      items.push(menu.group(menu.item({id:"xray-moderator-toggle",label:`Moderator controls: ${moderationEnabled()?"On":"Off"}`,action:()=>indicator.click()}),
        menu.item({id:"xray-delete-on-discord",label:"Delete message on Discord",color:"danger",disabled:!allowed,subtext:allowed?"Removes for everyone":"Requires ownership, or controls on and Manage Messages",action:()=>{
          void (async()=>{if(!await confirmAction("Delete message on Discord?","This removes the message for everyone. Discord checks your permission for this channel.","Delete message",true))return;await deleteMessageAuthorized(message);})().catch(error=>showDialog({title:"Message deletion",body:error instanceof Error?error.message:"Discord could not confirm this deletion."}));
        }}), message.author?.id!==myId()?menu.item({id:"xray-edit-permissions-note",label:"Other-author edits are local-only",disabled:true,subtext:"Discord does not allow moderators to rewrite another author's text"}):null));
    });
    ctx.command("Toggle moderator message controls","Global client switch; actual Discord permissions still apply",()=>indicator.click());
    ctx.command("View moderation audit","Actor, timestamp and server-confirmed outcome; no message bodies",()=>{
      const id=myId(); if(!id)return;
      void (async()=>{const doc=accountDocument("moderation-audit",id);await doc.load(); if(myId()===id)showDialog({title:`Moderation audit · ${serverDataEnabled(id)?"server":"device"} · 30 days / 500 entries`,code:doc.value??"[]"});})().catch(()=>showDialog({title:"Moderation audit unavailable",body:"The selected storage could not be read. Check your server connection and shell.json configuration."}));
    });
    ctx.onStop(()=>{document.removeEventListener("DOMContentLoaded",mount);setModeration(false);listeners.delete(update);indicator.remove();});
  },
});
