/**
 * Fake Deafen: everyone else sees you muted and deafened while you keep
 * hearing the call.
 *
 * Discord reports your voice state to its gateway with an opcode 4 message.
 * While faking, xray rewrites that message's mute and deafen flags on the way
 * out. Your own client never learns, so audio keeps playing. Switching faking
 * on or off resends the last real voice state, so the change shows at once.
 *
 * This works on the gateway socket itself rather than Discord's modules, so
 * Discord renaming its internals can't break it. It needs no reload.
 */
import { definePlugin } from "./types";

const VOICE_STATE_UPDATE = 4;

interface VoiceState {
  channel_id: string | null;
  self_mute: boolean;
  self_deaf: boolean;
  [key: string]: unknown;
}

let running = false;
let faking = false;
let gateway: WebSocket | undefined;
/** The real voice state Discord last sent, before any rewriting. */
let lastSent: VoiceState | undefined;
let realSend: WebSocket["send"] | undefined;
const listeners = new Set<() => void>();

function isGateway(ws: WebSocket): boolean {
  try {
    const host = new URL(ws.url).hostname;
    return host.startsWith("gateway") && host.endsWith(".discord.gg");
  } catch {
    return false;
  }
}

function rewrite(ws: WebSocket, args: unknown[]): void {
  const data = args[0];
  // Cheap checks first: this runs for every gateway message Discord sends.
  if (typeof data !== "string" || !data.includes('"op":4') || !isGateway(ws)) return;
  let message: { op?: number; d?: VoiceState };
  try {
    message = JSON.parse(data);
  } catch {
    return;
  }
  if (message.op !== VOICE_STATE_UPDATE || !message.d) return;
  gateway = ws;
  lastSent = { ...message.d };
  if (!faking) return;
  message.d.self_mute = true;
  message.d.self_deaf = true;
  args[0] = JSON.stringify(message);
}

function resend(): void {
  if (!gateway || gateway.readyState !== WebSocket.OPEN || !lastSent?.channel_id || !realSend) return;
  const d = faking ? { ...lastSent, self_mute: true, self_deaf: true } : lastSent;
  realSend.call(gateway, JSON.stringify({ op: VOICE_STATE_UPDATE, d }));
}

/** Controls for the UI. Faking always starts off when xray starts. */
export const fakeVoice = {
  get available(): boolean {
    return running;
  },
  get active(): boolean {
    return faking;
  },
  /** True once Discord has reported you in a voice channel since xray started. */
  get inVoice(): boolean {
    return !!lastSent?.channel_id;
  },
  set(on: boolean): void {
    if (!running || on === faking) return;
    faking = on;
    resend();
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export default definePlugin({
  id: "fakeDeafen",
  name: "Fake Deafen",
  description: "Look muted and deafened to everyone while you keep listening.",
  category: "Voice",
  impact: "light",
  impactReason: "Only reads the voice updates you send",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    realSend = WebSocket.prototype.send;
    running = true;
    ctx.patch(WebSocket.prototype, "send", { before: rewrite });
    ctx.onStop(() => {
      fakeVoice.set(false);
      running = false;
      listeners.forEach((listener) => listener());
    });
  },
});
