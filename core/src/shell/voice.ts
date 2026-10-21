/**
 * Discord's own voice controls, found in its modules. xray's hotkeys call
 * exactly what Discord's keybinds call, so sounds, icons and settings stay
 * right, and push to talk keeps Discord's speaking ring and release delay.
 *
 * Found in Discord's code (October 2026):
 *   - the audio actions object: `toggleSelfMute`, `toggleSelfDeaf`, `setTemporarySelfMute`
 *   - push to talk: the function Discord's push-to-talk keybind ends in. It
 *     announces PUSH_TO_TALK_STATE_CHANGE and calls `setForceAudioInput` on
 *     every voice connection. It takes the media engine from MediaEngineStore.
 */
import { warn } from "../env";
import { filters, find, findByCode } from "../webpack";

type PushToTalkSwitch = (engine: unknown, active: boolean, priority: boolean) => void;

/** Searching every module's source is slow, so a failed search waits this long before trying again. */
const RETRY_MS = 30_000;

let audioActions: any;
let mediaEngineStore: any;
let pushToTalkSwitch: PushToTalkSwitch | undefined;
let lastSearch = 0;
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  warn(message);
}

function actions(): any {
  audioActions ??= find(filters.byProps("toggleSelfMute", "toggleSelfDeaf", "setTemporarySelfMute"));
  if (!audioActions) warnOnce("actions", "Discord's mute controls aren't loaded yet (are you logged in?)");
  return audioActions;
}

function findPushToTalkSwitch(): PushToTalkSwitch | undefined {
  if (pushToTalkSwitch || Date.now() - lastSearch < RETRY_MS) return pushToTalkSwitch;
  lastSearch = Date.now();
  const exports = findByCode("PUSH_TO_TALK_STATE_CHANGE", "setForceAudioInput");
  if (!exports || typeof exports !== "object") return undefined;
  for (const key of Object.keys(exports)) {
    let value: unknown;
    try {
      value = exports[key];
    } catch {
      continue;
    }
    if (typeof value === "function" && String(value).includes("PUSH_TO_TALK_STATE_CHANGE")) {
      pushToTalkSwitch = value as PushToTalkSwitch;
      break;
    }
  }
  return pushToTalkSwitch;
}

export function toggleMute(): void {
  actions()?.toggleSelfMute({ usedKeybind: true, location: "Custom Keybind" });
}

export function toggleDeafen(): void {
  actions()?.toggleSelfDeaf({ usedKeybind: true, location: "Custom Keybind" });
}

/** Holds Discord's push to talk open while `active`. Returns false if Discord's controls weren't found. */
export function pushToTalk(active: boolean): boolean {
  const flip = findPushToTalkSwitch();
  mediaEngineStore ??= find(filters.byStoreName("MediaEngineStore"));
  const engine = mediaEngineStore?.getMediaEngine?.();
  if (!flip || !engine) {
    warnOnce("ptt", "Discord's push to talk wasn't found, so the push-to-talk hotkey can't work");
    return false;
  }
  flip(engine, active, false);
  return true;
}
