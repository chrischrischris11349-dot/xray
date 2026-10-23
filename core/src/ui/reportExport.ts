import { h } from "./dom";

export interface ResultReport { title:string; generatedAt:string; summary:Record<string,unknown>; records:unknown[]; coverage:string; sourceResponse?:unknown; }
export function resultReport(title:string, records:unknown[], raw:any={},coverage="Returned source data only; missing metrics are unknown."):ResultReport {
  const metrics=raw?.summary??raw?.metadata?.summary??raw?.data?.summary??{};
  const count=(...keys:string[])=>{for(const k of keys)if(typeof metrics[k]==="number" && Number.isFinite(metrics[k]))return metrics[k];return null;};
  const sources:Record<string,number>=Object.create(null);for(const row of records){const source=String((row as any)?.source??(row as any)?.dbname??"Unspecified");sources[source]=(sources[source]??0)+1;}
  return {title,generatedAt:new Date().toISOString(),summary:{totalFound:count("totalFound","total_found","total")??records.length,returnedRecords:records.length,stolenInformation:count("stolenInformation","stolen_information"),securityBreaches:count("securityBreaches","security_breaches"),infectedMachines:count("infectedMachines","infected_machines"),topSources:Object.entries(sources).sort((a,b)=>b[1]-a[1])},records,coverage,sourceResponse:raw};
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
