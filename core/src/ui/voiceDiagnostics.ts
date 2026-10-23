import { displayName, myId, stores } from "../discord";
import { showDialog } from "./dialog";

function percent(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "Unavailable";
}

/** An on-demand settings snapshot. Never records audio or changes a participant's volume. */
export function openVoiceDiagnostics(): void {
  const media = stores.mediaEngine;
  const rows: [string, string][] = [];
  try {
    rows.push(["Output volume", percent(media?.getOutputVolume?.())], ["Attenuation", percent(media?.getAttenuation?.())],
      ["Output device", media?.getOutputDeviceId?.() || "System default"],
      ["Self deafened", media?.isSelfDeaf?.() ? "Yes" : "No"]);
    const me = myId();
    const channelId = me && stores.voiceStates?.getVoiceStateForUser?.(me)?.channelId;
    const states = channelId ? stores.voiceStates?.getVoiceStatesForChannel?.(channelId) : null;
    if (states) for (const state of Object.values(states) as any[]) {
      const id = state?.userId ?? state?.user_id;
      if (!id || id === me) continue;
      rows.push([`${displayName(id)} · user volume`, percent(media?.getLocalVolume?.(id))]);
    }
    if (!channelId) rows.push(["Voice channel", "Join a call to inspect participant volumes"]);
  } catch { rows.push(["Voice settings", "Not loaded yet; join a call and refresh"]); }
  const plugins = (window as any).Vencord?.Settings?.plugins;
  const limiter = plugins?.AudioLimiter;
  rows.push(["Audio limiter", limiter?.enabled ? `On${typeof limiter.maxVolume === "number" ? ` · threshold ${limiter.maxVolume} dB` : ""}` : "Off"]);
  rows.push(["Next check", "Right-click your friend → User Volume. Start at 100%. If everyone is quiet, check Output Volume, attenuation and the Windows volume mixer for XRay. An enabled AudioLimiter can reduce incoming sound; compare with it disabled, then reconnect to VC."]);
  showDialog({ title: "Voice audio check", body: rows, actions: [
    { label: "Refresh", run: () => { openVoiceDiagnostics(); return false; } },
    { label: "Close", primary: true },
  ] });
}
