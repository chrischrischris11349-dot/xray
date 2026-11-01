/**
 * Which video encoder your own outgoing stream uses, read from the browser's WebRTC
 * stats only when the status dialog asks. Nothing polls, and incoming media is untouched.
 * The answer explains game FPS while sharing: a software encoder competes for the CPU.
 */
const peers = new Set<RTCPeerConnection>();

export function installEncoderStats(): void {
  const Original = window.RTCPeerConnection;
  if (typeof Original !== "function") return;
  window.RTCPeerConnection = new Proxy(Original, { construct(target, args, newTarget) {
    const peer = Reflect.construct(target, args, newTarget) as RTCPeerConnection;
    peers.add(peer);
    peer.addEventListener("connectionstatechange", () => { if (peer.connectionState === "closed") peers.delete(peer); });
    if (peers.size > 64) peers.delete(peers.values().next().value!);
    return peer;
  } });
}

export interface OutboundVideo { encoder: string; powerEfficient: boolean | null; codec: string; size: string; fps: number | null; limitedBy: string }

/** One entry per outgoing video stream (a camera also counts). */
export async function outboundVideo(): Promise<OutboundVideo[]> {
  const found: OutboundVideo[] = [];
  for (const peer of [...peers]) {
    if (peer.connectionState === "closed") { peers.delete(peer); continue; }
    let stats: RTCStatsReport;
    try { stats = await peer.getStats(); } catch { continue; }
    stats.forEach((entry: any) => {
      if (entry.type !== "outbound-rtp" || entry.kind !== "video" || !entry.framesEncoded || entry.active === false) return;
      const codec = entry.codecId ? String(stats.get(entry.codecId)?.mimeType ?? "").replace(/^video\//i, "") : "";
      found.push({
        encoder: entry.encoderImplementation || "not reported",
        powerEfficient: typeof entry.powerEfficientEncoder === "boolean" ? entry.powerEfficientEncoder : null,
        codec: codec || "unknown codec",
        size: entry.frameWidth && entry.frameHeight ? `${entry.frameWidth} × ${entry.frameHeight}` : "unknown size",
        fps: typeof entry.framesPerSecond === "number" && Number.isFinite(entry.framesPerSecond) ? entry.framesPerSecond : null,
        limitedBy: entry.qualityLimitationReason || "not reported",
      });
    });
  }
  return found;
}

/** Plain-language rows for the screen-share status dialog. */
export function describeOutbound(streams: OutboundVideo[]): [string, string][] {
  if (!streams.length) return [["Video encoder", "No outgoing video right now. Open this while you're sharing."]];
  return streams.flatMap((stream, index) => {
    const suffix = streams.length > 1 ? ` ${index + 1}` : "";
    // WebRTC reports efficiency, not a definitive GPU/CPU flag. The specification
    // permits other factors, so a false value must not be presented as proof of CPU encoding.
    const kind = stream.powerEfficient === true ? "power-efficient; hardware acceleration likely" : stream.powerEfficient === false ? "not power-efficient; hardware use unconfirmed" : "hardware use not reported";
    const limit = stream.limitedBy === "cpu" ? "CPU: the encoder is short of processor time" : stream.limitedBy === "bandwidth" ? "Bandwidth: upload speed" : stream.limitedBy === "none" ? "Nothing" : stream.limitedBy;
    return [
      [`Video encoder${suffix}`, `${stream.encoder} (${kind})`],
      [`Sending${suffix}`, `${stream.codec} · ${stream.size} · ${stream.fps === null ? "frame rate not reported" : `${Math.round(stream.fps)} FPS`}`],
      [`Limited by${suffix}`, limit],
    ] as [string, string][];
  });
}
