/** A capture stays local until explicitly accepted. No frame copying or polling. */
export function confirmSharePreview(initial: MediaStream, choose: () => Promise<MediaStream>): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let current = initial, closed = false, choosing = false;
    const stop = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Preview screen share");
    dialog.style.cssText = "width:min(680px,90vw);padding:20px;border:1px solid var(--background-modifier-accent,#444);border-radius:10px;background:var(--background-floating,#22262a);color:var(--text-normal,#eee);font:14px var(--font-primary,Segoe UI);box-shadow:0 24px 70px #0009";
    const title = document.createElement("h2"); title.textContent = "Preview screen share"; title.style.margin = "0 0 8px";
    const status = document.createElement("p"); status.setAttribute("role", "status");
    const video = document.createElement("video"); video.muted = true; video.autoplay = true; video.playsInline = true;
    video.setAttribute("aria-label", "Selected screen or application preview");
    video.style.cssText = "display:block;width:100%;height:min(360px,45vh);object-fit:contain;background:#101112;border-radius:6px";
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:16px";
    const button = (label: string, action: () => void) => {
      const element = document.createElement("button"); element.type = "button"; element.textContent = label;
      element.style.cssText = "min-height:36px;padding:8px 14px;border:1px solid #777;border-radius:6px;background:var(--background-secondary,#30343a);color:inherit;font:inherit;cursor:pointer";
      element.onclick = action; actions.append(element); return element;
    };
    const ended = () => cancel();
    const clean = () => { closed = true; current.getVideoTracks().forEach(t => t.removeEventListener("ended", ended)); video.pause(); video.srcObject = null; dialog.remove(); };
    const cancel = () => { if (closed) return; clean(); stop(current); reject(new DOMException("Screen share cancelled", "NotAllowedError")); };
    const bind = () => {
      video.srcObject = current; void video.play().catch(() => { status.textContent = "Preview playback is unavailable. Choose another source or cancel."; });
      const track = current.getVideoTracks()[0], size = track?.getSettings();
      const audio=current.getAudioTracks?.().filter(track=>track.readyState==="live").length??0;
      status.textContent = `${track?.label || "Selected source"}${size?.width ? ` · ${size.width} × ${size.height}` : ""}. ${audio?"Audio capture available; preview is muted to prevent feedback.":"No audio track supplied. Enable audio in the system picker or choose a supported source."} Preview only — choose Share this source to go live.`;
      current.getVideoTracks().forEach(t => t.addEventListener("ended", ended, { once: true }));
    };
    button("Cancel", cancel);
    const change = button("Choose another source", () => {
      if (choosing || closed) return;
      choosing = true; change.disabled = share.disabled = true;
      // Call directly from this click to preserve native user activation.
      let pending: Promise<MediaStream>;
      try { pending = choose(); } catch (error) { pending = Promise.reject(error); }
      void pending.then(next => {
        if (closed) { stop(next); return; }
        current.getVideoTracks().forEach(t => t.removeEventListener("ended", ended)); stop(current); current = next; bind();
      }).catch(() => { if (!closed) status.textContent = "Source selection cancelled or unavailable. Your previous source is still selected."; })
        .finally(() => { choosing = false; if (!closed) change.disabled = share.disabled = false; });
    });
    const share = button("Share this source", () => {
      if (closed || choosing) return;
      if (!current.getVideoTracks().some(track => track.readyState === "live")) { cancel(); return; }
      clean(); resolve(current);
    });
    dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
    dialog.append(title, status, video, actions); document.body.append(dialog);
    try { dialog.showModal(); bind(); share.focus(); } catch (error) { clean(); stop(current); reject(error); }
  });
}
