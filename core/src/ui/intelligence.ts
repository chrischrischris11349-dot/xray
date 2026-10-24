import { rememberReport } from "./reportCache";
import { addStyle, watchElements } from "../api/dom";
import { closeDialog, showSheet } from "./dialog";
import { h } from "./dom";
import type { Feature } from "./features";
import { icon } from "./icons";
import { renderImportedReport } from "./importedReport";
import { liveIntel } from "./liveIntel";
import { recordingPanel } from "../voice/recorder";
import { monitorPanel } from "../monitoring";

const providers = ["Reports", "IntelX", "Snusbase", "Oathnet", "Recordings", "Monitors"] as const;
type Provider = typeof providers[number];
let current: Provider = "Reports";
let workspace: HTMLElement | undefined;
let stopWatching: (() => void) | undefined;
let stopStyle: (() => void) | undefined;
const entries = new Set<HTMLElement>();
const reports = new Map<Provider, any>();

export function parseLocalReport(text: string, provider: string, subject: string): any {
  if (text.length > 1_048_576) throw new Error("Report exports must be at most 1 MB.");
  let json = text;
  if (text.trimStart().startsWith("<")) {
    let found = false;
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\bid\s*=\s*["']oathnet-report-data["']/i.test(match[1]) && /\btype\s*=\s*["']application\/json["']/i.test(match[1])) { json = match[2]; found = true; break; }
    }
    if (!found) throw new Error("This HTML export has no supported JSON report block. Use a JSON export.");
  }
  const data = JSON.parse(json.trimStart());
  if (data?.metadata && Array.isArray(data.records)) {
    if (data.records.length > 1000) throw new Error("Import at most 1,000 records per report.");
    if (!/^\d{14,19}$/.test(data.metadata.query)) throw new Error("The report needs a valid Discord subject ID.");
    if (subject && subject !== data.metadata.query) throw new Error("The report subject does not match the entered Discord ID.");
    return data;
  }
  if (!/^\d{14,19}$/.test(subject)) throw new Error("Enter the matching Discord subject ID before importing this export.");
  const rows: any[] = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.records) ? data.records : [data];
  if (rows.length > 1000) throw new Error("Import at most 1,000 records per report.");
  return { metadata: { query: subject, generatedAt: new Date().toISOString(), source: provider, importedAt: true,summary:data?.summary??data?.metadata?.summary??data?.data?.summary },totals:data?.totals??data?.data?.totals,response:data,
    records: rows.filter(row => row && typeof row === "object").map((row, index) => ({ source: provider, title: `Record ${index + 1}`, fields: Object.entries(row).map(([key,value]) => ({ key, label: key, value })) })) };
}

export function openIntelligence(tab: Provider = "Reports"): void {
  current = tab;
  const panel = h("div", { class: "profile intel-workspace", attrs: { role: "dialog", "aria-modal": "true", "aria-label": "XRay Intelligence" } });
  workspace = panel;
  const content = h("div", { class: "intel-workspace-body" });
  const nav = h("nav", { class: "intel-tabs", attrs: { "aria-label": "Intelligence sections" } });
  let closeContent:(()=>void)|undefined;
  const draw = () => {
    closeContent?.();closeContent=undefined;
    nav.replaceChildren(...providers.map(provider => h("button", { class: "btn ghost", attrs: { type: "button", "aria-pressed": String(current === provider) }, text: provider, on: { click: () => { current = provider; draw(); nav.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(); } } })));
    content.replaceChildren();
    if(current==="IntelX" || current==="Snusbase" || current==="Oathnet") {const view=liveIntel(current);content.append(view.element);closeContent=view.close;return;}
    if(current==="Recordings"){const view=recordingPanel();content.append(view.element);closeContent=view.close;return;}
    if(current==="Monitors"){const view=monitorPanel();content.append(view.element);closeContent=view.close;return;}
    const selected = current;
    const title = h("h2", { text: selected === "Reports" ? "Authorized reports" : `${selected} exports` });
    const subject = h("input", { class: "dialog-input", attrs: { placeholder: "Discord subject ID", "aria-label": "Report subject Discord ID", inputmode: "numeric" } });
    const file = h("input", { attrs: { type: "file", accept: ".json,.html", "aria-label": `Import an authorized ${selected} report` } });
    const status = h("p", { class: "pf-note", attrs: { role: "status" } });
    file.addEventListener("change", () => {
      const selectedFile = file.files?.[0]; if (!selectedFile) return;
      if (selectedFile.size > 1_048_576) { status.textContent = "Report exports must be at most 1 MB."; return; }
      void selectedFile.text().then(text => {
        const report = parseLocalReport(text, selected, subject.value.trim());
        reports.set(selected, report);rememberReport(report.metadata.query,report);
        if (workspace === panel && panel.isConnected && current === selected) draw();
      }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); });
    });
    content.append(title, h("p", { class: "pf-note", text: "Import a saved report here, or choose a provider tab for a live lookup. Keys are managed in a separate native settings window." }), subject, file, status);
    const report = reports.get(selected);
    if (report) content.append(renderImportedReport(report, report.metadata.query));
  };
  panel.append(h("header", { class: "intel-workspace-head" }, h("span", { trustedHtml: icon("shield", 22) }), h("strong", { text: "XRAY / INTELLIGENCE" }), h("button", { class: "btn ghost", attrs: { type: "button" }, text: "Close", on: { click: closeDialog } })), nav, content);
  draw();
  showSheet(panel, () => {closeContent?.(); if (workspace === panel) workspace = undefined; });
  nav.querySelector<HTMLButtonElement>("button")?.focus();
}

export const intelligence: Feature = {
  id: "intelligence", name: "Intelligence workspace", enabledByDefault: false,
  description: "Live IntelX, Snusbase and Oathnet lookups, server recordings, monitor lists and authorized report imports.",
  start() {
    if (stopWatching) return;
    stopStyle = addStyle(`.xray-intel-entry { margin:4px 8px; width:calc(100% - 16px); display:flex; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--background-mod-strong); border-radius:6px; background:transparent; color:var(--text-default); font:inherit; cursor:pointer; text-align:left; } .xray-intel-entry:hover { background:var(--background-mod-subtle); } html[data-xray-presentation] .xray-intel-entry {display:none!important}`);
    stopWatching = watchElements('nav a[href="/channels/@me"], [class*="privateChannels_"] a[href="/channels/@me"]', friendLink => {
      for (const entry of entries) if (!entry.isConnected) entries.delete(entry);
      const parent = friendLink.closest("li") ?? friendLink.parentElement;
      if (!parent || parent.parentElement?.querySelector(".xray-intel-entry")) return;
      const button = h("button", { class: "xray-intel-entry", attrs: { type: "button" }, on: { click: () => openIntelligence() } }, h("span", { trustedHtml: icon("shield", 20) }), "XRay Intelligence");
      const slot = h(parent.tagName === "LI" ? "li" : "div", {}, button);
      parent.after(slot); entries.add(slot);
    });
  },
  stop() { stopWatching?.(); stopStyle?.(); stopWatching = stopStyle = undefined; entries.forEach(entry => entry.remove()); entries.clear(); if (workspace?.isConnected) closeDialog(); },
};
