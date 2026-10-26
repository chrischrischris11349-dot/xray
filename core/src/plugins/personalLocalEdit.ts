import { myId } from "../discord";
import { personalBuild } from "../personalBuild";
import { confirmAction } from "../ui/dialog";
import { h } from "../ui/dom";
import { uiRoot } from "../ui/root";
import { definePlugin } from "./types";
import { pluginState,save } from "../settings";
let account:string|undefined;
const listeners=new Set<()=>void>();
export function onPersonalEditingChanged(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);}
const emit=()=>listeners.forEach(listener=>listener());
export const personalEditingEnabled=()=>personalBuild&&!!account&&account===myId();
function preferences():Record<string,boolean>{const data=pluginState("personalLocalEditControls").data??={};if(!data.accounts||typeof data.accounts!=="object"||Array.isArray(data.accounts))data.accounts={};return data.accounts as Record<string,boolean>;}
export default definePlugin({id:"personalLocalEditControls",name:"Personal local editing",description:"Your view only, across every conversation. Saved edits and this account's switch survive reloads. Right-click Reset Local Edit to remove an override; Discord and archives keep their originals.",category:"Chat",impact:"light",impactReason:"Only acts on edited messages",needsReload:false,enabledByDefault:true,
 start(ctx){if(!personalBuild)return;
  const button=h("button",{class:"btn ghost personal-edit-indicator",attrs:{"aria-label":"Personal local edits","aria-pressed":"false","data-xray-plugin-ui":""},text:"Local edits · Off",on:{click:async()=>{
   const owner=myId();if(!owner)return;
   if(account){delete preferences()[owner];account=undefined;save();}else if(await confirmAction("Enable personal local editing?","For your consented testing, only this client's view changes. Saved edits and this account's switch survive reloads and restarts until you reset them. Turning the switch off temporarily shows original messages. Discord and archived history keep the originals.","Enable local edits")){if(myId()!==owner)return;account=owner;preferences()[owner]=true;save();}
   button.textContent=`Local edits · ${personalEditingEnabled()?"On":"Off"}`;button.setAttribute("aria-pressed",String(personalEditingEnabled()));emit();
  }}});button.style.cssText="position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:40;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:28px;height:auto;padding:5px 12px;line-height:18px;white-space:nowrap;max-width:calc(100vw - 32px);margin:0;border-radius:8px";
  const mount=()=>uiRoot().append(button);if(document.documentElement)mount();else document.addEventListener("DOMContentLoaded",mount,{once:true});
  const refresh=()=>{const previous=account,owner=myId();account=owner&&preferences()[owner]===true?owner:undefined;button.textContent=`Local edits · ${personalEditingEnabled()?"On":"Off"}`;button.setAttribute("aria-pressed",String(personalEditingEnabled()));if(previous!==account)emit();};
  const reset=()=>{account=undefined;button.textContent="Local edits · Off";button.setAttribute("aria-pressed","false");emit();};
  ctx.onAction("LOGOUT",reset);ctx.onAction("CONNECTION_OPEN",refresh);refresh();
  ctx.onStop(()=>{reset();button.remove();document.removeEventListener("DOMContentLoaded",mount);});
 }
});
