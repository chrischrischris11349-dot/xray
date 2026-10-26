import { invoke } from "../shell/bridge";
import { flushHistory } from "../history";
import { personalBuild } from "../personalBuild";
import { h } from "./dom";
import { uiRoot } from "./root";
import { icon } from "./icons";
import { closeDialog, showSheet } from "./dialog";
import { recordingNeedsAttention } from "../voice/recorder";
type UpdateState={phase:string;version?:string;downloaded?:number;total?:number};
let state:UpdateState={phase:"idle"},error="",busy=false,started=false,lastCheck=0,notice:HTMLButtonElement|undefined;
const cards:Array<WeakRef<HTMLElement>>=[];
export function updateLabel(value:UpdateState):string{
 switch(value.phase){case "checking":return "Checking for updates…";case "available":return `XRay ${value.version} is available`;case "downloading":return `Downloading signed update${value.total?` · ${Math.min(100,Math.round((value.downloaded??0)/value.total*100))}%`:"…"}`;case "ready":return `XRay ${value.version} is verified and ready`;case "current":return "You have the latest published version";case "installing":return "Applying update and restarting…";case "failed":return "Update did not complete. You can retry.";default:return "Checks the signed release channel. Your plugin choices are preserved.";}
}
function redraw(){for(let i=cards.length-1;i>=0;i--){const card=cards[i].deref();if(!card?.isConnected){cards.splice(i,1);continue;}draw(card);}if(notice){notice.hidden=!["available","ready"].includes(state.phase);notice.textContent=state.phase==="ready"?"Restart to update":"Update available";}}
async function run(action:"check"|"download"|"apply"){
 if(busy)return;busy=true;error="";state={...state,phase:action==="check"?"checking":action==="download"?"downloading":"installing"};redraw();let timer:ReturnType<typeof setInterval>|undefined,polling=true;
 try{if(action==="apply"){if(recordingNeedsAttention())throw Error("Finish and save your voice recording before restarting");await flushHistory();}if(action==="check")lastCheck=Date.now();
  if(action==="download")timer=setInterval(()=>void invoke("app_update",{action:"status"}).then(value=>{if(polling){state=value as UpdateState;redraw();}}).catch(()=>{}),750);
  state=await invoke("app_update",{action}) as UpdateState;
 }catch(failure){state={...state,phase:"failed"};error=String((failure as Error)?.message??failure);}finally{polling=false;clearInterval(timer);busy=false;redraw();}
}
function draw(card:HTMLElement){card.replaceChildren(h("div",{class:"card-title"},h("span",{trustedHtml:icon("download",17)}),` XRay updates · ${__XRAY_VERSION__}${personalBuild?" Personal":" Team"}`),h("div",{class:"card-sub",attrs:{role:"status"},text:error||updateLabel(state)}),
 h("div",{class:"dialog-actions"},h("button",{class:"btn ghost",attrs:busy||state.phase==="ready"?{disabled:""}:{},text:"Check for updates",on:{click:()=>void run("check")}}),
 ...(["available","failed"].includes(state.phase)&&state.version?[h("button",{class:"btn",attrs:busy?{disabled:""}:{},text:"Download update",on:{click:()=>void run("download")}})]:[]),
 ...(state.phase==="ready"?[h("button",{class:"btn",attrs:busy?{disabled:""}:{},text:"Restart and apply",on:{click:()=>void run("apply")}})]:[])),
 h("p",{class:"card-sub",text:"Applying an update restarts XRay and disconnects voice. Unsaved history must finish saving first. Media files already saved on the server remain there."}));}
export function appUpdatesControl():HTMLElement{const card=h("section",{class:"card",attrs:{"aria-label":"XRay updates"}});draw(card);for(let i=cards.length-1;i>=0;i--)if(!cards[i].deref()?.isConnected)cards.splice(i,1);cards.push(new WeakRef(card));return card;}
export function installAppUpdates(){if(started)return;started=true;notice=h("button",{class:"btn ghost",attrs:{title:"XRay signed updates"},on:{click:()=>showSheet(h("section",{class:"profile"},h("div",{class:"pf-body"},appUpdatesControl()),h("div",{class:"pf-foot"},h("button",{class:"btn",text:"Close",on:{click:closeDialog}}))))}});notice.hidden=true;notice.style.cssText="position:fixed;right:310px;top:6px;font-size:11px;z-index:80";uiRoot().append(notice);
 setTimeout(()=>void run("check"),15000);window.addEventListener("focus",()=>{if(Date.now()-lastCheck>6*3600_000&&!busy&&state.phase!=="ready")void run("check");});
}
