import { exportControls, resultReport, reportSummary } from "./reportExport";
import { rememberReport } from "./reportCache";
import { oathnetSearch } from "./oathnetSearch";
import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { linkedText } from "./reportText";
import { recordCard } from "./importedReport";
import { copyText } from "./dialog";

export type LiveProvider="IntelX"|"Snusbase"|"Oathnet";
const modes:Record<LiveProvider,[string,string][]>={
  IntelX:[["search","Search"],["account","Account, quota and available buckets"]],
  Snusbase:[["search","Database search"],["count","Count matches"],["combo","Combo lookup"],["hash","Hash lookup"],["ip","IP WHOIS"],["domain","Domain WHOIS"],["stats","Database statistics"]],
  Oathnet:[["profile","Discord profile"],["history","Discord username history"],["search","Breach search"],["ip","IP information"],["steam","Steam profile"],["xbox","Xbox profile"],["roblox","Roblox profile"]],
};
const kinds:Record<LiveProvider,[string,string][]>= {
  IntelX:[["email","Email"],["domain","Domain"],["url","URL"],["ip","IP address"],["cidr","CIDR"],["phone","Phone (+country code)"],["bitcoin","Bitcoin address"],["mac","MAC address"],["uuid","UUID"],["ipfs","IPFS hash"],["simhash","Simhash"]],
  Snusbase:[["email","Email"],["username","Username"],["lastip","IP address"],["name","Name"],["_domain","Domain"],["hash","Hash"],["password","Password"]],
  Oathnet:[["discord","Discord ID / query"]],
};
export function liveIntel(provider:LiveProvider):{element:HTMLElement;close():void} {
  let active=true,busy=false,searchId="",allRecords:any[]=[],payload:any;
  let closePaged:(()=>void)|undefined;
  const element=h("section",{class:"intel-live"});
  const mode=h("select",{class:"dialog-input",attrs:{"aria-label":`${provider} operation`}},...modes[provider].map(([id,label])=>h("option",{attrs:{value:id},text:label})));
  const kind=h("select",{class:"dialog-input",attrs:{"aria-label":`${provider} search type`}},...kinds[provider].map(([id,label])=>h("option",{attrs:{value:id},text:label})));
  const query=h("input",{class:"dialog-input",attrs:{"aria-label":`${provider} query`,placeholder:provider==="Oathnet"?"Discord ID or selected lookup query":"Enter the selected search term",maxlength:"500",autocomplete:"off",spellcheck:"false"}});
  const subject=h("input",{class:"dialog-input",attrs:{"aria-label":"Attach results to Discord subject ID (optional)",placeholder:"Optional: Discord subject ID to attach these results to",maxlength:"20",inputmode:"numeric"}});
  const status=h("p",{class:"pf-note",attrs:{role:"status"}}),output=h("div"),controls=h("div",{class:"pf-journal-actions"});
  const search=h("button",{class:"btn",attrs:{type:"button"},text:"Search"});
  const more=h("button",{class:"btn ghost",attrs:{type:"button"},text:"Poll / load more",on:{click:()=>void run("result",searchId)}});more.hidden=true;
  const cancel=h("button",{class:"btn ghost",attrs:{type:"button"},text:"Stop search",on:{click:()=>void run("terminate",searchId)}});cancel.hidden=true;
  function display(data:any):void {
    output.replaceChildren();payload=data;
    const raw=data?.data??data;
    let records:any[]=Array.isArray(raw)?raw:Array.isArray(raw?.items)?raw.items:Array.isArray(raw?.records)?raw.records:raw?.results && typeof raw.results==="object"?Object.entries(raw.results).flatMap(([source,rows])=>(Array.isArray(rows)?rows:[rows]).map(row=>({source,...(row && typeof row==="object"?row:{value:row})}))):[raw];
    if(provider==="IntelX" && Array.isArray(data.records)) {
      for(const row of data.records)if(!allRecords.some(old=>old.systemid && old.systemid===row.systemid))allRecords.push(row);
      allRecords=allRecords.slice(0,1000);records=allRecords;
    }
    const filter=h("input",{class:"dialog-input",attrs:{"aria-label":"Filter returned records",placeholder:"Filter returned records"}}),list=h("div");
    let visible=100;const searchable=records.map(row=>JSON.stringify(row).toLowerCase());
    const draw=()=>{const term=filter.value.toLowerCase();const matching=records.filter((_row,i)=>searchable[i].includes(term));list.replaceChildren(h("p",{class:"pf-note",text:`${matching.length} returned records · first ${Math.min(visible,matching.length)} shown. Complete response below.`}),...matching.slice(0,visible).map((row,index)=>recordCard({source:row?.source??provider,title:row?.username??row?.name??`Record ${index+1}`,fields:Object.entries(row??{}).map(([key,value])=>({key,label:key,value}))})));};
    filter.addEventListener("input",()=>{visible=100;draw();});draw();
    const next=h("button",{class:"btn ghost",text:"Show next 100 records",on:{click:()=>{visible+=100;draw();next.disabled=visible>=records.length;}}});
    const attachedSubject=subject.value.trim()||query.value.trim();
    if(/^\d{14,20}$/.test(attachedSubject))rememberReport(attachedSubject,{metadata:{live:true,query:attachedSubject,generatedAt:new Date().toISOString(),source:provider,summary:data?.summary??data?.metadata?.summary??data?.data?.summary},totals:data?.totals??data?.data?.totals,response:data,records:records.map(row=>({source:row?.source??provider,fields:Object.entries(row??{}).map(([key,value])=>({key,label:key,value}))}))});
    const report=resultReport(`${provider} results`,records,payload);
    output.append(reportSummary(report),exportControls(()=>report),filter,list,next,h("button",{class:"btn ghost",attrs:{type:"button"},text:"Copy returned JSON",on:{click:()=>copyText(JSON.stringify(payload,null,2))}}),h("details",{class:"pf-report-details"},h("summary",{text:"Complete provider response"}),h("pre",{class:"pf-report-data"},linkedText(data))));
  }
  async function run(operation=mode.value,term=query.value.trim()):Promise<void> {
    if(busy)return;busy=true;mode.disabled=kind.disabled=query.disabled=search.disabled=more.disabled=cancel.disabled=true;status.textContent="Contacting provider…";
    try {
      const data:any=await invoke("intel_request",{provider:provider.toLowerCase(),operation,query:term,kind:kind.value});
      if(!active)return;
      if(provider==="IntelX" && operation==="search") {searchId=data.id??"";allRecords=[];if(!searchId)throw Error("IntelX did not return a search ID.");status.textContent="Search started. Load results to see the next page.";more.hidden=cancel.hidden=false;await renderFirstPage();}
      else if(provider==="Oathnet" && operation==="search"){
        closePaged?.();
        const view=oathnetSearch(term,async(cursor)=>cursor?invoke("intel_request",{provider:"oathnet",operation:"search",query:term,kind:"discord",cursor}):data,report=>{const id=subject.value.trim()||term;if(/^\d{14,20}$/.test(id))rememberReport(id,{...report,metadata:{...report.metadata,query:id}});});
        output.replaceChildren(view.element);closePaged=view.close;await view.load();status.textContent="Oathnet search loaded below; use Next search page for remaining results.";
      }
      else if(operation==="terminate"){more.hidden=cancel.hidden=true;status.textContent="Search stopped.";}
      else {display(data);if(provider==="IntelX" && operation==="result"){resultStatus(data);}else status.textContent="Lookup complete. Results are provider observations; availability depends on your plan.";}
    }catch(error){if(active)status.textContent=String((error as Error)?.message??error);}
    finally{busy=false;if(active)mode.disabled=kind.disabled=query.disabled=search.disabled=more.disabled=cancel.disabled=false;}
  }
  function resultStatus(data:any):void {if(data.status===2 || data.status===4){more.hidden=cancel.hidden=true;throw Error("IntelX search expired or failed. Start a new search.");}more.hidden=cancel.hidden=data.status===1;status.textContent=data.status===3?"Search running; no new results yet. Poll again shortly.":data.status===1?"Search complete.":"Results loaded. More may be available.";}
  async function renderFirstPage(){const data=await invoke("intel_request",{provider:"intelx",operation:"result",query:searchId,kind:kind.value});if(active){display(data);resultStatus(data);}}
  function configureForm():void {
    let available=kinds[provider];
    if(provider==="Snusbase"){
      const allowed:Record<string,string[]>={combo:["username","password"],hash:["hash","password"],ip:["lastip"],domain:["_domain"]};
      if(allowed[mode.value])available=available.filter(([id])=>allowed[mode.value].includes(id));
    }
    const previous=kind.value;kind.replaceChildren(...available.map(([id,label])=>h("option",{attrs:{value:id},text:label})));if(available.some(([id])=>id===previous))kind.value=previous;
    const noQuery=["account","stats"].includes(mode.value);kind.hidden=noQuery || provider==="Oathnet";query.hidden=noQuery;
    query.placeholder=provider==="Oathnet"?({profile:"Discord ID",history:"Discord ID",steam:"Steam ID",xbox:"Xbox XUID",roblox:"Roblox username",ip:"IP address",search:"Breach search query"}[mode.value]??"Lookup query"):"Enter the selected search term";
  }
  mode.onchange=()=>{closePaged?.();closePaged=undefined;configureForm();output.replaceChildren();status.textContent="";};configureForm();
  search.onclick=()=>void run();query.addEventListener("keydown",event=>{if(event.key==="Enter")void run();});
  controls.append(search,more,cancel,h("button",{class:"btn ghost",attrs:{type:"button"},text:"Provider keys",on:{click:()=>void invoke("open_provider_settings").catch(e=>status.textContent=String(e))}}));
  element.append(h("h2",{text:`${provider} live lookup`}),h("p",{class:"pf-note",text:provider==="IntelX"?"IntelX accepts supported selectors, not raw Discord IDs or usernames. Use Oathnet for Discord IDs. Searches use your API credits.":provider==="Snusbase"?"Choose a supported field. Snusbase has no dedicated Discord-ID search type; use Oathnet for Discord IDs.":"Discord profile and username history accept Discord IDs. Other lookup modes use their respective IDs or search terms."}),mode,kind,query,subject,controls,status,output);
  return{element,close(){active=false;closePaged?.();}};
}
