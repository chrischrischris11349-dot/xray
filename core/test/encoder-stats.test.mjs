import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
await build({ entryPoints: ["core/src/voice/encoderStats.ts"], outfile: "node_modules/.cache/xray/encoder-stats.cjs", bundle: true, platform: "node", format: "cjs" });
const stats = createRequire(import.meta.url)("../../node_modules/.cache/xray/encoder-stats.cjs");
class Peer extends EventTarget {
  connectionState = "connected"; reports = new Map();
  async getStats() { return this.reports; }
}
globalThis.window = { RTCPeerConnection: Peer };
stats.installEncoderStats();
test("no outgoing video says so instead of guessing", async () => {
  assert.deepEqual(stats.describeOutbound(await stats.outboundVideo()), [["Video encoder", "No outgoing video right now. Open this while you're sharing."]]);
});
test("the encoder and CPU limitation are named; audio and inbound media are ignored", async () => {
  const peer = new window.RTCPeerConnection();
  assert.ok(peer instanceof Peer, "Discord still gets a real peer connection");
  peer.reports.set("c1", { type: "codec", mimeType: "video/VP8" });
  peer.reports.set("o1", { type: "outbound-rtp", kind: "video", framesEncoded: 900, codecId: "c1", encoderImplementation: "libvpx", powerEfficientEncoder: false, frameWidth: 1280, frameHeight: 720, framesPerSecond: 29.6, qualityLimitationReason: "cpu" });
  peer.reports.set("o2", { type: "outbound-rtp", kind: "audio", framesEncoded: 1 });
  peer.reports.set("i1", { type: "inbound-rtp", kind: "video", framesDecoded: 50 });
  const rows = stats.describeOutbound(await stats.outboundVideo());
  assert.deepEqual(rows, [["Video encoder", "libvpx (not power-efficient; hardware use unconfirmed)"], ["Sending", "VP8 · 1280 × 720 · 30 FPS"], ["Limited by", "CPU: the encoder is short of processor time"]]);
  peer.connectionState = "closed"; peer.dispatchEvent(new Event("connectionstatechange"));
  assert.equal((await stats.outboundVideo()).length, 0, "closed connections are forgotten");
});
test("power efficiency suggests acceleration without claiming a definitive GPU measurement", async () => {
  const peer = new window.RTCPeerConnection();
  peer.reports.set("o1", { type: "outbound-rtp", kind: "video", framesEncoded: 10, encoderImplementation: "MediaFoundationVideoEncodeAccelerator", powerEfficientEncoder: true, qualityLimitationReason: "none" });
  const [encoder, , limit] = stats.describeOutbound(await stats.outboundVideo());
  assert.equal(encoder[1], "MediaFoundationVideoEncodeAccelerator (power-efficient; hardware acceleration likely)");
  assert.equal(limit[1], "Nothing");
  peer.connectionState = "closed"; peer.dispatchEvent(new Event("connectionstatechange"));
});

test("missing optional stats stay unknown and disabled outgoing streams are excluded", async () => {
  const peer = new window.RTCPeerConnection();
  peer.reports.set("stopped", { type: "outbound-rtp", kind: "video", framesEncoded: 100, active: false, encoderImplementation: "old encoder" });
  peer.reports.set("live", { type: "outbound-rtp", kind: "video", framesEncoded: 1, frameWidth: 1280, framesPerSecond: NaN });
  const reports = await stats.outboundVideo();
  assert.equal(reports.length, 1);
  assert.deepEqual(stats.describeOutbound(reports), [["Video encoder", "not reported (hardware use not reported)"], ["Sending", "unknown codec · unknown size · frame rate not reported"], ["Limited by", "not reported"]]);
  peer.connectionState = "closed"; peer.dispatchEvent(new Event("connectionstatechange"));
});
