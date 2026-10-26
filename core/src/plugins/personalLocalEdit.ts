import { myId } from "../discord";
import { personalBuild } from "../personalBuild";
import { confirmAction } from "../ui/dialog";
import { h } from "../ui/dom";
import { uiRoot } from "../ui/root";
import { definePlugin } from "./types";
let account:string|undefined;
const listeners=new Set<()=>void>();
export function onPersonalEditingChanged(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);}
const emit=()=>listeners.forEach(listener=>listener());
export const personalEditingEnabled=()=>personalBuild&&!!account&&account===myId();
export default definePlugin({id:"personalLocalEditControls",name:"Personal local editing",description:"Your view only, across every conversation. Explicitly local edits; no Discord messages or server history are rewritten. Starts off each launch.",category:"Chat",impact:"light",impactReason:"Only acts on edited messages",needsReload:false,enabledByDefault:true,
 start(ctx){if(!personalBuild)return;
  const button=h("button",{class:"btn ghost",attrs:{"aria-label":"Personal local edits","aria-pressed":"false"},text:"Local edits · Off",on:{click:async()=>{
   if(account){account=undefined;}else if(await confirmAction("Enable local editing for this session?","For your consented testing, only text rendered on this client changes. Other users and server records keep the original messages. Edits are temporary and reset when the plugin stops.","Enable local edits")){account=myId();}
   button.textContent=`Local edits · ${personalEditingEnabled()?"On":"Off"}`;button.setAttribute("aria-pressed",String(personalEditingEnabled()));emit();
  }}});button.style.cssText="position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:40;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:28px;height:auto;padding:5px 12px;line-height:18px;white-space:nowrap;max-width:calc(100vw - 32px);margin:0;border-radius:8px";
  const mount=()=>uiRoot().append(button);if(document.documentElement)mount();else document.addEventListener("DOMContentLoaded",mount,{once:true});
  const reset=()=>{account=undefined;button.textContent="Local edits · Off";button.setAttribute("aria-pressed","false");emit();};
  ctx.onAction("LOGOUT",reset);ctx.onAction("CONNECTION_OPEN",()=>{if(account!==myId())reset();});
  ctx.onStop(()=>{reset();button.remove();document.removeEventListener("DOMContentLoaded",mount);});
 }
});
