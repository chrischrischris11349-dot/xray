/** A capture stays local until explicitly accepted. No frame copying or polling. */
export interface SharePreviewSettings {
  frameRate: string;
  resolution: string;
  /** The picker's own choices, so a preview change stays a valid saved setting. */
  frameRates: readonly string[];
  resolutions: readonly string[];
  configure(stream: MediaStream, settings: { frameRate: string; resolution: string }): Promise<void>;
}
export function confirmSharePreview(initial: MediaStream, choose: () => Promise<MediaStream>, settings?: SharePreviewSettings): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let current = initial, closed = false, choosing = false, configuring = false;
    const stop = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Preview screen share");
    dialog.style.cssText = "width:min(680px,90vw);padding:20px;border:1px solid var(--background-modifier-accent,#444);border-radius:10px;background:var(--background-floating,#22262a);color:var(--text-normal,#eee);font:14px var(--font-primary,Segoe UI);box-shadow:0 24px 70px #0009";
    const title = document.createElement("h2"); title.textContent = "Preview screen share"; title.style.margin = "0 0 8px";
    const status = document.createElement("p"); status.setAttribute("role", "status");
    const video = document.createElement("video"); video.muted = true; video.autoplay = true; video.playsInline = true;
    video.setAttribute("aria-label", "Selected screen or application preview");
    video.style.cssText = "display:block;width:100%;height:min(360px,45vh);object-fit:contain;background:#101112;border-radius:6px";
    const controls=document.createElement("div");controls.style.cssText="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:12px";
    const select=(label:string,values:readonly string[],selected:string,suffix:string)=>{
      const holder=document.createElement("label");holder.style.cssText="display:flex;flex:1;min-width:120px;flex-direction:column;gap:5px";holder.textContent=label;
      const input=document.createElement("select");input.setAttribute("aria-label",label);input.style.cssText="min-height:32px;padding:5px 8px;border:1px solid var(--background-modifier-accent,#555);border-radius:6px;background:var(--background-secondary,#16191d);color:inherit;font:inherit";
      for(const value of [...new Set([...values,selected])]){const option=document.createElement("option");option.value=value;option.textContent=value+suffix;input.append(option);}input.value=selected;holder.append(input);controls.append(holder);return input;
    };
    const resolution=settings?select("Capture resolution",settings.resolutions,settings.resolution,"p"):undefined;
    const frameRate=settings?select("Capture FPS",settings.frameRates,settings.frameRate," FPS"):undefined;
    const audioLabel=document.createElement("label");audioLabel.style.cssText="display:flex;align-items:center;gap:8px;min-height:32px";
    const audioToggle=document.createElement("input");audioToggle.type="checkbox";audioToggle.setAttribute("aria-label","Share captured audio");
    // Undefined until the person toggles it: audio granted in the system picker is shared by default,
    // including on a replacement source picked to get audio after a silent first choice.
    let shareAudio:boolean|undefined;
    audioLabel.append(audioToggle,document.createTextNode("Share captured audio"));controls.append(audioLabel);
    const help=document.createElement("p");help.style.cssText="font-size:12px;line-height:1.45;opacity:.8;margin:8px 0";
    help.textContent="Quality is bounded by Discord and your source. Audio needs permission in the system/share picker; changing its source requires choosing again. Your microphone is not added. Nothing is shared until you confirm.";
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:16px";
    const button = (label: string, action: () => void, primary = false) => {
      const element = document.createElement("button"); element.type = "button"; element.textContent = label;
      element.style.cssText = "min-height:36px;padding:8px 14px;border:1px solid #777;border-radius:6px;background:var(--background-secondary,#30343a);color:inherit;font:inherit;cursor:pointer";
      // The likely action carries Discord's brand fill (white on #5865f2 is 4.6:1).
      if (primary) Object.assign(element.style, { background: "var(--button-filled-brand-background,var(--brand-500,#5865f2))", borderColor: "transparent", color: "var(--button-filled-brand-text,#fff)", fontWeight: "600" });
      element.onclick = action; actions.append(element); return element;
    };
    // Inherited text colour hides the browser's own disabled look, so dim busy controls explicitly.
    const setEnabled = (element: HTMLButtonElement | HTMLSelectElement | HTMLInputElement | undefined, enabled: boolean, shown: HTMLElement | undefined = element) => {
      if (!element) return; element.disabled = !enabled;
      if (shown) { shown.style.opacity = enabled ? "" : ".5"; shown.style.cursor = enabled ? "" : "default"; }
    };
    const ended = () => cancel();
    const clean = () => { closed = true; current.getVideoTracks().forEach(t => t.removeEventListener("ended", ended)); video.pause(); video.srcObject = null; dialog.remove(); };
    const cancel = () => { if (closed) return; clean(); stop(current); reject(new DOMException("Screen share cancelled", "NotAllowedError")); };
    const updateStatus = () => {
      const track = current.getVideoTracks()[0], size = track?.getSettings();
      const fps=Number(size?.frameRate),rate=Number.isFinite(fps)&&fps>0?` · ${Math.round(fps*10)/10} FPS capture`:" · Capture FPS unavailable";
      const audio=current.getAudioTracks?.().filter(track=>track.readyState==="live").length??0;
      const sound=!audio?"No audio track supplied. Enable audio in the system picker or choose a supported source.":audioToggle.checked?"Captured audio will be shared; the preview stays muted to prevent feedback.":"Captured audio is muted for this share.";
      status.textContent = `${track?.label || "Selected source"}${size?.width ? ` · ${size.width} × ${size.height}` : ""}${rate}. ${sound} Preview only — choose Share this source to go live.`;
      const idle=!choosing&&!configuring;
      setEnabled(audioToggle,idle&&audio>0,audioLabel);
      for(const control of [share,change,resolution,frameRate])setEnabled(control,idle);
    };
    const applyAudio=()=>{const tracks=current.getAudioTracks?.()??[];audioToggle.checked=tracks.length>0&&(shareAudio??true);for(const track of tracks)track.enabled=audioToggle.checked;};
    const bind = () => {
      applyAudio();
      video.srcObject = current; void video.play().catch(() => { if(!closed)status.textContent = "Preview playback is unavailable. Choose another source or cancel."; });
      updateStatus();
      current.getVideoTracks().forEach(t => t.addEventListener("ended", ended, { once: true }));
    };
    audioToggle.addEventListener("change",()=>{shareAudio=audioToggle.checked;applyAudio();updateStatus();});
    const configure=async()=>{
      if(!settings||!resolution||!frameRate||closed||choosing||configuring)return;
      configuring=true;updateStatus();status.textContent="Applying capture settings…";
      let failed=false;
      try{await settings.configure(current,{frameRate:frameRate.value,resolution:resolution.value});}catch{failed=true;}
      finally{configuring=false;if(!closed){updateStatus();if(failed)status.textContent="This source could not apply the quality change. Choose another source to use the selected settings, or keep the current capture.";}}
    };
    resolution?.addEventListener("change",()=>void configure());frameRate?.addEventListener("change",()=>void configure());
    button("Cancel", cancel);
    // The ellipsis says this opens the system picker.
    const change = button("Choose another source…", () => {
      if (choosing || configuring || closed) return;
      choosing = true; for (const control of [share, change, resolution, frameRate]) setEnabled(control, false);
      // Call directly from this click to preserve native user activation.
      let pending: Promise<MediaStream>;
      try { pending = choose(); } catch (error) { pending = Promise.reject(error); }
      void pending.then(next => {
        if (closed) { stop(next); return; }
        current.getVideoTracks().forEach(t => t.removeEventListener("ended", ended)); stop(current); current = next; choosing = false; bind();
      }, () => {
        // Re-enable the controls first, so the status keeps this message instead of the summary.
        choosing = false; if (!closed) { updateStatus(); status.textContent = "Source selection cancelled or unavailable. Your previous source is still selected."; }
      });
    });
    const share = button("Share this source", () => {
      if (closed || choosing || configuring) return;
      if (!current.getVideoTracks().some(track => track.readyState === "live")) { cancel(); return; }
      clean(); resolve(current);
    }, true);
    dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
    dialog.append(title, status, video, controls, help, actions); document.body.append(dialog);
    try { dialog.showModal(); bind(); share.focus(); } catch (error) { clean(); stop(current); reject(error); }
  });
}
