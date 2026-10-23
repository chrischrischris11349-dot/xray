import { definePlugin } from "./types";
import { showDialog } from "../ui/dialog";
import { boundedCaptureOptions } from "../voice/captureConstraints";

let latest: MediaStreamTrack | undefined;
let requested = "Discord default";

export function capturePreferences(input: DisplayMediaStreamOptions = {}, fps: string, source: string, resolution = "native"): DisplayMediaStreamOptions {
  if (input.video === false || fps === "native" && source === "auto" && resolution === "native") return input;
  const options = boundedCaptureOptions(input, fps === "30" || fps === "60" ? Number(fps) : undefined, resolution === "720" || resolution === "1080" ? Number(resolution) : undefined);
  if (source === "window" && typeof options.video === "object") options.video.displaySurface = "window";
  return options;
}

export function showScreenShareStatus(): void {
  const settings = latest?.readyState === "live" ? latest.getSettings() : null;
  showDialog({ title: "Screen-share capture", body: [
    ["Requested capture", requested],
    ["Actual capture", settings ? `${settings.width ?? "?"} × ${settings.height ?? "?"} · ${settings.frameRate ? `${Math.round(settings.frameRate)} FPS` : "frame rate unavailable"}` : "No active capture observed by this feature"],
    ["Source", settings?.displaySurface ?? "Use Discord's Share screen button, then select a screen or application window in the system picker."],
    ["Content", latest?.readyState === "live" ? latest.contentHint || "Browser default" : "No active capture"],
    ["Streaming rate", "Capture rate is not the encoded stream rate. Discord's quality selection, session limits, hardware and bandwidth still apply."],
  ] });
}

export default definePlugin({
  id: "screenShareCapture", name: "Screen-share capture preferences", category: "Voice", impact: "light",
  impactReason: "Runs only when you start a screen share", needsReload: false, enabledByDefault: false,
  description: "Optional frame-rate and resolution budgets, smoother-video or clearer-text hints, and an application-window picker hint. Keeps Discord's encoding and permission limits.",
  options: {
    fps: { type: "select", label: "Capture frame rate", default: "native", choices: [{ label: "Discord default", value: "native" }, { label: "Up to 30 FPS", value: "30" }, { label: "Up to 60 FPS", value: "60" }] },
    resolution: { type: "select", label: "Capture resolution budget", description: "Optional upper bound for the next share. 720p uses less capture and encoding work; it does not change a share already running.", default: "native", choices: [{ label: "Discord default", value: "native" }, { label: "Up to 1080p", value: "1080" }, { label: "Up to 720p", value: "720" }] },
    content: { type: "select", label: "Capture content", description: "Smoother video favors motion; clearer text favors detail when bandwidth is limited.", default: "native", choices: [{ label: "Browser default", value: "native" }, { label: "Smoother video / games", value: "motion" }, { label: "Clearer text / documents", value: "detail" }] },
    source: { type: "select", label: "Capture source", default: "auto", choices: [{ label: "System picker default", value: "auto" }, { label: "Prefer an application window", value: "window" }] },
  },
  start(ctx) {
    ctx.command("Screen-share capture status", "Requested and actual capture resolution/frame rate", showScreenShareStatus);
    const devices = navigator.mediaDevices;
    if (typeof devices?.getDisplayMedia !== "function") return;
    let active = true;
    const listeners = new Map<MediaStreamTrack, () => void>();
    ctx.patch(devices, "getDisplayMedia", { instead(_self, args, original) {
      requested = `${ctx.options.fps === "native" ? "Discord frame rate" : `Up to ${ctx.options.fps} FPS`} · ${ctx.options.resolution === "native" ? "Discord resolution" : `up to ${ctx.options.resolution}p`}`;
      return Promise.resolve(original(capturePreferences(args[0], ctx.options.fps, ctx.options.source, ctx.options.resolution))).then((stream: MediaStream) => {
        // Disabling while the native picker is open must not revive this plugin
        // or stop a share the user subsequently approves in Discord.
        if (!active) return stream;
        latest = stream.getVideoTracks()[0];
        const track = latest;
        if (track) {
          if (ctx.options.content !== "native") { try { track.contentHint = ctx.options.content; } catch { /* Older WebView2 runtimes may not support content hints. */ } }
          const ended = () => { if (latest === track) latest = undefined; listeners.delete(track); };
          listeners.set(track, ended); track.addEventListener("ended", ended, { once: true });
        }
        return stream;
      });
    } });
    ctx.onStop(() => { active = false; listeners.forEach((ended, track) => track.removeEventListener("ended", ended)); listeners.clear(); latest = undefined; requested = "Discord default"; });
  },
});
