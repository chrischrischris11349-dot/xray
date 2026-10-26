import { dispatch } from "../api/flux";
import { menu } from "../api/menus";
import { promptText, showDialog } from "../ui/dialog";
import { definePlugin } from "./types";
import { canEditLocally } from "./messageModeration";
import { onPersonalEditingChanged } from "./personalLocalEdit";
import { createElement } from "../api/react";
import { sessionMessageView } from "../ui/localMessageView";
import { stores } from "../discord";

export class LocalMessageEdits {
  private edits = new Map<string, { id: string; channel_id: string; original: string; content: string }>();
  private key(message: any): string { return `${message.channel_id}:${message.id}`; }
  get(message: any) { return this.edits.get(this.key(message)); }
  save(message: any, content: string): void {
    this.edits.set(this.key(message), { id: message.id, channel_id: message.channel_id, original: this.get(message)?.original ?? message.content ?? "", content });
  }
  apply(message: any): any {
    if (!message) return message;
    const edit = this.get(message);
    if (!edit) return message;
    if (typeof message.content === "string") edit.original = message.content;
    return { ...message, content: edit.content };
  }
  reset(message: any) {
    const edit = this.get(message);
    this.edits.delete(this.key(message));
    return edit ? { id: edit.id, channel_id: edit.channel_id, content: edit.original } : undefined;
  }
  clear() { return [...this.edits.values()].map(edit => this.reset(edit)!); }
}

let requestEdit:((message:any)=>Promise<void>)|undefined;
let requestHide:((message:any)=>void)|undefined;
export const localEditAvailable=(message:any)=>!!requestEdit&&canEditLocally(message);
export async function editMessageLocally(message:any):Promise<void>{if(!localEditAvailable(message))throw Error("Enable Personal local editing and Local Message Edit first");await requestEdit!(message);}
export function hideMessageLocally(message:any):void{if(!requestHide||!localEditAvailable(message))throw Error("Enable Personal local editing first");requestHide(message);}
export default definePlugin({
  id: "localMessageEdit",
  name: "Local Message Edit",
  description: "Edit any message’s text in your own view. Right-click a message to edit or reset it. Edits last for this session.",
  category: "Chat",
  impact: "light",
  impactReason: "Rewrites only locally edited messages when they load or update",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const touched=new Map<string,any>();
    const systemStyles=new Map<string,{className:string;fontFamily:string}>();
    let active = true;
    const key=(message:any)=>`${message.channel_id}:${message.id}`;
    // Only a render notification: keep the canonical content intact in Discord's store.
    const update = (message: any) => dispatch({ type: "MESSAGE_UPDATE", message:{id:message.id,channel_id:message.channel_id,content:stores.messages?.getMessage?.(message.channel_id,message.id)?.content??message.content??""}, xrayLocalEdit: true });
    const rowFor=(message:any)=>document.getElementById(`chat-messages-${message.channel_id}-${message.id}`);
    const mark=(row:Element)=>{const match=/^chat-messages-(\d+)-(\d+)$/.exec(row.id);if(!match)return;row.toggleAttribute("data-xray-session-hidden",!!sessionMessageView.get({channel_id:match[1],id:match[2]})?.hidden);};
    ctx.css("li[data-xray-session-hidden]{display:none!important}");
    ctx.watch('li[id^="chat-messages-"]',mark);
    requestHide=(message:any)=>{sessionMessageView.hide(message);touched.set(key(message),message);const row=rowFor(message);if(row)mark(row);void update(message);};
    requestEdit=async(message:any)=>{
      if(!canEditLocally(message))return;
      const row=rowFor(message),native=row?.querySelector<HTMLElement>('[id^="message-content-"], [class*="systemMessage_"] [class*="content_"]');
      const fontFamily=native?getComputedStyle(native).fontFamily:undefined;
      const clone=native?.cloneNode(true) as HTMLElement|undefined;clone?.querySelectorAll("time,button,[class*='timestamp_']").forEach(node=>node.remove());
      const content=await promptText({title:"Edit message locally · visible only to you",value:sessionMessageView.get(message)?.content??(message.type&&message.type!==19?clone?.textContent:message.content)??message.content??"",confirm:"Save local edit",multiline:true,fontFamily});
      if(content===null||!active||!canEditLocally(message))return;
      if(content.length>4000)throw Error("Local edits can contain up to 4,000 characters");
      sessionMessageView.edit(message,content);touched.set(key(message),message);
      if(message.type&&message.type!==19)systemStyles.set(key(message),{className:native?.className??"",fontFamily:fontFamily??"inherit"});
      await update(message);
    };
    const reset=()=>{sessionMessageView.clear();systemStyles.clear();document.querySelectorAll('[data-xray-session-hidden]').forEach(node=>node.removeAttribute("data-xray-session-hidden"));for(const original of touched.values())void update(original).catch(error=>ctx.log("Could not restore local view",error));touched.clear();};
    const stopToggle=onPersonalEditingChanged(()=>{if(!canEditLocally({author:{id:"local"}}))reset();});
    ctx.onElement("div",props=>{
      const match=/^message-content-(\d+)$/.exec(props?.id??"");if(!match)return;
      for(const message of touched.values())if(message.id===match[1]&&!systemStyles.has(key(message))){const content=sessionMessageView.get(message)?.content;if(content!==undefined)return {...props,children:content,"data-xray-local-edit":true,title:"Local edit · visible only to you"};}
    });
    ctx.onElement("li",props=>{
      const match=/^chat-messages-(\d+)-(\d+)$/.exec(props?.id??"");if(!match)return;
      const message={channel_id:match[1],id:match[2]},view=sessionMessageView.get(message),style=systemStyles.get(key(message));
      if(!style||view?.content===undefined)return;
      return {...props,children:createElement("div",{className:style.className,style:{fontFamily:style.fontFamily,whiteSpace:"pre-wrap",padding:"4px 0"},title:"Local system-message edit · visible only to you"},view.content)};
    });
    ctx.menu("message", (items, { message }) => {
      if (!message?.id || !message.channel_id) return;
      items.push(menu.group(menu.item({ id: "edit-locally", label: "Edit Locally", disabled: !canEditLocally(message), subtext: "Only your view changes. Enable Personal local editing for this session.", action: () => {
        if (!canEditLocally(message)) return;
        void editMessageLocally(message).catch(error => showDialog({ title: "Could not edit message", body: String((error as Error)?.message??error) }));
      } }),menu.item({id:"hide-local-message",label:"Delete from this session",disabled:!canEditLocally(message),subtext:"Only your view; no Discord deletion",action:()=>hideMessageLocally(message)}), sessionMessageView.get(message) ? menu.item({ id: "reset-local-edit", label: "Reset Local View", action: () => {
        sessionMessageView.reset(message);systemStyles.delete(key(message));const row=rowFor(message);if(row)mark(row);
        void update(message).catch(error => ctx.log("Could not reset local view", error));
      } }) : null));
    });
    ctx.command("Restore session messages","Clear local edits and session-only deletions",reset);
    ctx.onAction("LOGOUT",reset);
    ctx.onStop(() => {
      active = false;
      requestEdit=undefined;
      requestHide=undefined;
      stopToggle();
      reset();
    });
  },
});
