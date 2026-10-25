import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { oathnetPage } from "./oathnetSearch";
import { recordCard } from "./importedReport";
import { exportControls, reportSummary, resultReport } from "./reportExport";
import { linkedText } from "./reportText";

type Operation="session"|"search"|"stealer"|"victims"|"profile"|"history"|"steam"|"xbox"|"ip";
export type OathnetRequest=(operation:Operation,query:string,cursor?:string,searchId?:string)=>Promise<any>;
const liveRequest:OathnetRequest=(operation,query,cursor,searchId)=>invoke("intel_request",{provider:"oathnet",operation,query,kind:"discord",cursor:cursor??null,searchId:searchId??null});
type Source={operation:Operation;label:string;query:string;paged:boolean;rows:any[];responses:any[];cursor?:string;seen:Set<string>;initialized:boolean;total?:number;error?:string;blocked?:boolean};
const unwrap=(raw:any)=>{const body=raw?.body??raw;if(body?.success===false && !/^no results? found\.?$/i.test(body.message??""))throw Error(body.message??"Provider lookup failed");return body?.data??body;};

/** Extract actual returned values, never counts or inferred identities. No requests here. */
export function oathnetIndicators(values:unknown[]):{ips:string[];emails:string[];domains:string[];steam:string[];xbox:string[]} {
  const sets={ips:new Set<string>(),emails:new Set<string>(),domains:new Set<string>(),steam:new Set<string>(),xbox:new Set<string>()};let visited=0;
  const visit=(value:any,key="",depth=0)=>{
    if(value==null || depth>16 || ++visited>100_000)return;
    if(Array.isArray(value)){for(const item of value)visit(item,key,depth+1);return;}
    if(typeof value==="object"){
      if(typeof value.key==="string" && "value" in value)visit(value.value,value.key,depth+1);
      for(const [k,v]of Object.entries(value))if(k!=="value" || typeof value.key!=="string")visit(v,k,depth+1);return;
    }
    if(typeof value!=="string")return;
    if(/^[\[{]/.test(value.trim()))try{visit(JSON.parse(value),key,depth+1);}catch{/* Keep ordinary text as text. */}
    key=key.toLowerCase().replace(/[\s-]+/g,"_").split(".").at(-1)??"";
    for(const part of value.trim().split(/[\s,;]+/)){
      if(/^(?:ip|ips|lastip|last_ip|ip_address(?:es)?|ipv4|ipv6|victim_ip|client_ip)$/.test(key)){
        if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(part) && part.split(".").every(n=>+n<=255))sets.ips.add(part.split(".").map(Number).join("."));
        else if(part.includes(":") && /^[a-f\d:.]+$/i.test(part))try{sets.ips.add(new URL(`http://[${part}]/`).hostname.replace(/^\[|\]$/g,""));}catch{/* Invalid address. */}
      }
      if(/email/.test(key) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part))sets.emails.add(part);
      if(/^(?:domain|domains|email_domain|subdomain)$/.test(key) && /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i.test(part))sets.domains.add(part.toLowerCase());
      if(/^(?:steam|steam_id|steam_id64)$/.test(key)){
        if(/^\d{17}$/.test(part))sets.steam.add(part);
        else if(/^(?:steam:)?[a-f\d]{14,16}$/i.test(part))try{sets.steam.add(BigInt(`0x${part.replace(/^steam:/i,"")}`).toString());}catch{/* Not a Steam identifier. */}
      }
      if(/^(?:xbl|xbox|xuid|xbl_id|xbox_id)$/.test(key) && /^\d{12,20}$/.test(part))sets.xbox.add(part);
    }
  };
  visit(values);return Object.fromEntries(Object.entries(sets).map(([key,set])=>[key,[...set]])) as ReturnType<typeof oathnetIndicators>;
}

/** Multi-source live report. One user action loads source pages; no idle polling. */
export function oathnetFullReport(query:string,options:{request?:OathnetRequest;includeProfiles?:boolean;onReport?:(report:any)=>void}={}) {
  const request=options.request??liveRequest;
  const source=(operation:Operation,label:string,paged=true,q=query):Source=>({operation,label,query:q,paged,rows:[],responses:[],seen:new Set(),initialized:false});
  const primary=[source("search","Security breaches"),source("stealer","Stealer credentials"),source("victims","Victim profiles")];
  const sources=[...primary];
  if(options.includeProfiles!==false && /^\d{14,19}$/.test(query))sources.push(source("profile","Discord profile",false),source("history","Discord username history",false));
  let active=true,busy=false,stop=false,session:any,sessionId:string|undefined,page=0,filter="all",bytes=0;
  const element=h("section",{class:"pf-block wide",attrs:{"aria-label":"Live Oathnet full search report"}});
  const status=h("p",{class:"pf-note",attrs:{role:"status","aria-live":"polite"}}),summary=h("div"),coverage=h("div"),indicators=h("div"),results=h("div");
  const loadButton=h("button",{class:"btn",text:"Load all live Oathnet results",on:{click:()=>void load()}});
  const stopButton=h("button",{class:"btn ghost",text:"Stop loading",on:{click:()=>{stop=true;stopButton.disabled=true;status.textContent="Stopping after the current request; returned results stay available.";}}});stopButton.hidden=true;
  const select=h("select",{class:"dialog-input",attrs:{"aria-label":"Oathnet result category"},on:{change:()=>{filter=select.value;page=0;drawResults();}}});
  const pageLabel=h("span",{class:"pf-note"});
  const previous=h("button",{class:"btn ghost",text:"Previous records",on:{click:()=>{page--;drawResults();}}});
  const next=h("button",{class:"btn ghost",text:"Next records",on:{click:()=>{page++;drawResults();}}});
  const allRows=()=>sources.flatMap(s=>s.rows.map((row,i)=>({source:String(row?.dbname??row?.db_name??row?.source??s.label),title:String(row?.username??row?.name??row?.id??`${s.label} ${i+1}`),category:s.label,fields:Object.entries(row??{}).map(([key,value])=>({key,label:key,value}))})));
  function report(){
    const rows=allRows(),allKnown=sources.every(s=>s.total!==undefined),total=sources.reduce((n,s)=>n+(s.total??0),0);
    const raw={session,sources:sources.map(s=>({category:s.label,query:s.query,total:s.total??null,loaded:s.rows.length,nextCursor:s.cursor??null,error:s.error??null,responses:s.responses}))};
    const result=resultReport("Live Oathnet full report",rows,raw,"Live API responses. All successfully loaded source pages are included. Source failures, result limits and remaining cursors are listed in sourceResponse.");
    const values=oathnetIndicators(primary.flatMap(s=>s.rows));
    Object.assign(result.summary,{totalFound:allKnown?total:null,securityBreaches:primary[0].total??null,stolenInformation:primary[1].total??null,victimProfiles:primary[2].total??null,returnedRecords:rows.length,ipAddresses:values.ips.length,returnedIpAddresses:values.ips.length,emails:values.emails.length,domains:values.domains.length});
    return {...result,metadata:{live:true,query,source:"Oathnet full",generatedAt:result.generatedAt,summary:result.summary}};
  }
  function drawResults(){
    const rows=allRows().filter(row=>filter==="all"||row.category===filter);page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(rows.length/50)-1)));
    results.replaceChildren(...rows.slice(page*50,page*50+50).map(row=>recordCard(row)));
    pageLabel.textContent=rows.length?`Records ${page*50+1}–${Math.min(rows.length,page*50+50)} of ${rows.length} loaded. Exports include all loaded categories/pages.`:"No records loaded in this category.";
    previous.disabled=page===0;next.disabled=(page+1)*50>=rows.length;
  }
  function draw(){
    if(!active)return;
    const data=report();summary.replaceChildren(reportSummary(data));
    coverage.replaceChildren(h("h4",{class:"pf-title",text:"Live source coverage"}),...sources.map(s=>h("p",{class:"pf-note",text:`${s.label}: ${s.error?`${s.error} · ${s.rows.length} records retained`:!s.initialized?"Not queried yet":`${s.rows.length} loaded${s.paged&&s.total!==undefined?` / ${s.total} source matches`:" response records"}${s.cursor?" · more pages remain":""}`}`})));
    const remaining=session?.data?.user?.daily_lookups?.remaining;if(typeof remaining==="number")coverage.append(h("p",{class:"pf-note",text:`Searches remaining reported at session start: ${remaining}`}));
    const values=oathnetIndicators(primary.flatMap(s=>s.rows));
    indicators.replaceChildren(...([['ips','IP addresses'],['emails','Emails'],['domains','Domains']] as const).map(([key,label])=>
      h("details",{class:"pf-report-details"},h("summary",{text:`${label} in loaded results · ${values[key].length}`}),
        ...(values[key].length?values[key].map(value=>h("p",{class:"pf-report-data",text:value})):
          [h("p",{class:"pf-note",text:`No ${label.toLowerCase()} fields were returned in the successfully loaded records. Check source coverage above for incomplete or failed searches.`})]))));
    select.replaceChildren(h("option",{attrs:{value:"all"},text:"All loaded categories"}),...sources.map(s=>h("option",{attrs:{value:s.label},text:`${s.label} · ${s.rows.length}`})));select.value=filter;
    drawResults();
  }
  async function fetchSource(s:Source){
    const cursor=s.cursor;
    const raw=await request(s.operation,s.query,cursor,sessionId);
    if(!active)return;
    const size=new TextEncoder().encode(JSON.stringify(raw)).byteLength;
    if(bytes+size>20_000_000)throw Error("Report memory budget reached. Export loaded results; narrow the query for the remaining source data.");
    if(s.paged){
      const parsed=oathnetPage(raw);
      if(parsed.cursor && (parsed.cursor===cursor || s.seen.has(parsed.cursor)))throw Error("Provider repeated its cursor; loading paused to prevent duplicate requests.");
      const existing=new Set(s.rows.map(row=>JSON.stringify(row)));for(const row of parsed.items){const key=JSON.stringify(row);if(!existing.has(key)){s.rows.push(row);existing.add(key);}}
      s.cursor=parsed.cursor??undefined;if(s.cursor)s.seen.add(s.cursor);
      if(typeof parsed.meta.total==="number")s.total=parsed.meta.total;
      if(parsed.meta.has_more && !parsed.cursor){s.blocked=true;s.error="Provider reports more results but returned no continuation cursor";}
    }else{const data=unwrap(raw);s.rows=(raw?.body??raw)?.success===false?[]:Array.isArray(data)?data:data&&typeof data==="object"&&Object.keys(data).length?[data]:[];s.total=s.rows.length;}
    bytes+=size;s.responses.push(raw);s.initialized=true;
  }
  async function load(){
    if(busy||!active)return;busy=true;stop=false;loadButton.disabled=true;stopButton.hidden=false;stopButton.disabled=false;
    try{
      if(!sessionId){status.textContent="Starting a live Oathnet search session…";session=await request("session",query);if(!active||stop)return;sessionId=unwrap(session)?.session?.id;if(typeof sessionId!=="string"||!sessionId)throw Error("Oathnet did not return a search session ID. No source was reported as empty.");}
      for(const s of sources){
        if(!active||stop)break;if(s.initialized&&!s.cursor&&!s.error)continue;
        s.error=undefined;s.blocked=false;
        do{if(!active||stop)break;status.textContent=`Loading live ${s.label.toLowerCase()}… ${s.rows.length} records received.`;
          try{await fetchSource(s);draw();}catch(error){s.error=String((error as Error)?.message??error);draw();break;}
        }while(s.cursor&&!s.blocked);
      }
      // Only pivot on identifiers explicitly returned by the three search sources.
      const ids=oathnetIndicators(primary.flatMap(s=>s.rows));
      for(const [operation,values,label]of [["steam",ids.steam,"Steam profile"],["xbox",ids.xbox,"Xbox profile"],["ip",ids.ips,"IP information"]] as const){
        for(const value of values){
          if(!active||stop)break;
          let s=sources.find(s=>s.operation===operation&&s.query===value);if(s?.initialized)continue;
          if(!s){s=source(operation,`${label} · ${value}`,false,value);sources.push(s);}s.error=undefined;
          status.textContent=`Loading related ${label.toLowerCase()} from a returned identifier…`;
          try{await fetchSource(s);}catch(error){s.error=String((error as Error)?.message??error);}draw();
        }
      }
      if(active){const incomplete=sources.some(s=>s.error||s.cursor||!s.initialized);status.textContent=stop?"Loading stopped. Successfully returned records remain available.":incomplete?"Some sources/pages are incomplete. Review live coverage and retry; exports preserve received results.":"All available pages returned by the queried sources are loaded. Source totals and plan result limits remain visible.";}
    }catch(error){if(active)status.textContent=String((error as Error)?.message??error);}
    finally{busy=false;if(active){loadButton.disabled=false;loadButton.textContent="Retry / load remaining live results";stopButton.hidden=true;draw();options.onReport?.(report());}}
  }
  const rawHeading=h("summary",{text:"Complete live source responses"});
  const rawDetails=h("details",{class:"pf-report-details",on:{toggle:()=>{if(rawDetails.open)rawDetails.replaceChildren(rawHeading,h("pre",{class:"pf-report-data"},linkedText(report().sourceResponse)));}}},rawHeading);
  element.append(h("h3",{class:"pf-title",text:"Live Oathnet full search"}),h("p",{class:"pf-note",text:"Uses your configured provider key. Queries breaches, stealer credentials and victim profiles, follows returned cursors, and enriches explicitly returned IP/gaming identifiers. Provider session quotas and permissions apply. Stop loading at any time; no background scan runs after closing."}),h("div",{class:"pf-journal-actions"},loadButton,stopButton),status,coverage,summary,exportControls(report),indicators,select,results,h("div",{class:"pf-journal-actions"},previous,pageLabel,next),rawDetails);
  draw();return {element,load,loaded:()=>primary.every(s=>s.initialized),close(){active=false;stop=true;},report};
}
