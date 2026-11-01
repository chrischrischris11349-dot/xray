/** Capture budgets are upper bounds, not encoder or Discord entitlement changes. */
function capped(value: ConstrainDouble | undefined, maximum: number): ConstrainDouble {
  const current = typeof value === "object" && value ? value : {};
  const max = typeof current.max === "number" && Number.isFinite(current.max) ? Math.min(current.max, maximum) : maximum;
  const preferred=typeof value==='number'?value:current.ideal;
  const ideal=typeof preferred==='number'&&Number.isFinite(preferred)&&preferred>0?Math.min(preferred,max):max;
  return { ...current, ideal, max };
}

/** Explicit tradeoff for game headroom; never changes audio or Discord limits. */
export function gamingSharePreset(mode:'low-impact'|'smooth'){
  return {resolution:'720',frameRate:mode==='low-impact'?'30':'60',contentHint:'motion'} as const;
}

export function boundedCaptureOptions(
  input: DisplayMediaStreamOptions = {},
  frameRate?: number,
  height?: number,
): DisplayMediaStreamOptions {
  if (input.video === false) return input;
  const video = typeof input.video === "object" && input.video ? { ...input.video } : {};
  if (frameRate && Number.isFinite(frameRate) && frameRate > 0) video.frameRate = capped(video.frameRate, frameRate);
  if (height && Number.isFinite(height) && height > 0) {
    video.height = capped(video.height, height);
    video.width = capped(video.width, Math.round(height * 16 / 9));
  }
  return { ...input, video };
}

/** One post-picker check, not a frame loop. Some sources negotiate native size
 * first. Apply the chosen upper bounds before preview/encoding if necessary.
 * Unsupported constraints leave the approved share usable and settings honest.
 */
export async function enforceCaptureBudget(stream: MediaStream, options: DisplayMediaStreamOptions): Promise<MediaStream> {
  if (options.video === false) return stream;
  const video = typeof options.video === "object" ? options.video : {};
  for (const track of stream.getVideoTracks()) {
    if (track.readyState !== "live" || typeof track.applyConstraints !== "function") continue;
    try {
      const actual = track.getSettings();
      const constraints = track.getConstraints?.() ?? {};
      let over = false;
      for (const key of ["width", "height", "frameRate"] as const) {
        const value = video[key];
        const limit = typeof value === "object" ? value?.max : undefined;
        if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) continue;
        // Retain all three chosen bounds in one operation so resizing cannot
        // increase the other dimension or drop a stricter frame-rate limit.
        constraints[key] = capped(constraints[key] ?? value, limit);
        if (typeof actual[key] === "number" && actual[key]! > limit + 0.01) over = true;
      }
      if (over) await track.applyConstraints(constraints);
    } catch { /* The live source remains valid; preview/status show its actual settings. */ }
  }
  // Equicord and XRay have separate bundles. The narrow integration handle
  // makes the status button work even when the optional preference plugin is off.
  try { if (typeof window !== "undefined") (window as any).__xray?.screenShareObserved?.(stream); } catch { /* Status never interrupts capture. */ }
  return stream;
}
/** Explicit picker choice. No microphone track is ever requested or mixed in. */
export function captureAudioOptions(input:DisplayMediaStreamOptions,mode:"auto"|"default"|"application"|"system"|"off"):DisplayMediaStreamOptions{
  if(mode==="default")return input;
  if(mode==="off"||(mode==="auto"&&input.audio===false))return {...input,audio:false,systemAudio:"exclude",windowAudio:"exclude"} as DisplayMediaStreamOptions;
  // Automatic offers system audio for a screen and window-only audio for a window.
  // Application-only must remain explicit: excluding system audio also suppresses
  // the whole-screen audio checkbox in Chromium's picker.
  return {...input,audio:{...(typeof input.audio==="object"?input.audio:{}),restrictOwnAudio:true,suppressLocalAudioPlayback:false},systemAudio:mode==="application"?"exclude":"include",windowAudio:mode==="system"?"system":"window"} as DisplayMediaStreamOptions;
}
