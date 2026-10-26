import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import vm from "node:vm";
import {parseHTML} from "linkedom";
test("explicit archive reload refreshes native status and rereads bytes rather than reusing a broken player",async()=>{
 const stubs={"../discord":"export const myId=()=> '123456789012345678';","../shell/serverStorage":"export const serverDataEnabled=()=>true;","../shell/bridge":"export const invoke=(_command,args)=>globalThis.native(args);","./imageViewer":"export const registerArchiveImage=()=>{};export const forgetArchiveImage=()=>{};"};
 const output=await build({entryPoints:["core/src/ui/archivedMedia.ts"],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"archive-fixture",setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"stub"}:null);b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));}}]});
 const {document,window}=parseHTML("<html><body></body></html>");const calls=[],shown=[],revoked=[];let next=0;
 const context={module:{exports:{}},document,window,setTimeout,clearTimeout,queueMicrotask,Blob,atob,URL:{createObjectURL:()=>`blob:test-${++next}`,revokeObjectURL:url=>revoked.push(url)},native:async args=>{calls.push(args);return args.offset===undefined?{state:"ready",bytes:3,mime:"video/mp4",url:"https://example.com/media"}:{state:"ready",bytes:3,mime:"video/mp4",offset:0,next:3,data:"YWJj"};}};
 vm.runInNewContext(output.outputFiles[0].text,context);
 const block=context.module.exports.archivedMedia("https://cdn.discordapp.com/attachments/1/2/test.mp4","video",url=>shown.push(url));document.body.append(block);
 const settle=async predicate=>{for(let n=0;n<50&&!predicate();n++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),block.textContent);};
 await settle(()=>!block.querySelector("button").hidden);block.querySelector("button").click();await settle(()=>shown.length===1);
 block.querySelector("button").click();await settle(()=>shown.length===2);
 assert.notEqual(shown[0],shown[1]);assert.equal(calls.filter(args=>args.offset===0).length,2);assert.equal(calls.filter(args=>args.retry===true).length,2);assert.ok(revoked.includes(shown[0]));
});
