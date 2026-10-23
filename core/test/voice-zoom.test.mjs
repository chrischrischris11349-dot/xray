import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const mocks={
 '../discord':'export const myId=()=>"me",stores={voiceStates:{getVoiceStateForUser:()=>({channelId:globalThis.connected?"vc":null})}},voiceActions=()=>({disconnect:()=>globalThis.left++}),audioActions=()=>({toggleSelfMute:()=>globalThis.muted++,toggleSelfDeaf:()=>globalThis.deafened++}),whenStore=()=>{};',
 './fakeDeafen':'export const fakeVoice={active:false,usesTopButton:false};',
 '../ui/dom':'export const h=()=>{};', '../ui/icons':'export const icon=()=>"";', '../ui/root':'export const uiRoot=()=>{},onKey=()=>{};', '../shell/bridge':'export const invoke=()=>Promise.resolve();', './bridge':'export const invoke=()=>Promise.resolve();', '../env':'export const warn=()=>{};'
};
const b=await build({stdin:{contents:"export {zoomShortcut} from './core/src/shell/zoom';export {toggleVoiceControl} from './core/src/plugins/voiceBar';",resolveDir:process.cwd()},write:false,bundle:true,platform:'node',format:'cjs',plugins:[{name:'controls-fixture',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));}}]});
const c={module:{exports:{}},connected:false,left:0,muted:0,deafened:0};vm.runInNewContext(b.outputFiles[0].text,c);const {zoomShortcut,toggleVoiceControl}=c.module.exports;
test('zoom keys accept Ctrl plus/minus/reset and leave ordinary typing intact',()=>{for(const [key,value]of [['+',1],['=',1],['-',-1],['0',0]])assert.equal(zoomShortcut({ctrlKey:true,key}),value);assert.equal(zoomShortcut({key:'-'}),undefined);assert.equal(zoomShortcut({ctrlKey:true,altKey:true,key:'-'}),undefined);});
test('Leave VC disconnects only an active voice session; mute and deafen retain their actions',()=>{toggleVoiceControl('leave');assert.equal(c.left,0);c.connected=true;toggleVoiceControl('leave');assert.equal(c.left,1);toggleVoiceControl('mute');toggleVoiceControl('deafen');assert.equal(c.muted,1);assert.equal(c.deafened,1);});
