import { h } from "./dom";
import { currentTimeFormat, formatDateTime, formatTime } from "../time";
import { isDeletedMessage } from "./deletedMessages";
import { imageLink } from "./imageViewer";

export function chatUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}

function mediaUrl(value: unknown): string | null {
  const url = chatUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname;
  return /^(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-[12]\.discordapp\.net|media\.tenor\.com|c\.tenor\.com|media\d*\.giphy\.com|i\.giphy\.com)$/.test(host) ? url : null;
}

function link(url: string, text: string, className = "qr-link"): HTMLAnchorElement {
  return h("a", { class: className, attrs: { href: url, target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer" }, text });
}

export function messageDate(message: any): Date | null {
  const value = message.timestamp?.toDate?.() ?? message.timestamp;
  let date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    try { date = new Date(Number((BigInt(message.id) >> 22n) + 1420070400000n)); } catch { return null; }
  }
  return Number.isFinite(date.getTime()) ? date : null;
}

export function messageVisualKey(message: any, mine: boolean, text: string): string {
  const seen = new WeakSet<object>();
  return JSON.stringify([currentTimeFormat(), isDeletedMessage(message), message.xrayDeletedAt, mine, text, messageDate(message)?.toISOString(), message.attachments, message.embeds, message.pinned, message.messageReference ?? message.message_reference, message.referencedMessage], (_key, value) => {
    if (typeof value === "bigint") return String(value);
    if (value && typeof value === "object") { if (seen.has(value)) return "[shared]"; seen.add(value); }
    return value;
  });
}

/** No HTML from messages or embeds is ever inserted into the mini-chat. */
export function renderChatMessage(message: any, mine: boolean, text: string): HTMLElement {
  const deleted = isDeletedMessage(message);
  const bubble = h("div", { class: `${mine ? "msg mine" : "msg"}${deleted ? " qr-deleted" : ""}` });
  if (deleted) bubble.append(h("span", { class: "qr-deleted-label", text: "Deleted · retained in this session" }));
  if (deleted && !text && !message.attachments?.length && !message.embeds?.length) bubble.append(h("span", { class: "qr-message-text", text: "Message content was unavailable before deletion." }));
  if (message.pinned) bubble.append(h("span", { class: "qr-pinned", text: "Pinned" }));
  const reference = message.messageReference ?? message.message_reference;
  if (reference) {
    const original = message.referencedMessage?.message ?? message.referencedMessage ?? message.referenced_message;
    bubble.append(h("div", { class: "qr-quote", text: original ? `↳ ${original.author?.globalName ?? original.author?.username ?? "Message"}: ${original.content || "Attachment"}` : "↳ Reply to a message" }));
  }
  const content = h("div", { class: "qr-message-text" });
  const invites = new Set<string>();
  let from = 0;
  for (const match of text.matchAll(/https:\/\/[^\s<>]+|(?:discord\.gg|discord\.com\/invite)\/[\w-]+/g)) {
    const index = match.index!;
    content.append(text.slice(from, index));
    const raw = match[0].replace(/[.,!?;)]+$/, "");
    const url = chatUrl(raw.startsWith("https://") ? raw : `https://${raw}`);
    content.append(url ? link(url, raw) : raw);
    content.append(match[0].slice(raw.length));
    if (url && /^https:\/\/(?:discord\.gg\/|(?:www\.)?discord(?:app)?\.com\/invite\/)[\w-]+/i.test(url)) invites.add(url);
    from = index + match[0].length;
  }
  content.append(text.slice(from));
  if (text) bubble.append(content);

  const displayed = new Set<string>();
  const image = (value: unknown, label: string) => {
    const url = mediaUrl(value);
    if (!url || displayed.has(url)) return;
    displayed.add(url);
    const img = h("img", { class: "qr-media", attrs: { src: url, alt: label, loading: "lazy", referrerpolicy: "no-referrer" } });
    const open = link(url, "", "qr-media-link");
    open.setAttribute("aria-label", `Open ${label}`);
    open.append(img);
    imageLink(open,url,label);
    bubble.append(open);
  };
  const video = (value: unknown, label: string, gif = false): boolean => {
    const url = mediaUrl(value);
    if (!url || displayed.has(url)) return false;
    displayed.add(url);
    const animate = gif && !deleted && !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    bubble.append(h("video", { class: "qr-media", attrs: { src: url, controls: "", preload: "none", playsinline: "", ...(gif ? { loop: "", muted: "" } : {}), ...(animate ? { autoplay: "" } : {}), "aria-label": label } }));
    return true;
  };
  for (const attachment of message.attachments ?? []) {
    const url = chatUrl(attachment.url);
    if (!url) continue;
    const name = attachment.filename ?? attachment.fileName ?? "Attachment";
    const type = attachment.content_type ?? attachment.contentType ?? "";
    const preview = attachment.proxy_url ?? attachment.proxyURL ?? url;
    const parts = h("div", { class: "qr-attachment" }, link(url, `📎 ${name}`));
    if (typeof attachment.size === "number") parts.append(h("span", { class: "qr-file-size", text: `${Math.max(1, Math.ceil(attachment.size / 1024))} KB` }));
    bubble.append(parts);
    const render = () => {
      if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(name)) image(preview, name);
      else if (type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(name)) video(preview, name);
      else if (type.startsWith("audio/")) { const source = mediaUrl(preview); if (source) bubble.append(h("audio", { attrs: { src: source, controls: "", preload: "none", "aria-label": name } })); }
    };
    if (attachment.spoiler || name.startsWith("SPOILER_")) {
      const reveal = h("button", { class: "btn ghost", attrs: { type: "button" }, text: "Reveal spoiler attachment", on: { click: () => { reveal.remove(); render(); } } });
      bubble.append(reveal);
    } else render();
  }
  for (const embed of message.embeds ?? []) {
    const card = h("div", { class: "qr-embed" });
    const url = chatUrl(embed.url);
    if (embed.provider?.name) card.append(h("span", { class: "qr-embed-provider", text: String(embed.provider.name) }));
    if (embed.title) card.append(url ? link(url, String(embed.title)) : h("strong", { text: String(embed.title) }));
    if (embed.description) card.append(h("p", { text: String(embed.description) }));
    for (const field of embed.fields ?? []) card.append(h("div", {}, h("strong", { text: String(field.name ?? "") }), h("div", { text: String(field.value ?? "") })));
    if (card.childNodes.length) bubble.append(card);
    const clip = embed.video;
    const hasVideo = clip && video(clip.proxyURL ?? clip.proxy_url ?? clip.url, embed.title ?? "Embedded video", embed.type === "gifv");
    if (!hasVideo) {
      const picture = embed.image ?? embed.thumbnail;
      if (picture) image(picture.proxyURL ?? picture.proxy_url ?? picture.url, embed.title ?? "Embedded image");
    }
    if (url && !embed.title && !hasVideo && !embed.image && !embed.thumbnail) bubble.append(link(url, url));
  }
  for (const url of invites) bubble.append(link(url, `Discord invite · ${new URL(url).pathname.split("/").filter(Boolean).pop()} → Open invite`, "qr-invite"));
  const date = messageDate(message);
  if (date) bubble.append(h("time", { class: "qr-message-time", attrs: { datetime: date.toISOString(), title: formatDateTime(date) }, text: formatTime(date, { month: "short", day: "numeric" }) }));
  return bubble;
}
