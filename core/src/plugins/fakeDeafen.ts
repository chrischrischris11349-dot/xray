/**
 * Standalone Fake Deafen. Only outgoing gateway opcode 4 self flags change.
 * No member moderation API, incoming voice-state interception, or local audio
 * setting is touched. Real server mute/deafen remains authoritative.
 */
import { reportEvent } from "../shell/report";
import { icon } from "../ui/icons";
import { definePlugin } from "./types";
import {installLocalDeafenIndicator} from '../voice/localDeafenIndicator';

interface VoiceState {
  channel_id: string | null;
  self_mute: boolean;
  self_deaf: boolean;
  [key: string]: unknown;
}
let running = false;
let faking = false;
let gateway: WebSocket | undefined;
let lastSent: VoiceState | undefined;
let realSend: WebSocket["send"] | undefined;
let topButton = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

function isGateway(ws: WebSocket): boolean {
  try {
    const host = new URL(ws.url).hostname;
    return host.startsWith("gateway") && host.endsWith(".discord.gg");
  } catch { return false; }
}

function faked(state: VoiceState): VoiceState {
  return { ...state, self_deaf: true, self_mute: true };
}

function rewrite(ws: WebSocket, args: unknown[]): void {
  const data = args[0];
  if (typeof data !== "string" || !/"op"\s*:\s*4\s*[,}]/.test(data) || !isGateway(ws)) return;
  let message: { op?: number; d?: VoiceState };
  try { message = JSON.parse(data); } catch { return; }
  const state = message?.d;
  if (message?.op !== 4 || !state || (state.channel_id !== null && typeof state.channel_id !== "string") ||
      typeof state.self_mute !== "boolean" || typeof state.self_deaf !== "boolean") return;
  gateway = ws;
  lastSent = { ...state };
  // Leaving must remain a normal leave. Reconnects replace the socket/state
  // only when Discord sends a new valid voice update on the new connection.
  if (faking && state.channel_id) {
    message.d = faked(state);
    args[0] = JSON.stringify(message);
  }
  notify();
}

function resend(): void {
  if (!gateway || gateway.readyState !== WebSocket.OPEN || !lastSent?.channel_id || !realSend) return;
  realSend.call(gateway, JSON.stringify({ op: 4, d: faking ? faked(lastSent) : lastSent }));
}

/** No server-side state or audio controls are exposed by this feature. */
export const fakeVoice = {
  get available(): boolean { return running; },
  get active(): boolean { return faking; },
  get usesTopButton(): boolean { return running && topButton; },
  get inVoice(): boolean { return gateway?.readyState === WebSocket.OPEN && !!lastSent?.channel_id; },
  set(on: boolean): void {
    if (!running || on === faking) return;
    const previous = faking;
    faking = on;
    try { resend(); }
    catch (error) { faking = previous; notify(); throw error; }
    reportEvent({ kind: "voice", source: "fakeDeafen", text: `Fake deafen ${on ? "on" : "off"}`, detail: { on, inVoice: fakeVoice.inVoice } });
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** A mask icon: the Fake Deafen button in the voice panel. */
const MASK_ICON = icon("glasses", 20);

/**
 * Puts a Fake Deafen toggle in Discord's voice panel, next to mute and
 * deafen, so it's one click before a call. It reflects whether faking is on
 * and updates when you toggle it anywhere.
 */
function installVoicePanelButton(ctx: { css(c: string): void; watch(sel: string, fn: (el: Element) => void): void; onStop(fn: () => void): void }): void {
  ctx.css(`
    .xray-fd { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; margin-right: 8px; flex: none;
      border: 0; border-radius: 8px; background: transparent; color: var(--interactive-normal, #b5bac1); cursor: pointer;
      transition: background-color 120ms ease, color 120ms ease; }
    .xray-fd:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
    .xray-fd[aria-pressed="true"] { background: var(--background-modifier-selected, rgba(255,255,255,.12)); color: var(--interactive-active, #f2f3f5); }
  `);
  const update = (button: HTMLElement) => {
    const on = faking;
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute('aria-label',on?'Fake Deafen on':'Fake Deafen off');
    button.innerHTML=on?icon('headphoneOff',20):MASK_ICON;
    button.title = on ? "Fake Deafen active · local audio unchanged" : "Enable Fake Deafen";
  };
  // Read from the page each time: Discord rebuilds the panel, and old buttons go with it.
  const unsub = fakeVoice.subscribe(() => document.querySelectorAll<HTMLElement>(".xray-fd").forEach(update));
  ctx.watch('section[class*="panels_"] [class*="buttons_"]', (bar) => {
    if (bar.querySelector(".xray-fd")) return;
    const button = document.createElement("button");
    button.className = "xray-fd";
    button.type = "button";
    button.setAttribute("aria-label", "Fake Deafen");
    button.innerHTML = MASK_ICON;
    button.addEventListener("click", () => fakeVoice.set(!faking));
    bar.insertBefore(button, bar.firstChild);
    update(button);
  });
  ctx.onStop(() => {
    unsub();
    document.querySelectorAll(".xray-fd").forEach((el) => el.remove());
  });
}

export default definePlugin({
  id: "fakeDeafen",
  name: "Fake Deafen",
  description: "A standalone toggle: appear self-deafened while keeping local audio unchanged. Never server-mutes or server-deafens you. Starts off each launch.",
  category: "Voice",
  impact: "light",
  impactReason: "Only rewrites outgoing voice self flags",
  needsReload: false,
  enabledByDefault: true,
  options: {
    topButton: { type: "boolean", label: "Top and taskbar deafen buttons use Fake Deafen", description: "Keeps local audio on. Turn off to use normal deafen on these buttons.", default: true },
    shortcut: { type: "boolean", label: "Ctrl+Shift+Q toggles it", description: "Works while XRay is focused. Global bindings are under Hotkeys.", default: true },
  },
  start(ctx) {
    topButton = ctx.options.topButton === true;
    faking = false;
    gateway = undefined;
    lastSent = undefined;
    realSend = WebSocket.prototype.send;
    running = true;
    ctx.patch(WebSocket.prototype, "send", { before: rewrite });
    if (typeof ctx.css === "function" && typeof ctx.watch === "function") {
      installVoicePanelButton(ctx);
      installLocalDeafenIndicator(ctx,()=>faking,fakeVoice.subscribe);
      ctx.onKey((event) => {
        if (!ctx.options.shortcut || event.repeat || !event.ctrlKey || !event.shiftKey || event.altKey || event.code !== "KeyQ") return false;
        fakeVoice.set(!faking);
        return true;
      });
    }
    const restore = () => {
      if (!faking) return;
      faking = false;
      try { resend(); } catch { /* socket may already be closing */ }
      notify();
    };
    window.addEventListener("pagehide", restore);
    ctx.onStop(() => {
      window.removeEventListener("pagehide", restore);
      restore();
      running = false;
      gateway = undefined;
      lastSent = undefined;
      realSend = undefined;
      notify();
    });
  },
});
