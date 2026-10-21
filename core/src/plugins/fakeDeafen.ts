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
 *
 * Server deafen (an option, off by default): in a server where you're
 * allowed to deafen members, xray also server-deafens you, so the red
 * server-deafen icon shows too. Opcode 4 can't carry that, so it's a real
 * request through Discord's own "Server Deafen" action, and it shows in the
 * server's audit log as you deafening yourself. xray keeps your own client
 * from acting on it, so audio keeps playing as long as Discord's voice server
 * keeps sending it. It's undone when faking stops, when you leave or switch
 * servers, when the plugin stops, and (if xray closed mid-call) the next time
 * xray starts.
 */
import { stores } from "../discord";
import { warn } from "../env";
import { pluginState, save } from "../settings";
import { reportEvent } from "../shell/report";
import { filters, find, findByCode } from "../webpack";
import { icon } from "../ui/icons";
import { definePlugin } from "./types";

const VOICE_STATE_UPDATE = 4;
/** Discord's permission bits for muting and deafening members. */
const MUTE_MEMBERS = 1n << 22n;
const DEAFEN_MEMBERS = 1n << 23n;
const PLUGIN_ID = "fakeDeafen";

interface VoiceState {
  guild_id?: string | null;
  channel_id: string | null;
  self_mute: boolean;
  self_deaf: boolean;
  [key: string]: unknown;
}

type VoiceAction = (guildId: string, userId: string, on: boolean) => unknown;
interface VoiceActions {
  deaf: VoiceAction;
  mute: VoiceAction;
}
/** The server-side state xray is holding you in: deafened and/or muted, in one server. */
interface ServerState {
  guild: string;
  deaf: boolean;
  mute: boolean;
}

let running = false;
let faking = false;
let gateway: WebSocket | undefined;
/** The real voice state Discord last sent, before any rewriting. */
let lastSent: VoiceState | undefined;
let realSend: WebSocket["send"] | undefined;
let options: { readonly serverDeafen: boolean; readonly serverMute: boolean } | undefined;
/** What xray is currently holding server-side, if anything. Also saved, in case xray closes mid-call. */
let applied: ServerState | null = null;
let syncQueued = false;
let warnedNoAction = false;
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
  // Joining, leaving or switching servers can change where you should be held.
  queueServerSync();
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

/** Discord's own "Server Mute/Deafen" actions: `setServerMute`/`setServerDeaf(guildId, userId, on)`. */
function serverActions(): VoiceActions | undefined {
  const isActions = filters.byOwnMethods("setServerMute", "setServerDeaf");
  let actions = find(isActions);
  if (!actions) {
    // They can sit in a chunk Discord only loads when you open a member's menu.
    const loaded = findByCode("setServerDeaf", "setServerMute", "deaf:");
    if (loaded && isActions(loaded)) actions = loaded;
    else if (loaded && typeof loaded === "object") actions = Object.values(loaded).find((value) => isActions(value));
  }
  if (!actions) {
    if (!warnedNoAction) {
      warnedNoAction = true;
      warn("Discord's Server Mute/Deafen actions weren't found, so Fake Deafen can't show server mute or deafen");
    }
    return undefined;
  }
  return {
    deaf: (guildId, userId, on) => actions.setServerDeaf(guildId, userId, on),
    mute: (guildId, userId, on) => actions.setServerMute(guildId, userId, on),
  };
}

function canDo(bit: bigint, channelId: string): boolean {
  try {
    const channel = stores.channels?.getChannel?.(channelId);
    return !!channel?.guild_id && stores.permissions?.can?.(bit, channel) === true;
  } catch {
    return false;
  }
}

/** The server-side state you should be in right now, or null for none. */
function wanted(): ServerState | null {
  if (!running || !faking || !lastSent?.channel_id) return null;
  const channelId = lastSent.channel_id;
  const guild = lastSent.guild_id ?? stores.channels?.getChannel?.(channelId)?.guild_id;
  if (!guild) return null;
  const deaf = !!options?.serverDeafen && canDo(DEAFEN_MEMBERS, channelId);
  const mute = !!options?.serverMute && canDo(MUTE_MEMBERS, channelId);
  return deaf || mute ? { guild: String(guild), deaf, mute } : null;
}

function same(a: ServerState | null, b: ServerState | null): boolean {
  return a === b || (!!a && !!b && a.guild === b.guild && a.deaf === b.deaf && a.mute === b.mute);
}

function remember(state: ServerState | null): void {
  applied = state;
  (pluginState(PLUGIN_ID).data ??= {}).serverState = state;
  save();
}

/** Later, not inside Discord's socket send: moves you to where `wanted` says. */
function queueServerSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncServer();
  });
}

function syncServer(): void {
  const next = wanted();
  if (same(next, applied)) return;
  const me = stores.users?.getCurrentUser?.()?.id;
  const actions = me ? serverActions() : undefined;
  if (!me || !actions) return;
  const previous = applied;
  // Leaving a server, or switching to another: clear whatever we set there first.
  if (previous && (!next || next.guild !== previous.guild)) {
    if (previous.deaf) call(actions.deaf, previous.guild, me, false);
    if (previous.mute) call(actions.mute, previous.guild, me, false);
  }
  if (next) {
    const base = previous && previous.guild === next.guild ? previous : { deaf: false, mute: false };
    if (next.deaf !== base.deaf) call(actions.deaf, next.guild, me, next.deaf);
    if (next.mute !== base.mute) call(actions.mute, next.guild, me, next.mute);
  }
  remember(next);
  reportEvent({
    kind: "voice",
    source: "fakeDeafen",
    text: next ? `Server ${[next.deaf && "deafen", next.mute && "mute"].filter(Boolean).join(" + ") || "hold"} on` : "Server hold off",
    detail: next ? { guild: next.guild, deaf: next.deaf, mute: next.mute } : { clearedFrom: previous?.guild ?? "" },
  });
  listeners.forEach((listener) => listener());
}

function call(action: VoiceAction, guildId: string, userId: string, on: boolean): void {
  try {
    Promise.resolve(action(guildId, userId, on)).catch((err) => warn(`couldn't ${on ? "set" : "clear"} a server voice state`, err));
  } catch (err) {
    warn(`couldn't ${on ? "set" : "clear"} a server voice state`, err);
  }
}

/** Reads a saved server state, tolerating the older deaf-only shape from before server mute. */
function savedState(): ServerState | null {
  const data = pluginState(PLUGIN_ID).data;
  const raw = data?.serverState as Partial<ServerState> | undefined;
  if (raw && typeof raw.guild === "string") return { guild: raw.guild, deaf: !!raw.deaf, mute: !!raw.mute };
  const legacy = data?.serverDeafenedIn;
  return typeof legacy === "string" ? { guild: legacy, deaf: true, mute: false } : null;
}

/** Undoes a server hold left over from a session that ended mid-call. Retried until Discord is ready. */
function undoLeftover(): boolean {
  const leftover = savedState();
  if (!leftover || same(leftover, applied)) return true;
  const me = stores.users?.getCurrentUser?.()?.id;
  const actions = me ? serverActions() : undefined;
  if (!me || !actions) return false;
  if (leftover.deaf) call(actions.deaf, leftover.guild, me, false);
  if (leftover.mute) call(actions.mute, leftover.guild, me, false);
  if (pluginState(PLUGIN_ID).data) delete pluginState(PLUGIN_ID).data!.serverDeafenedIn;
  remember(null);
  return true;
}

/**
 * Discord tells your own client when you're server-deafened, and the client
 * would then stop playing audio. While xray is the one that deafened you,
 * your client is told you aren't. (Server mute needs no such trick: it only
 * stops you sending audio, which is the point of looking muted.)
 */
function keepHearing(action: { type: string; [key: string]: any }): void {
  if (action.type !== "VOICE_STATE_UPDATES" || !applied?.deaf || !Array.isArray(action.voiceStates)) return;
  const me = stores.users?.getCurrentUser?.()?.id;
  for (const state of action.voiceStates) {
    if (state?.userId === me && state.guildId === applied.guild && state.deaf) state.deaf = false;
  }
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
  /** The server you're shown server-deafened in, if any. */
  get serverDeafenedIn(): string | null {
    return applied?.deaf ? applied.guild : null;
  },
  /** The server you're shown server-muted in, if any. */
  get serverMutedIn(): string | null {
    return applied?.mute ? applied.guild : null;
  },
  set(on: boolean): void {
    if (!running || on === faking) return;
    faking = on;
    reportEvent({ kind: "voice", source: "fakeDeafen", text: `Fake deafen ${on ? "on" : "off"}`, detail: { on, inVoice: !!lastSent?.channel_id } });
    resend();
    syncServer();
    listeners.forEach((listener) => listener());
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
    .xray-fd[aria-pressed="true"] { background: rgba(255,90,90,.16); color: #ff6b5b; }
  `);
  const update = (button: HTMLElement) => {
    const on = faking;
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "Fake Deafen is on — others see you deafened" : "Enable Fake Deafen";
  };
  const buttons = new Set<HTMLElement>();
  const unsub = fakeVoice.subscribe(() => buttons.forEach(update));
  ctx.watch('section[class*="panels_"] [class*="buttons_"]', (bar) => {
    if (bar.querySelector(".xray-fd")) return;
    const button = document.createElement("button");
    button.className = "xray-fd";
    button.type = "button";
    button.setAttribute("aria-label", "Fake Deafen");
    button.innerHTML = MASK_ICON;
    button.addEventListener("click", () => fakeVoice.set(!faking));
    bar.insertBefore(button, bar.firstChild);
    buttons.add(button);
    update(button);
  });
  ctx.onStop(() => {
    unsub();
    document.querySelectorAll(".xray-fd").forEach((el) => el.remove());
    buttons.clear();
  });
}

export default definePlugin({
  id: PLUGIN_ID,
  name: "Fake Deafen",
  description: "A Fake Deafen button next to mute: others see you deafened while you keep listening. It stays off until you press it, so it never touches your audio on its own.",
  category: "Voice",
  impact: "light",
  impactReason: "Only reads the voice updates you send",
  needsReload: false,
  enabledByDefault: true,
  options: {
    serverDeafen: {
      type: "boolean",
      label: "Server deafen too",
      description: "In servers where you can deafen members, also show the red server-deafen icon. Warning: this is a real server deafen, so the server stops sending you audio — you won't hear anyone while it's on. It also appears in the audit log. Leave off to just look deafened and still hear.",
      default: false,
    },
    serverMute: {
      type: "boolean",
      label: "Server mute too",
      description: "In servers where you can mute members, also show the red server-mute icon. It's a real server mute, so it's in the audit log — and, unlike deafen, it really does stop you talking until it's off.",
      default: false,
    },
  },
  start(ctx) {
    realSend = WebSocket.prototype.send;
    options = ctx.options;
    running = true;
    ctx.patch(WebSocket.prototype, "send", { before: rewrite });
    ctx.intercept((action) => keepHearing(action));
    // Guarded so the unit-test harness (no DOM, a minimal ctx) skips it.
    if (typeof ctx.css === "function" && typeof ctx.watch === "function") installVoicePanelButton(ctx);
    // A leftover from last time is cleared once you're logged in.
    if (!undoLeftover()) ctx.onAction("CONNECTION_OPEN", () => undoLeftover());
    const onPageHide = () => {
      faking = false;
      syncServer();
    };
    window.addEventListener("pagehide", onPageHide);
    ctx.onStop(() => {
      window.removeEventListener("pagehide", onPageHide);
      fakeVoice.set(false);
      syncServer();
      running = false;
      options = undefined;
      listeners.forEach((listener) => listener());
    });
  },
});
