import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const out = resolve("node_modules/.cache/xray/screenshare.test.cjs");
mkdirSync(resolve("node_modules/.cache/xray"), { recursive: true });
globalThis.captureFixture = { options: { frameRate: "60", resolution: "1080", contentHint: "motion", systemAudio: false }, native: async () => ({ getVideoTracks: () => [] }) };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getDisplayMedia: options => globalThis.captureFixture.native(options) } } });
const mocks = {
  "@api/Settings": "export const definePluginSettings=()=>({use:()=>globalThis.captureFixture.options});",
  "@api/UserSettings": "export const getUserSettingLazy=()=>({useSetting:()=>false,updateSetting(){}});",
  "@components/index": "export const Divider=()=>null,Span=props=>props;",
  "@utils/constants": "export const Devs={ThaUnknown:{}};",
  "@utils/css": "export const classNameFactory=prefix=>(...names)=>names.map(n=>prefix+n).join(' ');",
  "@utils/Logger": "export class Logger{error(){}}",
  "@utils/types": "export default plugin=>plugin;export const OptionType={SELECT:1,BOOLEAN:2};",
  "@webpack/common": "export const Checkbox=props=>props,Text=props=>props,Modal=props=>(globalThis.captureFixture.modal=props);export const openModal=render=>{render({onClose(){}});return 'fixture';},closeModal=()=>{};",
  "./sharePreview": "export const confirmSharePreview=stream=>Promise.resolve(stream);",
  "./styles.css?managed": "export default '';",
};
await build({ entryPoints: ["equicord/patches/WebScreenShare.tsx"], outfile: out, bundle: true, platform: "node", format: "cjs", jsx: "transform", jsxFactory: "React.createElement",
  banner: { js: "const React={createElement(type,props,...children){return typeof type==='function'?type({...props,children}):{type,props,children};}};" },
  plugins: [{ name: "capture-fixture", setup(b) {
    b.onResolve({ filter: /./ }, args => {
      if (args.path in mocks) return { path: args.path, namespace: "fixture" };
      if (args.path === "./captureConstraints") return { path: resolve("core/src/voice/captureConstraints.ts") };
    });
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});
const plugin = createRequire(import.meta.url)(out).default;
plugin.start();

const coreOut = resolve("node_modules/.cache/xray/core-screenshare.test.cjs");
await build({ entryPoints: ["core/src/plugins/screenShare.ts"], outfile: coreOut, bundle: true, platform: "node", format: "cjs",
  plugins: [{ name: "core-capture-fixture", setup(b) {
    b.onResolve({ filter: /^\.\.\/ui\/dialog$/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const showDialog=data=>globalThis.captureFixture.dialog=data;", loader: "js" }));
  } }],
});
const corePlugin = createRequire(import.meta.url)(coreOut);

test("screen picker caps capture at the selected budget and preserves audio opt-out", async () => {
  let actual;
  const track = {};
  globalThis.captureFixture.native = async options => { actual = options; return { getVideoTracks: () => [track] }; };
  const input = { audio: false, video: { width: { max: 1280 }, frameRate: { max: 30 } } };
  const promise = navigator.mediaDevices.getDisplayMedia(input);
  await globalThis.captureFixture.modal.actions[0].onClick();
  assert.equal((await promise).getVideoTracks()[0], track);
  assert.equal(actual.audio, false);
  assert.deepEqual(actual.video.frameRate, { ideal: 30, max: 30 });
  assert.deepEqual(actual.video.width, { ideal: 1280, max: 1280 });
  assert.deepEqual(actual.video.height, { ideal: 1080, max: 1080 });
  assert.equal(track.contentHint, "motion");
  assert.deepEqual(input.video.width, { max: 1280 });
  assert.equal(plugin.patches, undefined, "must not override Discord bitrate or encoder maxima");
});

test("screen picker preserves native capture errors instead of disguising failures as cancellation", async () => {
  const failure = new Error("Display capture unavailable");
  globalThis.captureFixture.native = () => { throw failure; };
  const promise = navigator.mediaDevices.getDisplayMedia({ video: true });
  const rejected = assert.rejects(promise, error => error === failure);
  await globalThis.captureFixture.modal.actions[0].onClick();
  await rejected;
});

test("screen picker keeps explicit higher quality choices available", async () => {
  let actual;
  globalThis.captureFixture.options.frameRate = "120";
  globalThis.captureFixture.options.resolution = "2160";
  globalThis.captureFixture.native = async options => { actual = options; return { getVideoTracks: () => [] }; };
  const promise = navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  await globalThis.captureFixture.modal.actions[0].onClick();
  await promise;
  assert.deepEqual(actual.video.frameRate, { ideal: 120, max: 120 });
  assert.deepEqual(actual.video.width, { ideal: 3840, max: 3840 });
  assert.deepEqual(actual.video.height, { ideal: 2160, max: 2160 });
});

test("disabling capture preferences while the native picker is open leaves the share intact", async () => {
  let hooks, stop, resolveCapture;
  corePlugin.default.start({
    options: { fps: "60", source: "auto", resolution: "720", content: "motion" },
    command() {}, patch(_target, _key, value) { hooks = value; }, onStop(value) { stop = value; },
  });
  let listeners = 0, stopped = false;
  const track = { readyState: "live", contentHint: "detail", addEventListener() { listeners++; }, stop() { stopped = true; } };
  const stream = { getVideoTracks: () => [track] };
  const pending = hooks.instead(null, [{ video: true }], () => new Promise(resolve => { resolveCapture = resolve; }));
  stop();
  resolveCapture(stream);
  assert.equal(await pending, stream);
  assert.equal(listeners, 0);
  assert.equal(stopped, false);
  assert.equal(track.contentHint, "detail");
  corePlugin.showScreenShareStatus();
  assert.equal(globalThis.captureFixture.dialog.body[0][1], "Discord default");
  assert.match(globalThis.captureFixture.dialog.body[1][1], /No active capture/);
});
