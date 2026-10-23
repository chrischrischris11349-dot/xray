import { invoke } from "../shell/bridge";
import { showDialog } from "./dialog";

const MAX_BYTES = 20 * 1024 * 1024;
export function photoAttachment(attachment: any): boolean {
  return /^image\//.test(attachment?.content_type ?? attachment?.contentType ?? "") || /\.(jpe?g|png|webp|gif|avif|heic|heif|tiff?)$/i.test(attachment?.filename ?? attachment?.fileName ?? "");
}
export function metadataUrl(raw: unknown): string {
  const url = new URL(String(raw));
  if (url.protocol !== "https:" || url.username || url.password || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) || !url.pathname.startsWith("/attachments/")) throw new Error("Metadata can be read from original Discord attachments or a photo you choose locally.");
  return url.href;
}
async function attachmentBytes(attachment: any): Promise<Uint8Array> {
  if (attachment.size > MAX_BYTES) throw new Error("Choose a photo smaller than 20 MB for metadata inspection.");
  const url = metadataUrl(attachment.url);
  let response: Response;
  try { response = await fetch(url, { credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) }); }
  catch {
    // WebView CORS may block the original. Native fetch remains credential-free and size-capped.
    const native = await invoke("web_fetch", { method: "GET", url, headers: [], body: null }) as { status: number; body: string };
    if (native.status !== 200) throw new Error("The original attachment is unavailable. Reopen the conversation to refresh expired links, or choose the original file.");
    if (native.body.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error("Photo exceeds the 20 MB metadata limit.");
    return Uint8Array.from(atob(native.body), c => c.charCodeAt(0));
  }
  if (!response.ok || !response.body) throw new Error("The attachment could not be read. Reopen the conversation to refresh its link.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) throw new Error("Photo exceeds the 20 MB metadata limit."); chunks.push(value); } }
  finally { await reader.cancel(); }
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
}
export async function readPhotoMetadata(input: File | Uint8Array): Promise<Record<string, unknown>> {
  if (input instanceof Uint8Array ? input.length > MAX_BYTES : input.size > MAX_BYTES) throw new Error("Choose a photo smaller than 20 MB.");
  const { parse } = await import("exifr");
  return await parse(input, { tiff: true, xmp: true, iptc: true, icc: true, jfif: true, ihdr: true, mergeOutput: false, makerNote: false, userComment: true, chunkLimit: 100 }) ?? {};
}
export async function showPhotoMetadata(input?: File | any): Promise<void> {
  if (!input) {
    const picker = document.createElement("input"); picker.type = "file"; picker.accept = "image/*,.heic,.heif,.tif,.tiff";
    picker.onchange = () => { const file = picker.files?.[0]; if (file) void showPhotoMetadata(file); }; picker.click(); return;
  }
  let cancelled = false;
  showDialog({ title: "Reading photo metadata…", body: "Reading the original image on demand. Nothing is saved to disk or sent to a metadata service.", actions: [{ label: "Cancel" }], onClose: () => { cancelled = true; } });
  try {
    const local = input instanceof File;
    const info = local ? { name: input.name, bytes: input.size, type: input.type, fileModifiedAt: new Date(input.lastModified).toISOString() } : { name: input.filename ?? input.fileName, bytes: input.size, width: input.width, height: input.height, type: input.content_type ?? input.contentType };
    const metadata = await readPhotoMetadata(local ? input : await attachmentBytes(input));
    if (cancelled) return;
    const code = JSON.stringify({ file: info, metadata }, (_key, value) => ArrayBuffer.isView(value) ? `[binary field: ${value.byteLength} bytes]` : value, 2);
    showDialog({ title: "Photo metadata", body: "Read on this device; the photo and extracted fields are not saved or uploaded. EXIF may include camera, capture time and GPS if retained. Discord often strips metadata. Tags are file claims, not verified identity, location or IP address. File modified time is not capture time.", code: code.length > 100000 ? `${code.slice(0, 100000)}\n… display capped at 100,000 characters` : code });
  } catch (error) { if (!cancelled) showDialog({ title: "Photo metadata unavailable", body: error instanceof Error ? error.message : "This image has no supported metadata, or its format could not be read." }); }
}
