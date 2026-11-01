import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';
test('clean Personal edits keep the existing local namespace even with an old server preference',async()=>{
 const stubs={'../discord':'export const myId=()=>"me";','../env':'export const storage=globalThis.saved;','./bridge':'export const invoke=()=>{throw Error("server access must not be used")};'};
 const result=await build({entryPoints:['core/src/shell/serverStorage.ts'],bundle:true,write:false,format:'cjs',platform:'node',define:{__XRAY_CLEAN_BUILD__:'true'},plugins:[{name:'local-persistence',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}));}}]});
 const values=new Map([['xray.serverData.v1:me','true'],['xray.localMessageEdits.v1:me','saved before reload']]);const saved={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const load=()=>{const scope={module:{exports:{}},saved,TextEncoder};vm.runInNewContext(result.outputFiles[0].text,scope);return scope.module.exports.accountDocument('local-message-edits','me');};
 const first=load();await first.load();assert.equal(first.value,'saved before reload');await first.write('saved after edit');const restarted=load();await restarted.load();assert.equal(restarted.value,'saved after edit');
});
