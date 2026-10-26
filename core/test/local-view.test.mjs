import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import vm from "node:vm";
const hooks=new Map(),actions=[],stops=[],commands=[];let answer="Edited system notice";
const message={id:"123456789012345678",channel_id:"223456789012345678",type:2,content:"",author:{id:"323456789012345678"}};
let allowed=true;
const stubs={
 "../api/flux":"export const dispatch=async action=>globalThis.calls.push(action);",
 "../api/menus":"export const menu={group:(...items)=>items,item:item=>item};",
 "../ui/dialog":"export const promptText=async options=>{globalThis.prompt=options;return globalThis.answer()};export const showDialog=()=>{};",
 "./messageModeration":"export const canEditLocally=()=>globalThis.allowed();",
 "./personalLocalEdit":"export const onPersonalEditingChanged=fn=>{globalThis.toggle=fn;return()=>{}};",
 "../api/react":"export const createElement=(type,props,...children)=>({type,props:{...props,children}});",
 "../discord":"export const stores={messages:{getMessage:()=>globalThis.message}};",
};
test("local system rendering and session deletion never rewrite canonical message content",async()=>{
 const output=await build({entryPoints:["core/src/plugins/localMessageEdit.ts"],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"local-fixtures",setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"stub"}:null);b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));}}]});
 const row={id:`chat-messages-${message.channel_id}-${message.id}`,toggleAttribute(name,value){this.hidden=value;},querySelector:()=>({className:"native-content",cloneNode:()=>({textContent:"Original removed someone",querySelectorAll:()=>[]})})};
 const context={module:{exports:{}},calls:actions,message,allowed:()=>allowed,answer:()=>answer,document:{getElementById:()=>row,querySelectorAll:()=>[]},getComputedStyle:()=>({fontFamily:'"gg sans", sans-serif'})};
 vm.runInNewContext(output.outputFiles[0].text,context);
 context.module.exports.default.start({css(){},watch(_selector,fn){fn({id:`chat-messages-${message.channel_id}-${message.id}`,...row});},onElement:(type,fn)=>hooks.set(type,fn),menu(){},onAction(){},command:(...args)=>commands.push(args),onStop:fn=>stops.push(fn),log(){}});
 await context.module.exports.editMessageLocally(message);
 assert.equal(message.content,"");assert.equal(actions.at(-1).message.content,"");assert.equal(actions.at(-1).xrayLocalEdit,true);
 assert.equal(context.prompt.fontFamily,'"gg sans", sans-serif');assert.equal(context.prompt.value,"Original removed someone");
 const props={id:`chat-messages-${message.channel_id}-${message.id}`,className:"native-row",children:"original tree"};
 const overlay=hooks.get("li")(props);assert.equal(overlay.className,"native-row");assert.equal(overlay.children.props.className,"native-content");assert.equal(overlay.children.props.children[0],answer);assert.equal(props.children,"original tree");
 context.module.exports.hideMessageLocally(message);assert.equal(row.hidden,true);assert.ok(!actions.some(action=>action.type==="MESSAGE_DELETE"));
 allowed=false;context.toggle();assert.equal(hooks.get("li")(props),undefined);await assert.rejects(context.module.exports.editMessageLocally(message),/Enable/);
 stops.forEach(fn=>fn());assert.equal(context.module.exports.localEditAvailable(message),false);
});
