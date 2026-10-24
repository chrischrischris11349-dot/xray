import { exportControls, resultReport } from "./reportExport";
import { formatDateTime } from "../time";
import { h } from "./dom";
import { icon, type IconName } from "./icons";
import { linkedText } from "./reportText";
import { invoke } from "../shell/bridge";

export function reportAvatar(value: unknown): string | null {
  if (value && typeof value === "object") return reportAvatar((value as any).url ?? (value as any).src ?? (value as any).avatar_url);
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && /^(cdn\.discordapp\.com|media\.discordapp\.net|avatars(?:\.(?:akamai|cloudflare))?\.steamstatic\.com)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function recordCard(record: any, fallbackAvatar?: string | null): HTMLElement {
  const fields: any[] = Array.isArray(record?.fields) ? record.fields : [];
  const title = String(record.title ?? record.source ?? "Record");
  const avatar = findReportAvatar(record) ?? reportAvatar(fallbackAvatar);
  const photo = reportPhoto(avatar,title,"intel-avatar");
  return h("details", { class: "pf-report-details pf-report-card" },
    h("summary", { class: "intel-record-heading" }, photo,
      h("span", { class: "intel-heading-copy" }, h("strong", { text: title }), h("span", { class: "pf-item-sub", text: String(record.source ?? "Unknown source") })),
      h("span", { class: "intel-count", text: `${fields.length} fields` })),
    h("dl", { class: "pf-facts" }, ...fields.flatMap(field => {
      const label = String(field?.label ?? field?.key ?? "Field");
      const raw = field?.value;
      // Preserve exported strings exactly, including long identifiers inside JSON strings.
      const value = raw == null || raw === "" ? "Unavailable" : typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      const sensitive = field?.sensitive === true || /^(?:ip|ip_address|password|token|secret|license|license2)$/i.test(field?.key ?? "");
      const structured = raw && (typeof raw === "object" || typeof raw === "string" && /^\s*[\[{]/.test(raw));
      const cell = sensitive || structured
        ? h("dd", {}, h("details", { class: "pf-report-structured" }, h("summary", { text: sensitive ? `Reveal ${label}` : "View structured data" }), h("pre", { class: "pf-report-data" },linkedText(value))))
        : h("dd", { class: "pf-report-data" },linkedText(value));
      return [h("dt", { text: label }), cell];
    })));
}

export function findReportAvatar(value:any,depth=0):string|null {
  if(depth>6 || value==null)return null;
  if(typeof value==="string" && /^[\[{]/.test(value) && value.length<100000){try{return findReportAvatar(JSON.parse(value),depth+1);}catch{return null;}}
  if(typeof value!=="object")return null;
  if(Array.isArray(value)) {for(const item of value.slice(0,100)){const url=findReportAvatar(item,depth+1);if(url)return url;}return null;}
  if(typeof value.key==="string" && /^(avatar(?:_?full|_?url)?|profile_image_url|picture)$/i.test(value.key)){const url=reportAvatar(value.value);if(url)return url;}
  for(const [key,item]of Object.entries(value).slice(0,100))if(/^(avatar(?:_?full|_?url)?|profile_image_url|picture)$/i.test(key)){const url=reportAvatar(item);if(url)return url;}
  for(const item of Object.values(value).slice(0,100)){const url=findReportAvatar(item,depth+1);if(url)return url;}return null;
}

/** Render data extracted from the JSON block; never execute the export's HTML/scripts. */
export function renderImportedReport(report: any, userId: string, fallbackAvatar?: string | null): HTMLElement {
  if (report?.metadata?.query !== userId || !Array.isArray(report?.records)) throw new Error("The imported report does not match this Discord ID.");
  if (report.records.length > 1000) throw new Error("Open a report with at most 1,000 records.");
  const date = new Date(report.metadata.generatedAt);
  const heading = `${report.metadata.live ? "Live" : "Imported"} ${typeof report.metadata.source === "string" ? `${report.metadata.source} ` : ""}search report`;
  const block = h("section", { attrs: { "aria-label": heading } },
    h("h3", { class: "pf-title", text: heading }),
    h("p", { class: "pf-note", text: `${report.records.length} records · ${report.metadata.importedAt ? "Imported" : "Returned"} ${Number.isFinite(date.getTime()) ? formatDateTime(date) : "date unavailable"}. ${report.metadata.live?"Live API result page.":"This is a saved report, not a live lookup."}` }));
  block.append(exportControls(()=>resultReport(heading,report.records,report)));
  const groups = new Map<string, { glyph: IconName; subtitle: string; records: any[] }>();
  for (const record of report.records.filter((r: any) => r && typeof r === "object")) {
    const source = String(record.source ?? "");
    const gaming = /steam|xbox|minecraft|gaming/i.test(source), discord = /discord/i.test(source);
    const name = gaming ? "Gaming profiles" : discord ? "Discord profiles" : "Report records";
    if (!groups.has(name)) groups.set(name, { glyph: gaming ? "gamepad" : discord ? "users" : "database", subtitle: gaming ? "Steam · Xbox · Minecraft" : discord ? "Accounts · badges · profile fields" : report.metadata.live ? "Returned source records" : "Imported source records", records: [] });
    groups.get(name)!.records.push(record);
  }
  for (const [name, group] of groups) {
    block.append(h("details", { class: "intel-group", attrs: { open: "" } },
      h("summary", { class: "intel-group-heading" }, h("span", { class: "intel-group-icon", trustedHtml: icon(group.glyph, 18) }),
        h("span", { class: "intel-heading-copy" }, h("strong", { text: name }), h("span", { class: "pf-item-sub", text: group.subtitle })),
        h("span", { class: "intel-count", text: `${group.records.length} ${name === "Report records" ? group.records.length === 1 ? "record" : "records" : group.records.length === 1 ? "profile" : "profiles"}` })),
      ...group.records.slice(0,50).map(record => recordCard(record, /discord/i.test(String(record.source)) ? fallbackAvatar : null))));
    if(group.records.length>50){const container=block.lastElementChild!;let shown=50;const more=h("button",{class:"btn ghost",text:"Load next 50 records",on:{click:()=>{const rows=group.records.slice(shown,shown+50);for(const row of rows)more.before(recordCard(row,fallbackAvatar));shown+=rows.length;more.hidden=shown>=group.records.length;}}});container.append(more);}
  }
  block.append(h("details", { class: "pf-report-details" }, h("summary", { text: "Complete exported payload" }),
    h("pre", { class: "pf-report-data" },linkedText(report))));
  return block;
}

const avatarCache=new Map<string,Promise<string>>();
export function reportPhoto(url:string|null,name:string,className:string):HTMLElement {
  const fallback=()=>h("span",{class:className,attrs:{role:"img","aria-label":`${name} · photo unavailable`},text:name.slice(0,1).toUpperCase()});
  if(!url)return fallback();
  const image=h("img",{class:className,attrs:{src:url,alt:`${name} profile photo`,loading:"lazy",referrerpolicy:"no-referrer"}});
  let attempted=false;
  image.addEventListener("error",()=>{
    if(attempted || !/\.steamstatic\.com\//.test(url)){image.replaceWith(fallback());return;}
    attempted=true;
    // Discord CSP blocks external Steam avatars. Fetch the original through the
    // existing public, credential-free native bridge, then use a bounded raster.
    let pending=avatarCache.get(url);
    if(!pending){pending=invoke("web_fetch",{method:"GET",url,headers:[],body:null}).then((r:any)=>{
      if(r.status!==200 || typeof r.body!=="string" || r.body.length>700_000)throw Error("Avatar unavailable");
      const signature=atob(r.body.slice(0,32));const mime=signature.startsWith("\x89PNG")?"image/png":signature.startsWith("\xff\xd8\xff")?"image/jpeg":signature.startsWith("RIFF") && signature.includes("WEBP")?"image/webp":null;
      if(!mime)throw Error("Not a supported photo");return `data:${mime};base64,${r.body}`;
    });if(avatarCache.size>=32)avatarCache.delete(avatarCache.keys().next().value!);avatarCache.set(url,pending);}
    void pending.then(src=>{image.src=src;}).catch(()=>image.replaceWith(fallback()));
  });return image;
}
