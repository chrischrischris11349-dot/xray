/**
 * Global hotkeys. The Rust side watches the keyboard (and the mouse, when a
 * mouse button is bound) system-wide and tells this page only which action
 * fired. Bindings are saved on the Rust side, so they survive Discord
 * clearing its storage.
 */
import { warn } from "../env";
import { fakeVoice } from "../plugins/fakeDeafen";
import { invoke } from "./bridge";
import { pushToTalk, toggleDeafen, toggleMute } from "./voice";

export type HotkeyAction = "pushToTalk" | "toggleMute" | "toggleDeafen" | "toggleFakeDeafen";

export interface Binding {
  /** Windows virtual-key code (what the browser calls `keyCode`). Mouse buttons are 4, 5 and 6. */
  key: number;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  label: string;
}

export type Hotkeys = Record<HotkeyAction, Binding | null>;

export const HOTKEY_ACTIONS: readonly { id: HotkeyAction; name: string }[] = [
  { id: "pushToTalk", name: "Push to talk" },
  { id: "toggleMute", name: "Mute" },
  { id: "toggleDeafen", name: "Deafen" },
  { id: "toggleFakeDeafen", name: "Fake deafen" },
];

let lastHotkey: { action: string; pressed: boolean; at: number } | null = null;

export function getHotkeys(): Promise<Hotkeys> {
  return invoke("get_hotkeys") as Promise<Hotkeys>;
}

export function setHotkeys(hotkeys: Hotkeys): Promise<unknown> {
  return invoke("set_hotkeys", { hotkeys });
}

export function lastHotkeyFired() {
  return lastHotkey;
}

/** Called by the Rust side as `window.__xray.hotkey(action, pressed)`. */
export function handleHotkey(action: string, pressed: boolean): void {
  lastHotkey = { action, pressed, at: Date.now() };
  try {
    if (action === "pushToTalk") pushToTalk(pressed);
    // Toggles act on the press, not the release.
    else if (!pressed) return;
    else if (action === "toggleMute") toggleMute();
    else if (action === "toggleDeafen") toggleDeafen();
    else if (action === "toggleFakeDeafen" && fakeVoice.available) {
      fakeVoice.set(!fakeVoice.active);
      chime(fakeVoice.active);
    }
  } catch (err) {
    warn(`the ${action} hotkey failed`, err);
  }
}

/**
 * Discord plays its own sound for mute and deafen, but fake deafen is xray's,
 * so it gets a short two-note chime (rising for on, falling for off) that you
 * can hear in-game. The audio context closes as soon as the chime ends.
 */
function chime(on: boolean): void {
  try {
    const ctx = new AudioContext();
    const tone = ctx.createOscillator();
    const volume = ctx.createGain();
    const t = ctx.currentTime;
    const [first, second] = on ? [660, 990] : [990, 660];
    tone.frequency.setValueAtTime(first, t);
    tone.frequency.setValueAtTime(second, t + 0.08);
    volume.gain.setValueAtTime(0.0001, t);
    volume.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    tone.connect(volume).connect(ctx.destination);
    tone.onended = () => void ctx.close();
    tone.start(t);
    tone.stop(t + 0.2);
  } catch {
    // No audio device: the toggle still worked.
  }
}
