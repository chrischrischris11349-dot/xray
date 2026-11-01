/** Ephemeral capture state for the existing status button. No polling/history. */
let latest: MediaStreamTrack | undefined;
let detach: (() => void) | undefined;

export function observeScreenCapture(stream: MediaStream): void {
  const track = stream?.getVideoTracks?.()[0];
  if (!track || track.readyState !== "live" || typeof track.getSettings !== "function") return;
  if (latest === track) return;
  detach?.();
  latest = track;
  const ended = () => { if (latest === track) { latest = undefined; detach = undefined; } };
  track.addEventListener("ended", ended, { once: true });
  detach = () => track.removeEventListener("ended", ended);
}

export function screenCaptureStatus(): { settings: MediaTrackSettings; content: string } | null {
  if (latest?.readyState !== "live") return null;
  try { return { settings: latest.getSettings(), content: latest.contentHint || "Browser default" }; }
  catch { return null; }
}
