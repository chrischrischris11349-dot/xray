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
  "@api/Settings": "export const definePluginSettings=definitions=>(globalThis.captureFixture.definitions=definitions,{use:()=>globalThis.captureFixture.options});",
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
test("explicit application audio requests window sound without mixing the microphone",async()=>{
 let actual;globalThis.captureFixture.options.audioMode="application";globalThis.captureFixture.options.systemAudio=false;
 globalThis.captureFixture.native=async options=>{actual=options;return {getVideoTracks:()=>[]};};
 const input={video:true,audio:false},pending=navigator.mediaDevices.getDisplayMedia(input);await globalThis.captureFixture.modal.actions[0].onClick();await pending;
 assert.equal(actual.windowAudio,"window");assert.equal(actual.systemAudio,"exclude");assert.equal(actual.audio.restrictOwnAudio,true);assert.equal(input.audio,false);delete globalThis.captureFixture.options.audioMode;
});
test("an existing explicit mute still prevents screen-share audio",async()=>{
 let actual;globalThis.captureFixture.options.audioMode="application";globalThis.captureFixture.options.systemAudio=true;
 globalThis.captureFixture.native=async options=>{actual=options;return {getVideoTracks:()=>[]};};
 const pending=navigator.mediaDevices.getDisplayMedia({video:true,audio:true});await globalThis.captureFixture.modal.actions[0].onClick();await pending;assert.equal(actual.audio,false);
 globalThis.captureFixture.options.systemAudio=false;delete globalThis.captureFixture.options.audioMode;
});

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
test('fresh screen-share defaults use a 720p30 capture budget',()=>{const values=globalThis.captureFixture.definitions;assert.equal(values.resolution.options.find(o=>o.default).value,'720');assert.equal(values.frameRate.options.find(o=>o.default).value,'30');});

test('capture budgets never raise a lower numeric frame-rate or resolution request',async()=>{
 let actual;const previous={...globalThis.captureFixture.options};Object.assign(globalThis.captureFixture.options,{frameRate:'60',resolution:'1080'});
 try{globalThis.captureFixture.native=async options=>{actual=options;return{getVideoTracks:()=>[]};};const input={video:{frameRate:30,width:1280,height:720},audio:false};const pending=navigator.mediaDevices.getDisplayMedia(input);await globalThis.captureFixture.modal.actions[0].onClick();await pending;
 assert.equal(actual.video.frameRate.ideal,30);assert.equal(actual.video.width.ideal,1280);assert.equal(actual.video.height.ideal,720);assert.deepEqual(input.video,{frameRate:30,width:1280,height:720});}finally{Object.assign(globalThis.captureFixture.options,previous);}
});

test('capture budgets preserve lower ideal values as well as hard maxima',async()=>{
 let actual;const previous={...globalThis.captureFixture.options};Object.assign(globalThis.captureFixture.options,{frameRate:'60',resolution:'1080'});
 try{globalThis.captureFixture.native=async options=>{actual=options;return{getVideoTracks:()=>[]};};const pending=navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30},width:{ideal:640,max:1280},height:{ideal:360,max:720}},audio:false});await globalThis.captureFixture.modal.actions[0].onClick();await pending;
 assert.deepEqual(actual.video.frameRate,{ideal:15,max:30});assert.deepEqual(actual.video.width,{ideal:640,max:1280});assert.deepEqual(actual.video.height,{ideal:360,max:720});}finally{Object.assign(globalThis.captureFixture.options,previous);}
});

test('lower game impact preset selects 720p30 without changing audio settings',async()=>{
 const previous={...globalThis.captureFixture.options};let actual;
 try{globalThis.captureFixture.native=async options=>{actual=options;return{getVideoTracks:()=>[]};};const pending=navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
 const visited=new Set();function find(value){if(!value||typeof value!=='object'||visited.has(value))return;visited.add(value);if(value.type==='input'&&value.props?.name==='preset'&&value.props.value==='low-impact')return value;for(const child of Object.values(value)){const hit=find(child);if(hit)return hit;}}
 const choice=find(globalThis.captureFixture.modal);assert.ok(choice);choice.props.onChange();assert.equal(globalThis.captureFixture.options.frameRate,'30');assert.equal(globalThis.captureFixture.options.resolution,'720');assert.equal(globalThis.captureFixture.options.systemAudio,previous.systemAudio);
 await globalThis.captureFixture.modal.actions[0].onClick();await pending;assert.deepEqual(actual.video.frameRate,{ideal:30,max:30});assert.deepEqual(actual.video.height,{ideal:720,max:720});assert.equal(actual.audio,false);
 }finally{Object.assign(globalThis.captureFixture.options,previous);}
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
