import { h } from "./dom";
import { icon } from "./icons";

/** Count unique, explicitly identified IP values without inferring addresses from IDs. */
export function returnedIpAddresses(records:unknown[]):number {
  const addresses=new Set<string>();let visited=0;
  const field=/^(?:ip|ips|ip_address(?:es)?|ipaddress(?:es)?|lastip|last_ip|ipv[46]|selector)$/i;
  const add=(value:string)=>{
    for(const part of value.split(/[\s,;]+/)){
      if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(part) && part.split(".").every(n=>Number(n)<=255))addresses.add(part.split(".").map(Number).join("."));
      else if(part.includes(":") && /^[\da-f:.]+$/i.test(part))try{addresses.add(new URL(`http://[${part}]/`).hostname.toLowerCase());}catch{/* Not an IPv6 address. */}
    }
  };
  const visit=(value:any,ip=false,depth=0)=>{
    if(depth>16 || ++visited>100_000 || value==null)return;
    if(typeof value==="string"){
      if(ip)add(value);
      if(/^[\[{]/.test(value.trim()) && value.length<=1_048_576)try{visit(JSON.parse(value),ip,depth+1);}catch{/* Ordinary text stays untouched. */}
    }else if(Array.isArray(value)){for(const item of value)visit(item,ip,depth+1);}
    else if(typeof value==="object"){
      const named=field.test(String(value.key??value.label??value.type??"").replace(/[\s-]+/g,"_"));
      for(const [key,item]of Object.entries(value))visit(item,field.test(key.replace(/[\s-]+/g,"_"))||(key==="value" && named),depth+1);
    }
  };
  visit(records);return addresses.size;
}

export interface ResultReport { title:string; generatedAt:string; summary:Record<string,unknown>; records:unknown[]; coverage:string; sourceResponse?:unknown; }
export function resultReport(title:string, records:unknown[], raw:any={},coverage="Returned source data only; missing metrics are unknown."):ResultReport {
  const metrics=[raw?.summary,raw?.metadata?.summary,raw?.data?.summary,raw?.totals,raw?.data?.totals];
  const count=(...keys:string[])=>{for(const metric of metrics)for(const k of keys)if(typeof metric?.[k]==="number" && Number.isFinite(metric[k]) && metric[k]>=0)return metric[k];return null;};
  const ips=returnedIpAddresses(records);
  const sources:Record<string,number>=Object.create(null);for(const row of records){const source=String((row as any)?.source??(row as any)?.dbname??"Unspecified");sources[source]=(sources[source]??0)+1;}
  return {title,generatedAt:new Date().toISOString(),summary:{totalFound:count("totalFound","total_found","total","records")??records.length,returnedRecords:records.length,ipAddresses:count("ipAddresses","ip_addresses","ips")??ips,returnedIpAddresses:ips,emails:count("emails"),domains:count("domains"),stolenInformation:count("stolenInformation","stolen_information"),securityBreaches:count("securityBreaches","security_breaches","breach"),infectedMachines:count("infectedMachines","infected_machines"),topSources:Object.entries(sources).sort((a,b)=>b[1]-a[1])},records,coverage,sourceResponse:raw};
}
export function reportSummary(report:ResultReport):HTMLElement {
  const labels:[string,string][]=[["totalFound","Total found"],["returnedRecords","Records loaded"],["ipAddresses","IP addresses"],["returnedIpAddresses","Unique IPs in loaded records"],["emails","Emails"],["domains","Domains"],["stolenInformation","Stolen information"],["securityBreaches","Security breaches"],["infectedMachines","Infected machines"]];
  return h("section",{class:"report-summary",attrs:{"aria-label":"Report summary"}},
    h("dl",{class:"report-metrics"},...labels.map(([key,label])=>h("div",{},h("dt",{text:label}),h("dd",{class:report.summary[key]==null?"report-metric-unavailable":"",text:report.summary[key]==null?"Unavailable":String(report.summary[key])})))),
    h("details",{class:"pf-report-details"},h("summary",{},h("span",{trustedHtml:icon("database",14)})," Top sources in loaded records"),h("ul",{class:"pf-list compact"},...(report.summary.topSources as [string,number][]).map(([name,count])=>h("li",{text:`${name} · ${count}`})))),
    h("p",{class:"pf-note",text:"Source totals may cover more results than this page. IP addresses uses the source total when supplied, otherwise the unique loaded count. Loaded IPs are deduplicated IPv4/IPv6 values in supplied address fields. Unavailable metrics were not supplied."}));
}
const valueText=(value:unknown)=>value==null?"":typeof value==="string"?value:JSON.stringify(value);
export function csvCell(value:unknown):string {
  let text=valueText(value);if(/^\s*[=+@\-\t\r]/.test(text))text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}
export function reportCsv(report:ResultReport):string {
  const rows:unknown[][]=[["type","index","field","value"],["metadata","","title",report.title],["metadata","","generatedAt",report.generatedAt],["metadata","","coverage",report.coverage],...Object.entries(report.summary).map(([key,value])=>["summary","",key,value])];
  report.records.forEach((record,index)=>{for(const [key,value]of Object.entries(record && typeof record==="object"?record:{value:record}))rows.push(["record",index+1,key,value]);});
  if(report.sourceResponse && Object.keys(report.sourceResponse as object).length)rows.push(["source","","response",report.sourceResponse]);
  return rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
}
const escape=(value:unknown)=>valueText(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function printableReport(report:ResultReport):string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(report.title)}</title><style>body{font:15px system-ui;margin:32px;color:#171717}pre{white-space:pre-wrap;overflow-wrap:anywhere}article{border-top:1px solid #bbb;padding:12px 0;break-inside:avoid}@media print{body{margin:0}}</style><h1>${escape(report.title)}</h1><p>${escape(report.generatedAt)}</p><p>${escape(report.coverage)}</p><h2>Summary</h2><pre>${escape(JSON.stringify(report.summary,null,2))}</pre>${report.sourceResponse && Object.keys(report.sourceResponse as object).length ? `<details><summary>Complete source response</summary><pre>${escape(JSON.stringify(report.sourceResponse,null,2))}</pre></details>` : ""}${report.records.map((row,index)=>`<article><h2>Record ${index+1}</h2><pre>${escape(JSON.stringify(row,null,2))}</pre></article>`).join("")}</html>`;
}
export function downloadText(name:string,text:string,type:string):void {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
export function exportControls(getReport:()=>ResultReport):HTMLElement {
  const status=h("span",{class:"pf-note",attrs:{role:"status"}});
  const formats=[['JSON','json','application/json',(r:ResultReport)=>JSON.stringify(r,null,2)],['CSV','csv','text/csv;charset=utf-8',reportCsv],['Printable HTML','html','text/html;charset=utf-8',printableReport]] as const;
  return h("div",{class:"pf-journal-actions"},...formats.map(([label,ext,mime,format])=>h("button",{class:"btn ghost",attrs:{type:"button"},text:`Download ${label}`,on:{click:()=>{try{downloadText(`xray-report-${Date.now()}.${ext}`,format(getReport()),mime);status.textContent="Download prepared.";}catch{status.textContent="Download unavailable. Use Copy returned JSON instead.";}}}})),status);
}
