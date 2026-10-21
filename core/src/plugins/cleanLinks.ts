/**
 * Clean Links: strips tracking parameters from links in messages you send or
 * edit. It works on the outgoing request (see api/requests.ts), so it doesn't
 * depend on Discord's internal module names. Code blocks are left alone.
 */
import { MESSAGE_PATH } from "../api/requests";
import { definePlugin } from "./types";

/** Tracking parameters removed from every link. */
const ALWAYS = new Set([
  "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "twclid", "ttclid",
  "li_fat_id", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "mkt_tok", "igshid", "igsh",
  "oly_anon_id", "oly_enc_id", "vero_id", "rb_clickid", "s_cid", "ref_src", "ref_url",
]);
const PREFIXES = ["utm_"];
/**
 * Parameters that only mean tracking on certain sites. On other sites the same
 * names can matter (YouTube's `t` is a timestamp, for example), so they're
 * scoped by host. A site ending in "." matches any domain ending, like amazon.co.uk.
 */
const BY_SITE: readonly [site: string, params: readonly string[]][] = [
  ["youtube.com", ["si", "feature"]],
  ["youtu.be", ["si", "feature"]],
  ["spotify.com", ["si", "nd", "dlsi"]],
  ["x.com", ["s", "t"]],
  ["twitter.com", ["s", "t"]],
  ["tiktok.com", ["_t", "_r", "is_from_webapp", "sender_device", "sender_web_id", "share_app_id", "share_link_id"]],
  ["reddit.com", ["share_id", "rdt"]],
  ["amazon.", ["ref_", "pd_rd_r", "pd_rd_w", "pd_rd_wg", "pf_rd_p", "pf_rd_r", "content-id"]],
];

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
/** Fenced and inline code. `split` with this keeps code at the odd indexes. */
const CODE_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/;
/** Punctuation at the end of a link usually belongs to the sentence. */
const TRAILING = /[.,!?;:'")\]]+$/;

function siteParams(host: string): readonly string[] {
  return BY_SITE.filter(([site]) => (site.endsWith(".") ? host.includes(site) : host === site || host.endsWith("." + site))).flatMap(
    ([, params]) => params,
  );
}

export function cleanUrl(link: string): string {
  const trail = TRAILING.exec(link)?.[0] ?? "";
  let url: URL;
  try {
    url = new URL(trail ? link.slice(0, -trail.length) : link);
  } catch {
    return link;
  }
  if (!url.search) return link;
  const scoped = siteParams(url.hostname.toLowerCase());
  let changed = false;
  for (const name of [...url.searchParams.keys()]) {
    const lower = name.toLowerCase();
    if (ALWAYS.has(lower) || scoped.includes(lower) || PREFIXES.some((p) => lower.startsWith(p))) {
      url.searchParams.delete(name);
      changed = true;
    }
  }
  return changed ? url.toString() + trail : link;
}

export function cleanContent(content: string): string {
  return content
    .split(CODE_PATTERN)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(URL_PATTERN, cleanUrl)))
    .join("");
}

export default definePlugin({
  id: "cleanLinks",
  name: "Clean Links",
  description: "Strips tracking junk from links in messages you send.",
  category: "Privacy",
  impact: "light",
  impactReason: "Only runs when you send or edit a message",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.onApiRequest(["POST", "PATCH"], MESSAGE_PATH, ({ body }) => {
      if (typeof body?.content === "string") body.content = cleanContent(body.content);
    });
  },
});
