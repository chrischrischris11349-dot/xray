/** Capture budgets are upper bounds, not encoder or Discord entitlement changes. */
function capped(value: ConstrainDouble | undefined, maximum: number): ConstrainDouble {
  const current = typeof value === "object" && value ? value : {};
  const max = typeof current.max === "number" && Number.isFinite(current.max) ? Math.min(current.max, maximum) : maximum;
  return { ...current, ideal: max, max };
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
/** Explicit picker choice. No microphone track is ever requested or mixed in. */
export function captureAudioOptions(input:DisplayMediaStreamOptions,mode:"default"|"application"|"system"|"off"):DisplayMediaStreamOptions{
  if(mode==="default")return input;
  if(mode==="off")return {...input,audio:false,systemAudio:"exclude",windowAudio:"exclude"} as DisplayMediaStreamOptions;
  return {...input,audio:{...(typeof input.audio==="object"?input.audio:{}),restrictOwnAudio:true,suppressLocalAudioPlayback:false},systemAudio:mode==="system"?"include":"exclude",windowAudio:mode==="system"?"system":"window"} as DisplayMediaStreamOptions;
}
