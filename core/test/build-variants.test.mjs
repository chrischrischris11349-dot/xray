import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import vm from "node:vm";
for(const personal of [false,true])test(`${personal?"personal":"team"} build isolates personal message and voice controls`,async()=>{
 const output=await build({entryPoints:["core/src/plugins/builtins.ts"],bundle:true,write:false,platform:"node",format:"cjs",loader:{".svg":"text"},define:{__XRAY_VERSION__:'"test"',__XRAY_DEV__:"false",__XRAY_PERSONAL_BUILD__:String(personal)}});
 const context={module:{exports:{}},document:{},location:{hostname:"fixture.invalid"},WebSocket:class{},addEventListener(){},removeEventListener(){}};context.window=context;
 vm.runInNewContext(output.outputFiles[0].text,context);const ids=Array.from(context.module.exports.builtins,p=>p.id);
 for(const id of ["fakeDeafen","localMessageEdit","personalLocalEditControls"])assert.equal(ids.includes(id),personal,id);
 assert.ok(ids.includes("accountDetails"));assert.ok(ids.includes("messageModeration"));
});
