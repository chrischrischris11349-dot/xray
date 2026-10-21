/**
 * Voice controls in the title bar: mute, deafen and camera, next to the
 * window buttons, so you can reach them without the voice panel. They call
 * Discord's own audio actions and mirror its state, so they stay in sync with
 * the panel at the bottom.
 *
 * Camera only lights up while you're in a voice channel with a camera.
 */
import { audioActions, myId, stores, whenStore } from "../discord";
import { h } from "../ui/dom";
import { uiRoot } from "../ui/root";
import { definePlugin } from "./types";

const MIC = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M18 11a6 6 0 0 1-12 0M12 17v3"/></svg>`;
const MIC_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M18 11a6 6 0 0 1-12 0M12 17v3M4 3l16 18"/></svg>`;
const HEADPHONE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="13" width="4" height="7" rx="1.5" fill="currentColor" stroke="none"/><rect x="17.5" y="13" width="4" height="7" rx="1.5" fill="currentColor" stroke="none"/></svg>`;
const HEADPHONE_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="13" width="4" height="7" rx="1.5" fill="currentColor" stroke="none"/><rect x="17.5" y="13" width="4" height="7" rx="1.5" fill="currentColor" stroke="none"/><path d="M3 3l18 18"/></svg>`;
const CAM = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 6h10a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/></svg>`;
const CAM_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 6h10a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path fill="none" stroke="var(--xr-panel, #0b0b0d)" stroke-width="2.4" d="M3 3l18 18"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M3 3l18 18"/></svg>`;

export default definePlugin({
  id: "voiceBar",
  name: "Title Bar Voice Controls",
  description: "Mute, deafen and camera buttons in the title bar, next to the window buttons, always in reach.",
  category: "Voice",
  impact: "light",
  impactReason: "Three buttons that mirror Discord's own",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    // Plugins start at document-start, before <html> exists; wait for the document.
    if (document.readyState === "loading") {
      let stopped = false;
      ctx.onStop(() => (stopped = true));
      document.addEventListener("DOMContentLoaded", () => !stopped && mount(ctx), { once: true });
    } else {
      mount(ctx);
    }
  },
});

/** The bar lives in xray's shadow root, so its styles are in ui/styles.ts (`.xray-vbar`). */
function mount(ctx: { onStop(fn: () => void): void }): void {
    const read = () => {
      const m = stores.mediaEngine;
      let inVoice = false;
      try {
        const me = myId();
        inVoice = !!(me && stores.voiceStates?.getVoiceStateForUser?.(me)?.channelId);
      } catch {
        inVoice = false;
      }
      try {
        return {
          muted: !!m?.isSelfMute?.(),
          deafened: !!m?.isSelfDeaf?.(),
          video: !!m?.isVideoEnabled?.(),
          hasCam: inVoice && !!m?.hasVideoDevice?.(),
        };
      } catch {
        return { muted: false, deafened: false, video: false, hasCam: false };
      }
    };

    const mute = h("button", { attrs: { type: "button", "aria-label": "Mute", title: "Mute (M)" }, trustedHtml: MIC });
    const deafen = h("button", { attrs: { type: "button", "aria-label": "Deafen", title: "Deafen" }, trustedHtml: HEADPHONE });
    const cam = h("button", { class: "cam", attrs: { type: "button", "aria-label": "Camera", title: "Turn camera on" }, trustedHtml: CAM });
    mute.addEventListener("click", () => audioActions()?.toggleSelfMute?.());
    deafen.addEventListener("click", () => audioActions()?.toggleSelfDeaf?.());
    cam.addEventListener("click", () => audioActions()?.setVideoEnabled?.(!stores.mediaEngine?.isVideoEnabled?.()));

    const bar = h("div", { class: "xray-vbar", attrs: { role: "group", "aria-label": "Voice controls" } }, mute, deafen, cam);
    uiRoot().append(bar);
    // Tells the theme to reserve room for these in Discord's top bar.
    document.documentElement.setAttribute("data-xray-vbar", "");

    const render = () => {
      const s = read();
      mute.setAttribute("aria-pressed", String(s.muted || s.deafened));
      mute.innerHTML = s.muted || s.deafened ? MIC_OFF : MIC;
      deafen.setAttribute("aria-pressed", String(s.deafened));
      deafen.innerHTML = s.deafened ? HEADPHONE_OFF : HEADPHONE;
      cam.setAttribute("aria-pressed", String(s.video));
      cam.innerHTML = s.video ? CAM_OFF : CAM;
      cam.toggleAttribute("disabled", !s.hasCam && !s.video);
      cam.title = s.video ? "Turn camera off" : s.hasCam ? "Turn camera on" : "Join a voice channel to use your camera";
    };
    render();

    // The voice stores load after the page; attach once each exists.
    for (const name of ["MediaEngineStore", "VoiceStateStore"]) {
      whenStore(name, (s) => {
        if (typeof s?.addChangeListener !== "function") return;
        s.addChangeListener(render);
        ctx.onStop(() => s.removeChangeListener(render));
        render();
      });
    }
    ctx.onStop(() => {
      bar.remove();
      document.documentElement.removeAttribute("data-xray-vbar");
    });
}
