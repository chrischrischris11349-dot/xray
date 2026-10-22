/*
 * Runs Equicord's userscript build inside xray's window (see README.md).
 *
 * A userscript manager would give the script two things: `unsafeWindow` (the
 * page's own window) and `GM_xmlhttpRequest` (fetches that ignore the page's
 * content security policy). xray's script already runs in the page, so the
 * first is just `window`. The second goes through xray's Rust side
 * (src-tauri/src/webfetch.rs), which only reaches public https sites.
 */
(() => {
  // Discord's iframes (embeds, activities) don't get a second copy.
  if (window.top !== window) return;

  const unsafeWindow = window;

  /** Reads any body fetch() accepts (string, Blob, FormData, buffer...) as base64, plus its content type. */
  async function encodeBody(data) {
    const response = new Response(data);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { body: btoa(binary), type: response.headers.get("content-type") };
  }

  function GM_xmlhttpRequest(details) {
    let aborted = false;
    (async () => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (!invoke) throw new Error("xray's bridge isn't available");
      const url = new URL(String(details.url), location.href);
      // Discord's own site is allowed from the page and keeps its context; only outside sites need the bridge.
      if (url.origin === location.origin) return sameOrigin(details, url, () => aborted);
      const headers = Object.entries(details.headers ?? {}).map(([name, value]) => [name, String(value)]);
      let body;
      if (details.data != null) {
        const encoded = await encodeBody(details.data);
        body = encoded.body;
        if (encoded.type && !headers.some(([name]) => name.toLowerCase() === "content-type")) headers.push(["Content-Type", encoded.type]);
      }
      const result = await invoke("web_fetch", { method: details.method ?? "GET", url: url.href, headers, body });
      if (aborted) return;
      const raw = atob(result.body);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      deliver(details, bytes, result);
    })().catch((error) => {
      if (!aborted) details.onerror?.({ readyState: 4, status: 0, statusText: String(error?.message ?? error), error: String(error) });
    });
    return { abort: () => (aborted = true) };
  }

  async function sameOrigin(details, url, aborted) {
    const response = await fetch(url, { method: details.method ?? "GET", headers: details.headers, body: details.data ?? undefined });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (aborted()) return;
    const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`).join("\r\n");
    deliver(details, bytes, { status: response.status, statusText: response.statusText, headers, finalUrl: response.url });
  }

  /** Hands a finished response to the caller in the shape GM_xmlhttpRequest uses. */
  function deliver(details, bytes, result) {
    const type = /^content-type:\s*(.+)$/im.exec(result.headers)?.[1]?.trim() ?? "";
    const text = () => new TextDecoder().decode(bytes);
    const response = { readyState: 4, status: result.status, statusText: result.statusText, responseHeaders: result.headers, finalUrl: result.finalUrl };
    switch (details.responseType) {
      case "blob":
        response.response = new Blob([bytes], { type });
        break;
      case "arraybuffer":
        response.response = bytes.buffer;
        break;
      case "json":
        response.response = JSON.parse(text());
        break;
      default:
        response.response = response.responseText = text();
    }
    details.onload?.(response);
  }

  // The userscript, unchanged, in its own function so its "use strict" applies.
  (() => {
/*USERSCRIPT*/
  })();
})();
