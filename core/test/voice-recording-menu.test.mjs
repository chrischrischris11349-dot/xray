import {test} from "node:test";import assert from "node:assert/strict";import {build} from "esbuild";import vm from "node:vm";
test("VC right-click recording is scoped to the connected channel and uses the shared recorder",async()=>{
 const state={channel:"current",recording:false,busy:false,recordingChannel:"current"},calls=[];let patch;
 const stubs={"../api/menus":"export const menu={group:(...items)=>items,item:item=>item};","../discord":"export const stores={voiceStates:{getVoiceStateForUser:()=>({channelId:'current'})}};","../ui/dialog":"export const showDialog=()=>{};","../ui/intelligence":"export const openIntelligence=()=>{};","../voice/recorder":"export const voiceRecordingState=()=>globalThis.state;export const startVoiceRecording=async id=>globalThis.calls.push(['start',id]);export const stopVoiceRecording=()=>globalThis.calls.push(['stop']);"};
 const output=await build({entryPoints:["core/src/plugins/voiceRecordingMenu.ts"],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"voice-fixture",setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"stub"}:null);b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));}}]});
 const context={module:{exports:{}},state,calls};vm.runInNewContext(output.outputFiles[0].text,context);
 context.module.exports.default.start({menu(ids,fn){assert.ok(ids.includes("channel-context"));patch=fn;}});
 const entries=target=>{const list=[];patch(list,target);return list.flat();};
 assert.equal(entries({channel:{type:0,id:"text"}}).length,0);assert.equal(entries({channel:{type:2,id:"other"}})[0].disabled,true);
 const start=entries({user:{id:"participant"}})[0];assert.equal(start.disabled,false);start.action();await Promise.resolve();assert.equal(calls[0][1],"current");
 state.recording=true;state.busy=true;const stop=entries({channel:{type:2,id:"current"}})[0];assert.equal(stop.disabled,false);assert.match(stop.label,/Stop and save/);stop.action();assert.equal(calls[1][0],"stop");
 state.recording=false;assert.equal(entries({channel:{type:2,id:"current"}})[0].disabled,true);
});
