import { intercept,onAction } from "../api/flux";
import { addMenuItems,menu } from "../api/menus";
import { myId,stores,http } from "../discord";
import { accountDocument,onStorageModeChanged,storageSwitching } from "../shell/serverStorage";
import { ServerMonitors } from "./model";
import { h } from "../ui/dom";
import { showSheet,closeDialog } from "../ui/dialog";
import { formatDateTime } from "../time";
let account:string|undefined,model:ServerMonitors|undefined,loading:Promise<void>|undefined,error="",timer:number|undefined,generation=0;
const listeners=new Set<()=>void>();const notify=()=>listeners.forEach(fn=>fn());
async function load(){
  const id=myId();if(!id)throw Error("Sign in first");if(account===id&&model)return;if(account===id&&loading)return loading;
  const token=++generation;account=id;model=undefined;const document=accountDocument("server-monitors",id);
  const pending=document.load().then(()=>{if(token===generation && account===id){model=new ServerMonitors(document.value);document.removeMigratedLocal();error="";notify();}}).finally(()=>{if(token===generation)loading=undefined;});
  loading=pending;return pending;
}
async function save(){clearTimeout(timer);timer=undefined;if(!account||!model)return;try{await accountDocument("server-monitors",account).write(model.serialize());error="";}catch(e){error=String((e as Error)?.message??e)+" · changes remain in memory; keep XRay open and retry.";throw e;}finally{notify();}}
export function startMonitoring():void {
  addMenuItems("guild-context",(items,{guild})=>{if(guild?.id)items.push(menu.item({id:"xray-monitor-server",label:"Add to monitor list",action:()=>openMonitorList(guild)}));});
  intercept(action=>{if(storageSwitching() || !model || account!==myId())return;const changed=model.observe(action,(c,id)=>stores.messages?.getMessage?.(c,id),c=>stores.channels?.getChannel?.(c)?.guild_id);if(changed&&timer===undefined)timer=window.setTimeout(()=>void save().catch(()=>{}),500);});
  const reset=()=>{void save().catch(()=>{});generation++;account=undefined;model=undefined;loading=undefined;notify();};
  onAction("LOGOUT",reset);onAction("CONNECTION_OPEN",()=>{if(account && account!==myId())reset();void load().catch(e=>{error=String(e);notify();});});onStorageModeChanged(()=>{reset();void load().catch(e=>{error=String(e);notify();});});window.addEventListener("pagehide",()=>void save().catch(()=>{}));
}
export function openMonitorList(guild?:any):void {const view=monitorPanel(guild);showSheet(h("section",{class:"profile intel-workspace"},h("header",{class:"intel-workspace-head"},h("strong",{text:"Server monitor list"}),h("button",{class:"btn ghost",text:"Close",on:{click:closeDialog}})),h("div",{class:"intel-workspace-body"},view.element)),view.close);}
export function monitorPanel(guild?:any):{element:HTMLElement;close():void} {
  const element=h("section"),list=h("div"),status=h("p",{class:"pf-note",attrs:{role:"status"}});let active=true;
  const drafts=new Map<string,{tester:string;consent:boolean}>();
  const run=(action:()=>Promise<void>)=>void action().catch(e=>{error=String((e as Error)?.message??e);notify();});
  const draw=()=>{if(!active)return;status.textContent=error || (!model?"Loading monitor list…":"Events start after enabling a tester. Seven-day retention; 100 events per server.");const focus=(element.getRootNode() as ShadowRoot).activeElement;if(focus && list.contains(focus) && focus.matches("input,select"))return;list.replaceChildren(...(model?.servers??[]).map(server=>{
    const draft=drafts.get(server.guildId)??{tester:server.testerId,consent:false};drafts.set(server.guildId,draft);
    const tester=h("input",{class:"dialog-input",attrs:{"aria-label":`Tester for ${server.name}`,placeholder:"Tester Discord ID",value:draft.tester,maxlength:"20"}});
    const consent=h("input",{attrs:{type:"checkbox"}});
    consent.checked=draft.consent;tester.oninput=()=>draft.tester=tester.value;consent.onchange=()=>draft.consent=consent.checked;
    const loaded=stores.members?.getMemberIds?.(server.guildId);const members:string[]=Array.isArray(loaded)?loaded:loaded instanceof Set?[...loaded]:[];
    const picker=h("select",{class:"dialog-input",attrs:{"aria-label":`Choose tester in ${server.name}`}},h("option",{attrs:{value:""},text:"Choose a loaded member, or enter an ID below"}),...members.slice(0,500).map(id=>{const user=stores.users?.getUser?.(id);return h("option",{attrs:{value:id},text:user?.globalName??user?.username??id});}));
    picker.onchange=()=>{if(picker.value)tester.value=draft.tester=picker.value;};
    const saveButton=h("button",{class:"btn ghost",text:"Save and start",on:{click:()=>run(async()=>{
      const id=tester.value.trim();if(!consent.checked)throw Error("Confirm the tester agreed before monitoring");if(!/^\d{14,20}$/.test(id))throw Error("Enter a valid tester ID");if(!stores.guilds?.getGuild?.(server.guildId))throw Error("This server is not available to your account");
      if(!stores.members?.getMember?.(server.guildId,id)){const response=await http()?.get?.({url:`/guilds/${server.guildId}/members/${id}`});if(!response?.body?.user || response.body.user.id!==id)throw Error("Tester membership could not be verified");}
      if(storageSwitching()||account!==myId())throw Error("Account or storage changed; reopen this panel");model!.configure(server.guildId,id,true);drafts.delete(server.guildId);await save();draw();
    })}});
    return h("details",{class:"intel-group",attrs:{open:""}},h("summary",{class:"intel-group-heading",text:`${server.name} · ${server.enabled?"Observing":"Off"}`}),h("div",{class:"pf-block"},picker,tester,h("label",{},consent," Tester has agreed to this observation"),h("div",{class:"pf-journal-actions"},saveButton,h("button",{class:"btn ghost",text:"Stop monitoring",on:{click:()=>run(async()=>{server.enabled=false;await save();draw();})}}),h("button",{class:"btn ghost",text:"Remove server",on:{click:()=>run(async()=>{model!.servers=model!.servers.filter(s=>s!==server);await save();draw();})}})),h("ol",{class:"pf-timeline"},...server.events.slice().reverse().map(event=>h("li",{},h("time",{text:formatDateTime(new Date(event.at))}),h("span",{text:`${event.kind} · ${event.detail}`}))))));
  }));};
  element.append(h("h2",{text:"Server monitors"}),h("p",{class:"pf-note",text:"Right-click a server → Add to monitor list. Select a consented tester. Logs only delivered messages/membership metadata and shared Discord presence/app activity; it does not track private activity or external platforms independently. Message counts cover observed events, not lifetime totals."}),status,h("button",{class:"btn ghost",text:"Retry saving",on:{click:()=>run(save)}}),list);
  listeners.add(draw);draw();run(async()=>{await load();if(!active || account!==myId() || !model)return;if(guild){model!.add(guild.id,guild.name??"Server");await save();}draw();});return{element,close(){active=false;listeners.delete(draw);}};
}
