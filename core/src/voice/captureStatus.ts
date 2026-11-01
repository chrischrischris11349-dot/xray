/** Ephemeral capture state for the existing status button. No polling/history. */
let latest: MediaStreamTrack | undefined;
let audio: MediaStreamTrack[] = [];
let detach: (() => void) | undefined;

export function observeScreenCapture(stream: MediaStream): void {
  const track = stream?.getVideoTracks?.()[0];
  if (!track || track.readyState !== "live" || typeof track.getSettings !== "function") return;
  audio = stream.getAudioTracks?.() ?? [];
  if (latest === track) return;
  detach?.();
  latest = track;
  const ended = () => { if (latest === track) { latest = undefined; audio = []; detach = undefined; } };
  track.addEventListener("ended", ended, { once: true });
  detach = () => track.removeEventListener("ended", ended);
}

export function screenCaptureStatus(): { settings: MediaTrackSettings; content: string } | null {
  if (latest?.readyState !== "live") return null;
  try { return { settings: latest.getSettings(), content: latest.contentHint || "Browser default" }; }
  catch { return null; }
}

/** Track state only: an enabled track is not proof of audible sound or receiver playback. */
export function screenCaptureAudioStatus(): string {
  if(latest?.readyState!=="live")return "No active capture";
  const tracks=audio.filter(track=>track.readyState==="live");
  if(!tracks.length)return "No audio track supplied by Windows. Choose source with audio in the preview, then enable audio in the system picker.";
  return `${tracks.length} live audio track(s) · ${tracks.filter(track=>track.enabled).length} enabled · ${tracks.filter(track=>track.muted).length} muted by capture. This does not verify sound at the viewer.`;
}
