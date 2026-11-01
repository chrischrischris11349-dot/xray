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
test("a software encoder short of CPU is named plainly; audio and inbound media are ignored", async () => {
  const peer = new window.RTCPeerConnection();
  assert.ok(peer instanceof Peer, "Discord still gets a real peer connection");
  peer.reports.set("c1", { type: "codec", mimeType: "video/VP8" });
  peer.reports.set("o1", { type: "outbound-rtp", kind: "video", framesEncoded: 900, codecId: "c1", encoderImplementation: "libvpx", powerEfficientEncoder: false, frameWidth: 1280, frameHeight: 720, framesPerSecond: 29.6, qualityLimitationReason: "cpu" });
  peer.reports.set("o2", { type: "outbound-rtp", kind: "audio", framesEncoded: 1 });
  peer.reports.set("i1", { type: "inbound-rtp", kind: "video", framesDecoded: 50 });
  const rows = stats.describeOutbound(await stats.outboundVideo());
  assert.deepEqual(rows, [["Video encoder", "libvpx (software, on your CPU)"], ["Sending", "VP8 · 1280 × 720 · 30 FPS"], ["Limited by", "CPU: the encoder is short of processor time"]]);
  peer.connectionState = "closed"; peer.dispatchEvent(new Event("connectionstatechange"));
  assert.equal((await stats.outboundVideo()).length, 0, "closed connections are forgotten");
});
test("a hardware encoder is reported as GPU work", async () => {
  const peer = new window.RTCPeerConnection();
  peer.reports.set("o1", { type: "outbound-rtp", kind: "video", framesEncoded: 10, encoderImplementation: "MediaFoundationVideoEncodeAccelerator", powerEfficientEncoder: true, qualityLimitationReason: "none" });
  const [encoder, , limit] = stats.describeOutbound(await stats.outboundVideo());
  assert.equal(encoder[1], "MediaFoundationVideoEncodeAccelerator (hardware, on your GPU)");
  assert.equal(limit[1], "Nothing");
});
