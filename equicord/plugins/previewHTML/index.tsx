/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

const t = (text: string): string => text;

// ── Settings ───────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    autoExpand: { type: OptionType.BOOLEAN, description: "Expand sandbox information below matching messages", default: false },
    maxPreviewsPerMessage: { type: OptionType.SELECT, description: "Maximum sandbox cards per message", options: [{label:"1",value:1},{label:"3",value:3,default:true},{label:"5",value:5}], default:3 },
    allowScripts: { type: OptionType.BOOLEAN, description: "Allow scripts in isolated previews; untrusted pages may contact external services", default: false },
});

interface HtmlItem {
    url: string;
    name: string;
    size?: string;
}

function formatBytes(bytes?: number): string {
    if (!bytes || isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

function extractHtmlItems(message: any): HtmlItem[] {
    const items: HtmlItem[] = [];
    const seenUrls = new Set<string>();

    // 1. Check attachments
    if (Array.isArray(message?.attachments)) {
        for (const att of message.attachments) {
            const filename = (att.filename || "").toLowerCase();
            const contentType = (att.content_type || "").toLowerCase();
            if (filename.endsWith(".html") || filename.endsWith(".htm") || contentType === "text/html") {
                const url = att.url || att.proxy_url;
                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    items.push({
                        url,
                        name: att.filename || "page.html",
                        size: formatBytes(att.size),
                    });
                }
            }
        }
    }

    // 2. Check message content URLs
    const content = message?.content || "";
    const urlRegex = /https?:\/\/[^\s<>"`{}|\\^]+/gi;
    const matches = content.match(urlRegex) || [];

    for (let rawUrl of matches) {
        rawUrl = rawUrl.replace(/[.,!?;:)>\]]+$/, "");
        try {
            const parsed = new URL(rawUrl);
            const path = parsed.pathname.toLowerCase();
            if (path.endsWith(".html") || path.endsWith(".htm")) {
                if (!seenUrls.has(rawUrl)) {
                    seenUrls.add(rawUrl);
                    const name = decodeURIComponent(parsed.pathname.split("/").pop() || "page.html");
                    items.push({
                        url: rawUrl,
                        name,
                    });
                }
            }
        } catch { }
    }

    const limit = Number(settings.store.maxPreviewsPerMessage);
    return (limit && limit > 0) ? items.slice(0, limit) : items;
}

function HtmlCard({ item }: { item: HtmlItem; }) {
    const url = item.url, title = item.name;
    const [expanded, setExpanded] = React.useState(settings.store.autoExpand);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    async function open() {
        setBusy(true); setError("");
        try {
            const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
            if (!invoke) throw Error("Sandbox previews require the XRay desktop app.");
            await invoke("open_sandbox_preview", {url, htmlMode: true, allowScripts: settings.store.allowScripts});
        } catch (e) { setError(String((e as Error)?.message ?? e)); }
        finally { setBusy(false); }
    }
    return <section className="xray-preview-card" data-xray-plugin-ui onClick={e=>e.stopPropagation()}>
        <div className="xray-preview-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"/></svg>
            <strong>{title}</strong><span>ISOLATED PREVIEW</span>
            <button type="button" aria-expanded={expanded} aria-label="Sandbox details" onClick={()=>setExpanded(!expanded)}>{expanded ? "-" : "+"}</button>
        </div>
        {expanded && <p>Opens in a separate, resizable private window with no Discord session or XRay command permissions. HTML is limited to 1 MB. Scripts are off by default; external styles and images may load.</p>}
        <div className="xray-preview-actions"><button type="button" disabled={busy} onClick={()=>void open()}>{busy?"Opening...":"Open sandbox preview"}</button><a href={url} target="_blank" rel="noopener noreferrer">Open in browser</a></div>
        {error && <p role="alert">{error}</p>}
    </section>;
}

function HtmlPreviewAccessory({ message }: { message: any; }) {
    const items = React.useMemo(() => {
        return extractHtmlItems(message);
    }, [message?.content, message?.attachments]);

    if (!items || items.length === 0) return null;

    return (
        <div className="phtml-container" onClick={e => e.stopPropagation()}>
            {items.map(item => (
                <HtmlCard key={item.url} item={item} />
            ))}
        </div>
    );
}

// ── Plugin Definition ──────────────────────────────────────────────────────────

const ACCESSORY_ID = "nightcord-html-preview";

export default definePlugin({
    name: "PreviewHTML",
    description: "Open matching HTML attachments and pages in isolated XRay preview windows.",
    authors: [{ name: "Nightcord", id: 0n }],
    settings,

    start() {
        addMessageAccessory(ACCESSORY_ID, props => (
            <HtmlPreviewAccessory message={props.message} />
        ));
    },

    stop() {
        removeMessageAccessory(ACCESSORY_ID);
    },
});
