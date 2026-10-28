import { dispatch } from "../api/flux";
import { menu } from "../api/menus";
import { promptText, showDialog } from "../ui/dialog";
import { definePlugin } from "./types";
import { canEditLocally } from "./messageModeration";
import { onPersonalEditingChanged } from "./personalLocalEdit";
import { createElement } from "../api/react";
import { sessionMessageView,SessionMessageView } from "../ui/localMessageView";
import { stores,myId } from "../discord";
import { accountDocument,onStorageModeChanged } from "../shell/serverStorage";
import { paintLocalEdit } from "../ui/localEditDom";

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
let requestReset:((message:any)=>Promise<void>)|undefined;
export const localEditAvailable=(message:any)=>!!requestEdit&&canEditLocally(message);
export async function editMessageLocally(message:any):Promise<void>{if(!localEditAvailable(message))throw Error("Enable Personal local editing and Local Message Edit first");await requestEdit!(message);}
export function hideMessageLocally(message:any):void{if(!requestHide||!localEditAvailable(message))throw Error("Enable Personal local editing first");requestHide(message);}
export const hasLocalEdit=(message:any)=>sessionMessageView.get(message)?.content!==undefined;
export async function resetMessageLocally(message:any):Promise<void>{if(!requestReset||!localEditAvailable(message))throw Error("Enable Personal local editing first");await requestReset(message);}
export default definePlugin({
  id: "localMessageEdit", name: "Local Message Edit",
  description: "Edit messages only in your own view. Saved per account until you right-click Reset Local Edit, including after reloads and restarts. Session-only deletion stays temporary.",
  category: "Chat", impact: "light", impactReason: "Looks up edited message IDs during rendering; writes only on explicit edit or reset", needsReload: false, enabledByDefault: true,
  start(ctx) {
    const touched=new Map<string,any>(),systemStyles=new Map<string,{className:string;fontFamily:string;color:string}>(),rowObservers=new Map<Element,MutationObserver>();
    let active=true,loadedOwner:string|undefined,generation=0,loadFailureShown=false,loading:{owner:string;promise:Promise<void>}|undefined;
    const key=(message:any)=>`${message.channel_id}:${message.id}`;
    // Some Discord builds dispatch synchronously and return void. Always expose a Promise.
    const update=async(message:any)=>{await dispatch({type:"MESSAGE_UPDATE",message:{id:message.id,channel_id:message.channel_id,content:stores.messages?.getMessage?.(message.channel_id,message.id)?.content??message.content??""},xrayLocalEdit:true});};
    const rowFor=(message:any)=>document.getElementById(`chat-messages-${message.channel_id}-${message.id}`)??document.getElementById(`message-content-${message.id}`)?.closest<HTMLElement>('li,[data-list-item-id^="chat-messages"],[role="listitem"]');
    const nativeFor=(message:any)=>rowFor(message)?.querySelector<HTMLElement>('[id^="message-content-"], [class*="systemMessage_"] [class*="content_"]');
    const styleFor=(message:any)=>{const native=nativeFor(message),computed=native?getComputedStyle(native):undefined;return {className:native?.className??"",fontFamily:computed?.fontFamily??"inherit",color:computed?.color??'var(--text-normal, var(--text-primary))'};};
    const mark=(row:Element)=>{
      const match=/^chat-messages-(\d+)-(\d+)$/.exec(row.id),contentId=row.querySelector('[id^="message-content-"]')?.id?.replace('message-content-','');
      const view=match?sessionMessageView.get({channel_id:match[1],id:match[2]}):contentId?sessionMessageView.getById(contentId):undefined;
      row.toggleAttribute('data-xray-session-hidden',!!view?.hidden);paintLocalEdit(row,view?.content);
      if(view?.content!==undefined&&!rowObservers.has(row)&&typeof MutationObserver!=='undefined'){
        const observer=new MutationObserver(()=>{if(!row.isConnected){observer.disconnect();rowObservers.delete(row);return;}mark(row);});
        observer.observe(row,{childList:true,subtree:true});rowObservers.set(row,observer);
      }else if(view?.content===undefined){rowObservers.get(row)?.disconnect();rowObservers.delete(row);}
    };
    const redraw=()=>{for(const message of touched.values()){const row=rowFor(message);if(!row)continue;mark(row);if(stores.messages?.getMessage?.(message.channel_id,message.id))void update(message).catch(error=>ctx.log("Could not redraw local view",error));}};
    const applySaved=(raw:string|null)=>{
      sessionMessageView.load(raw,true);
      for(const message of sessionMessageView.entries()){touched.set(key(message),message);if(message.system&&!systemStyles.has(key(message))&&rowFor(message))systemStyles.set(key(message),styleFor(message));}
      redraw();
    };
    const releaseView=()=>{generation++;loadedOwner=undefined;loading=undefined;for(const observer of rowObservers.values())observer.disconnect();rowObservers.clear();sessionMessageView.clear();systemStyles.clear();document.querySelectorAll('[data-xray-session-hidden]').forEach(node=>node.removeAttribute("data-xray-session-hidden"));redraw();touched.clear();};
    async function loadCurrent():Promise<void>{
      const owner=myId();if(!owner||!active||!canEditLocally({author:{id:owner}}))return;
      if(loadedOwner===owner)return;if(loading?.owner===owner)return loading.promise;
      const serial=++generation,document=accountDocument("local-message-edits",owner);
      const promise=(async()=>{await document.load();if(!active||serial!==generation||myId()!==owner||!canEditLocally({author:{id:owner}}))return;applySaved(document.value);loadedOwner=owner;loadFailureShown=false;})();
      loading={owner,promise};try{await promise;}finally{if(loading?.promise===promise)loading=undefined;}
    }
    async function persist(message:any,content?:string,system=false):Promise<void>{
      const owner=myId();await loadCurrent();if(!owner||myId()!==owner||loadedOwner!==owner||!active||!canEditLocally(message))throw Error("The account or local editing mode changed. Reopen the message.");
      const document=accountDocument("local-message-edits",owner);
      await document.update(raw=>{const saved=new SessionMessageView();saved.load(raw);if(content===undefined)saved.reset(message);else saved.edit(message,content,system);return saved.serialize();});
      if(!active||myId()!==owner||!canEditLocally(message))return;
      applySaved(document.value);if(content===undefined){sessionMessageView.reset(message);systemStyles.delete(key(message));const row=rowFor(message);if(row)mark(row);}
      touched.set(key(message),message);const row=rowFor(message);if(row)paintLocalEdit(row,sessionMessageView.get(message)?.content);await update(message);
    }
    const fail=(error:unknown)=>showDialog({title:"Saved local edits",allowPresentation:true,body:String((error as Error)?.message??error)});
    const restore=()=>{if(canEditLocally({author:{id:"local"}}))void loadCurrent().catch(error=>{if(!active||loadFailureShown)return;loadFailureShown=true;showDialog({title:"Saved local edits unavailable",body:`Original messages are shown because saved edits could not load. Your saved overrides were not erased. Use Retry saved local edits in XRay's command search. ${String((error as Error)?.message??error)}`});});};
    ctx.css("[data-xray-session-hidden],[data-xray-edit-original]{display:none!important}");ctx.watch('li[id^="chat-messages-"]',mark);
    ctx.watch('[id^="message-content-"], [class*="systemMessage_"] [class*="content_"]',node=>{const row=node.closest('li,[data-list-item-id^="chat-messages"]');if(row){const view=sessionMessageView.getById(node.id.replace('message-content-',''));if(view){row.toggleAttribute('data-xray-session-hidden',!!view.hidden);paintLocalEdit(row,view.content);}else mark(row);}});
    requestHide=message=>{sessionMessageView.hide(message);touched.set(key(message),message);const row=rowFor(message);if(row)mark(row);void update(message).catch(error=>ctx.log("Could not hide local message",error));};
    requestReset=message=>persist(message);
    requestEdit=async message=>{
      const owner=myId();await loadCurrent();if(!owner||myId()!==owner||!canEditLocally(message))return;
      const canonical=stores.messages?.getMessage?.(message.channel_id,message.id),native=nativeFor(message),fontFamily=native?getComputedStyle(native).fontFamily:undefined;
      const clone=native?.cloneNode(true) as HTMLElement|undefined;clone?.querySelectorAll("time,button,[class*='timestamp_']").forEach(node=>node.remove());
      const system=!!message.type&&![19,20,23].includes(message.type);
      const original=system?clone?.textContent:(canonical?.content||message.content||clone?.textContent);
      const content=await promptText({title:"Edit message locally · visible only to you",value:sessionMessageView.get(message)?.content??original??"",confirm:"Save local edit",multiline:true,fontFamily,allowPresentation:true});
      if(content===null||!active||myId()!==owner||!canEditLocally(message))return;
      if(content.length>4000)throw Error("Local edits can contain up to 4,000 characters");
      await persist(message,content,system);
    };
    const stopToggle=onPersonalEditingChanged(()=>{releaseView();restore();}),stopStorage=onStorageModeChanged(()=>{releaseView();restore();});
    ctx.onElement("div",props=>{
      const match=/^message-content-(\d+)$/.exec(props?.id??"");if(!match)return;const view=sessionMessageView.getById(match[1]);
      if(view?.content!==undefined&&!view.system)return {...props,children:view.content,"data-xray-local-edit":true,title:"Local edit · visible only to you"};
    });
    ctx.onElement("li",props=>{
      const match=/^chat-messages-(\d+)-(\d+)$/.exec(props?.id??"");if(!match)return;
      const message={channel_id:match[1],id:match[2]},view=sessionMessageView.get(message);if(!view?.system||view.content===undefined)return;
      const style=systemStyles.get(key(message))??styleFor(message);
      return {...props,children:createElement("div",{className:style.className,style:{fontFamily:style.fontFamily,color:style.color,WebkitTextFillColor:style.color,whiteSpace:"pre-wrap",padding:"4px 0"},title:"Local system-message edit · visible only to you"},view.content)};
    });
    ctx.menu("message",(items,{message})=>{
      if(!message?.id||!message.channel_id)return;
      items.push(menu.group(menu.item({id:"edit-locally",label:"Edit Locally",disabled:!canEditLocally(message),subtext:"Saved in your personal view until reset; Discord and archives stay original.",action:()=>void editMessageLocally(message).catch(fail)}),
        menu.item({id:"hide-local-message",label:"Delete from this session",disabled:!canEditLocally(message),subtext:"Only your view; no Discord deletion",action:()=>hideMessageLocally(message)}),
        hasLocalEdit(message)?menu.item({id:"reset-local-edit",label:"Reset Local Edit",action:()=>void resetMessageLocally(message).catch(fail)}):null));
    });
    ctx.command("Restore session messages","Undo temporary session deletions; keep saved local edits",()=>{const saved=sessionMessageView.serialize();sessionMessageView.load(saved);document.querySelectorAll('[data-xray-session-hidden]').forEach(node=>node.removeAttribute("data-xray-session-hidden"));redraw();});
    ctx.command("Retry saved local edits","Reload your account's saved edits after a storage failure",()=>void loadCurrent().catch(fail));
    ctx.onAction('LOAD_MESSAGES_SUCCESS',()=>{restore();redraw();});
    ctx.onAction("LOGOUT",releaseView);ctx.onAction("CONNECTION_OPEN",()=>{if(loadedOwner&&loadedOwner!==myId())releaseView();restore();});restore();
    ctx.onStop(()=>{active=false;requestEdit=requestHide=undefined;requestReset=undefined;stopToggle();stopStorage();releaseView();});
  },
});
