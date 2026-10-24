import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { renderImportedReport } from "./importedReport";
import { linkedText } from "./reportText";

export function oathnetPage(response:any):{items:any[];cursor:string|null;meta:any;raw:any} {
  const body=response?.body??response;
  if(body?.success===false){if(/^no results? found\.?$/i.test(body.message??""))return{items:[],cursor:null,meta:{total:0},raw:body};throw Error(body.message??"Oathnet search failed.");}
  const data=body?.data??body;
  if(!data || !Array.isArray(data.items))throw Error("Oathnet search returned no readable items array. Profile details are not a breach-search report.");
  const cursor=data.next_cursor??data.nextCursorMark??data.next_cursor_mark??null;
  if(cursor!==null && (typeof cursor!=="string" || cursor.length>4096))throw Error("Oathnet returned an invalid pagination cursor.");
  return {items:data.items,cursor:cursor||null,meta:data.meta??{},raw:body};
}
export function oathnetSearch(userId:string, request=(cursor?:string)=>invoke("intel_request",{provider:"oathnet",operation:"search",query:userId,kind:"discord",cursor:cursor??null}),onReport?:(report:any)=>void) {
  let active=true,busy=false,loaded=false,index=-1,retryCursor:string|undefined;
  const pages:{requestCursor?:string;data:ReturnType<typeof oathnetPage>}[]=[];
  const element=h("section",{class:"pf-block wide",attrs:{"aria-label":"Oathnet breach search results"}});
  const output=h("div"),status=h("p",{class:"pf-note",attrs:{role:"status"}});
  const load=h("button",{class:"btn",text:"Load Oathnet search results",on:{click:()=>void fetchPage(retryCursor)}});
  const previous=h("button",{class:"btn ghost",text:"Previous search page",on:{click:()=>{if(index>0){index--;draw();}}}});
  const next=h("button",{class:"btn ghost",text:"Next search page",on:{click:()=>{if(index+1<pages.length){index++;draw();}else void fetchPage(pages[index]?.data.cursor??undefined);}}});
  const draw=()=>{
    const page=pages[index];if(!page)return;
    const {items,meta,cursor}=page.data;
    const report={metadata:{live:true,query:userId,generatedAt:new Date().toISOString(),source:"Oathnet breach",summary:{totalFound:typeof meta.total==="number"?meta.total:items.length}},records:items.map((row:any,i:number)=>({source:String(row?.dbname??row?.db_name??row?.source??row?._source?.dbname??"Oathnet"),title:String(row?.username??row?.name??row?.id??`Result ${i+1}`),fields:Object.entries(row??{}).map(([key,value])=>({key,label:key,value}))}))};
    Object.assign(report,{response:page.data.raw});onReport?.(report);
    output.replaceChildren(h("p",{class:"pf-note",text:`Page ${index+1} · ${items.length} returned · ${meta.total??"Unknown"} total matches. ${cursor?"More results are available.":meta.has_more?"Provider indicates more results but supplied no cursor.":"Last returned page."}`}),renderImportedReport(report,userId));
    output.querySelectorAll<HTMLDetailsElement>(".pf-report-card").forEach(card=>{card.open=true;});
    output.prepend(h("button",{class:"btn ghost",text:"Expand all returned fields",on:{click:()=>output.querySelectorAll<HTMLDetailsElement>("details").forEach(d=>{d.open=true;})}}));
    output.append(h("details",{class:"pf-report-details"},h("summary",{text:"Complete Oathnet response for this page"}),h("pre",{class:"pf-report-data"},linkedText(page.data.raw))));
    previous.disabled=index<=0;next.disabled=!cursor && index+1>=pages.length;load.hidden=loaded;
  };
  async function fetchPage(cursor?:string){
    if(busy || !active)return;busy=true;load.disabled=next.disabled=previous.disabled=true;status.textContent="Loading Oathnet breach search...";
    try {const data=oathnetPage(await request(cursor));if(!active)return;
      // Keep at most ten pages in memory; navigating older cached pages needs no new lookup.
      pages.push({requestCursor:cursor,data});if(pages.length>10)pages.shift();index=pages.length-1;loaded=true;draw();status.textContent="Returned fields are preserved below. Search matches are provider observations, not verified identity.";
    }catch(error){if(active){retryCursor=cursor;status.textContent=String((error as Error)?.message??error);load.hidden=false;load.textContent=loaded?"Retry search page":"Retry Oathnet search";}}
    finally{busy=false;if(active){load.disabled=false;previous.disabled=index<=0;next.disabled=!pages[index]?.data.cursor && index+1>=pages.length;}}
  }
  element.append(h("h3",{class:"pf-title",text:"Oathnet search report"}),h("p",{class:"pf-note",text:"Search the selected Discord ID in the breach database. This is separate from profile/username-history lookups and uses your provider quota."}),load,previous,next,status,output);
  previous.disabled=next.disabled=true;
  return {element,load:()=>fetchPage(),close(){active=false;},loaded:()=>loaded};
}
