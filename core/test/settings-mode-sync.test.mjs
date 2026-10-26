import {test} from "node:test";import assert from "node:assert/strict";import {build} from "esbuild";import vm from "node:vm";
test("late remote configuration cannot roll back shield/edit mode on Ctrl+R",async()=>{
 const values=new Map([["xray.settings",JSON.stringify({syncConfig:true,plugins:{presentationMode:{data:{active:true}},personalLocalEditControls:{data:{accounts:{one:true}}},ordinary:{options:{value:"local"}}}})]]);let finish;
 const remote=new Promise(resolve=>{finish=resolve;});
 const stubs={"./env":"export const storage=globalThis.storage;export const warn=()=>{};","./shell/sync":"export const pullConfig=()=>globalThis.remote;export const pushConfig=async()=>{};"};
 const output=await build({entryPoints:["core/src/settings.ts"],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"settings-fixture",setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"stub"}:null);b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));}}]});
 const context={module:{exports:{}},storage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},remote,window:{addEventListener(){}},clearTimeout};vm.runInNewContext(output.outputFiles[0].text,context);const api=context.module.exports,loading=api.initSync();
 api.pluginState("personalLocalEditControls").data.accounts.two=true;
 finish({value:{syncConfig:true,plugins:{presentationMode:{data:{active:false}},personalLocalEditControls:{data:{accounts:{}}},ordinary:{options:{value:"remote"}}}}});await loading;
 const persisted=JSON.parse(values.get("xray.settings"));assert.equal(persisted.plugins.presentationMode.data.active,true);assert.equal(persisted.plugins.personalLocalEditControls.data.accounts.one,true);assert.equal(persisted.plugins.personalLocalEditControls.data.accounts.two,true);assert.equal(persisted.plugins.ordinary.options.value,"remote");
});
