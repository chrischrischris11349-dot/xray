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
    allowScripts: { type: OptionType.BOOLEAN, description: "Allow scripts in isolated previews; untrusted pages may contact external services", default: true },
});

const MEDIA_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mkv|mp3|ogg|wav|flac|m4a|pdf)(\?[^#]*)?(#.*)?$/i;

// Strictly block only Discord domains to prevent nested routing or UI hijacking
const BLOCKED_DOMAINS = [
    "discord.com",
    "discord.gg",
    "discordapp.com",
    "discordapp.net",
    "discord.media",
    "discord.gift",
    "cdn.discordapp.com",
    "media.discordapp.net",
    "localhost",
    "127.0.0.1",
    "nightcord.st"
];

function extractValidUrls(content: string): string[] {
    if (!content) return [];

    const urlRegex = /https?:\/\/[^\s<>"`{}|\\^]+/gi;
    const matches = content.match(urlRegex) || [];
    const valid: string[] = [];

    for (let rawUrl of matches) {
        // Strip trailing punctuation and markdown syntax
        rawUrl = rawUrl.replace(/[.,!?;:)>\]]+$/, "");

        try {
            const parsed = new URL(rawUrl);

            // Filter out non-http protocols
            if (parsed.protocol !== "https:") continue;

            // Filter out direct media files
            if (MEDIA_EXTENSIONS.test(parsed.pathname)) continue;

            // Filter out blocked domains
            const h = parsed.hostname.toLowerCase();
            if (BLOCKED_DOMAINS.some(d => h === d || h.endsWith("." + d))) continue;

            if (!valid.includes(rawUrl)) {
                valid.push(rawUrl);
            }
        } catch { }
    }

    const limit = Number(settings.store.maxPreviewsPerMessage);
    return (limit && limit > 0) ? valid.slice(0, limit) : valid;
}

// ── Single Preview Card Component ──────────────────────────────────────────────

function PreviewCard({ url }: { url: string; }) {
    let title = url; try { title = new URL(url).hostname; } catch {}
    const [expanded, setExpanded] = React.useState(settings.store.autoExpand);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    async function open() {
        setBusy(true); setError("");
        try {
            const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
            if (!invoke) throw Error("Sandbox previews require the XRay desktop app.");
            const inspect=(window as any).__xray?.confirmExternalLink;
            if(!inspect)throw Error("Restart XRay to enable destination checks before opening a website.");
            if(!await inspect(url,"Sandbox preview"))return;
            await invoke("open_sandbox_preview", {url, htmlMode: false, allowScripts: settings.store.allowScripts});
        } catch (e) { setError(String((e as Error)?.message ?? e)); }
        finally { setBusy(false); }
    }
    return <section className="xray-preview-card" data-xray-plugin-ui onClick={e=>e.stopPropagation()}>
        <div className="xray-preview-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"/></svg>
            <strong>{title}</strong><span>ISOLATED PREVIEW</span>
            <button type="button" aria-expanded={expanded} aria-label="Sandbox details" onClick={()=>setExpanded(!expanded)}>{expanded ? "-" : "+"}</button>
        </div>
        {expanded && <p>Opens in a separate, resizable private window with no Discord session or XRay command permissions. The destination sees your network address. Scripts may run when enabled; this is not an anonymity tool.</p>}
        <div className="xray-preview-actions"><button type="button" disabled={busy} onClick={()=>void open()}>{busy?"Opening...":"Open sandbox preview"}</button><a href={url} target="_blank" rel="noopener noreferrer">Open in browser</a></div>
        {error && <p role="alert">{error}</p>}
    </section>;
}

function WebsitePreviewAccessory({ message }: { message: any; }) {
    const urls = React.useMemo(() => {
        return extractValidUrls(message?.content || "");
    }, [message?.content]);

    if (!urls || urls.length === 0) return null;

    return (
        <div className="pw-container" onClick={e => e.stopPropagation()}>
            {urls.map(url => (
                <PreviewCard key={url} url={url} />
            ))}
        </div>
    );
}

// ── Plugin Definition ──────────────────────────────────────────────────────────

const ACCESSORY_ID = "nightcord-website-preview";

export default definePlugin({
    name: "PreviewWebsite",
    description: "Open matching website links in isolated XRay preview windows.",
    authors: [{ name: "Nightcord", id: 0n }],
    settings,

    start() {
        addMessageAccessory(ACCESSORY_ID, props => (
            <WebsitePreviewAccessory message={props.message} />
        ));
    },

    stop() {
        removeMessageAccessory(ACCESSORY_ID);
    },
});
