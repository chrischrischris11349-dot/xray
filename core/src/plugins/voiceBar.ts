/**
 * Voice controls in the title bar: mute, deafen and camera, next to the
 * window buttons, so you can reach them without the voice panel. They call
 * Discord's own audio actions and mirror its state, so they stay in sync with
 * the panel at the bottom.
 *
 * Camera only lights up while you're in a voice channel with a camera.
 */
import { audioActions, voiceActions, myId, stores, whenStore } from "../discord";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";
import { uiRoot } from "../ui/root";
import { definePlugin } from "./types";
import { fakeVoice } from "./fakeDeafen";
import { invoke } from "../shell/bridge";

export function toggleVoiceControl(action: "mute" | "deafen" | "leave"): void {
  if (action === "leave") { if (myId() && stores.voiceStates?.getVoiceStateForUser?.(myId())?.channelId) voiceActions()?.disconnect?.(); }
  else if (action === "mute") audioActions()?.toggleSelfMute?.();
  else if (fakeVoice.active || fakeVoice.usesTopButton) fakeVoice.set(!fakeVoice.active);
  else audioActions()?.toggleSelfDeaf?.();
}

const MIC = icon("mic");
const MIC_OFF = icon("micOff");
const HEADPHONE = icon("headphones");
const HEADPHONE_OFF = icon("headphoneOff");
const CAM = icon("video");
const CAM_OFF = icon("videoOff");

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
          inVoice,
        };
      } catch {
        return { muted: false, deafened: false, video: false, hasCam: false, inVoice: false };
      }
    };

    const mute = h("button", { attrs: { type: "button", "aria-label": "Mute", title: "Mute (M)" }, trustedHtml: MIC });
    const deafen = h("button", { attrs: { type: "button", "aria-label": "Deafen", title: "Deafen" }, trustedHtml: HEADPHONE });
    const cam = h("button", { class: "cam", attrs: { type: "button", "aria-label": "Camera", title: "Turn camera on" }, trustedHtml: CAM });
    mute.addEventListener("click", () => audioActions()?.toggleSelfMute?.());
    deafen.addEventListener("click", () => toggleVoiceControl("deafen"));
    cam.addEventListener("click", () => audioActions()?.setVideoEnabled?.(!stores.mediaEngine?.isVideoEnabled?.()));

    const fakeState=h('span',{class:'xray-fd-state',attrs:{role:'status','aria-live':'polite'},text:'FD active'});
    const bar = h("div", { class: "xray-vbar", attrs: { role: "group", "aria-label": "Voice controls" } }, fakeState,mute, deafen, cam);
    uiRoot().append(bar);
    // Tells the theme to reserve room for these in Discord's top bar.
    document.documentElement.setAttribute("data-xray-vbar", "");

    let nativeState = "";
    const render = () => {
      const s = read();
      mute.setAttribute("aria-pressed", String(s.muted || s.deafened));
      mute.innerHTML = s.muted || s.deafened ? MIC_OFF : MIC;
      const deaf = s.deafened || fakeVoice.active;
      fakeState.hidden=!fakeVoice.active;
      document.documentElement.toggleAttribute('data-xray-fd-active',fakeVoice.active);
      fakeState.title='Fake Deafen active · local audio unchanged';
      deafen.setAttribute("aria-pressed", String(deaf));
      deafen.innerHTML = deaf ? HEADPHONE_OFF : HEADPHONE;
      deafen.title = fakeVoice.usesTopButton || fakeVoice.active ? `Fake Deafen ${fakeVoice.active ? "on" : "off"} · local audio stays on` : "Deafen";
      const next = `${s.muted}:${deaf}:${s.inVoice}`;
      if (next !== nativeState) { nativeState = next; void invoke("set_voice_controls",{muted:s.muted,deafened:deaf,connected:s.inVoice}).catch(()=>{nativeState="";}); }
      cam.setAttribute("aria-pressed", String(s.video));
      cam.innerHTML = s.video ? CAM_OFF : CAM;
      cam.toggleAttribute("disabled", !s.hasCam && !s.video);
      cam.title = s.video ? "Turn camera off" : s.hasCam ? "Turn camera on" : "Join a voice channel to use your camera";
    };
    render();
    ctx.onStop(fakeVoice.subscribe(render));

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
      document.documentElement.removeAttribute('data-xray-fd-active');
    });
}
