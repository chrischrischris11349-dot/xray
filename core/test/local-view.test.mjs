import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import vm from "node:vm";
import {parseHTML} from "linkedom";
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
 "../discord":"export const myId=()=>globalThis.owner;export const stores={messages:{getMessage:()=>globalThis.message}};",
 "../shell/serverStorage":"export const accountDocument=(kind,owner)=>globalThis.documentFor(kind,owner);export const onStorageModeChanged=()=>()=>{};",
};
test("local system rendering and session deletion never rewrite canonical message content",async()=>{
 const output=await build({entryPoints:["core/src/plugins/localMessageEdit.ts"],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"local-fixtures",setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"stub"}:null);b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));}}]});
 const row={id:`chat-messages-${message.channel_id}-${message.id}`,toggleAttribute(name,value){this.hidden=value;},querySelector:()=>({className:"native-content",cloneNode:()=>({textContent:"Original removed someone",querySelectorAll:()=>[]})})};
 const saved=new Map();let offline=false;
 const documentFor=(kind,owner)=>{assert.equal(kind,"local-message-edits");return {value:saved.get(owner)??null,load:async()=>{if(offline)throw Error("offline");},async update(change){if(offline)throw Error("offline");this.value=change(saved.get(owner)??null);saved.set(owner,this.value);}};};
 const context={module:{exports:{}},TextEncoder,owner:"423456789012345678",documentFor,calls:actions,message,allowed:()=>allowed,answer:()=>answer,document:{getElementById:()=>row,querySelectorAll:()=>[]},getComputedStyle:()=>({fontFamily:'"gg sans", sans-serif'})};
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
 assert.match(saved.get(context.owner),/Edited system notice/);
 allowed=true;const restart=(owner=context.owner)=>{context.owner=owner;hooks.clear();stops.length=0;context.module.exports.default.start({css(){},watch(){},onElement:(type,fn)=>hooks.set(type,fn),menu(_id,fn){context.patchMenu=fn;},onAction(){},command(){},onStop:fn=>stops.push(fn),log(){}});};
 restart();for(let n=0;n<5;n++)await Promise.resolve();assert.equal(hooks.get("li")(props)?.children.props.children[0],answer,"reload restores the saved system edit");
 const menu=[];context.patchMenu(menu,{message});assert.ok(menu.flat().some(item=>item?.label==="Reset Local Edit"));
 offline=true;await assert.rejects(context.module.exports.resetMessageLocally(message),/offline/);assert.ok(context.module.exports.hasLocalEdit(message));
 offline=false;await context.module.exports.resetMessageLocally(message);assert.equal(hooks.get("li")(props),undefined);assert.deepEqual(JSON.parse(saved.get(context.owner)).edits,[]);
 await context.module.exports.editMessageLocally(message);stops.forEach(fn=>fn());restart("523456789012345678");for(let n=0;n<5;n++)await Promise.resolve();assert.equal(hooks.get("li")(props),undefined,"other accounts do not inherit edits");stops.forEach(fn=>fn());
});
test("saved overrides round-trip without hidden flags, expire only on reset, and reject damaged data atomically",async()=>{
 const output=await build({entryPoints:["core/src/ui/localMessageView.ts"],bundle:true,write:false,platform:"node",format:"cjs"});const context={module:{exports:{}},TextEncoder};vm.runInNewContext(output.outputFiles[0].text,context);
 const View=context.module.exports.SessionMessageView,first=new View();first.edit(message,"Saved text",true);first.hide(message);
 const raw=first.serialize();assert.doesNotMatch(raw,/hidden|expires|retention/);
 const restored=new View();restored.load(raw);assert.equal(restored.getById(message.id).content,"Saved text");assert.equal(restored.get(message).system,true);assert.equal(restored.get(message).hidden,undefined);
 for(const invalid of ['not JSON','{"version":2,"edits":[]}',JSON.stringify({version:1,edits:[{...message,content:"x".repeat(4001),system:false}]}),JSON.stringify({version:1,edits:[{...message,system:false},{...message,system:false}]})]){assert.throws(()=>restored.load(invalid),/unreadable/);assert.equal(restored.get(message).content,"Saved text");}
 restored.reset(message);const restarted=new View();restarted.load(restored.serialize());assert.equal(restarted.get(message),undefined);
});
test("the account switch remembers consent across reloads and presentation changes do not turn editing off",async()=>{
 const prefs={},events=new Map();let stops=[];
 const stubs={"../discord":"export const myId=()=>globalThis.owner;","../personalBuild":"export const personalBuild=true;","../ui/dialog":"export const confirmAction=async()=>true;","../settings":"export const pluginState=id=>globalThis.prefs[id]??=( {} );export const save=()=>{};","../ui/root":"export const uiRoot=()=>globalThis.root;","./root":"export const uiRoot=()=>globalThis.root;","./icons":"export const icon=()=>'';","../api/dom":"export const addStyle=()=>{};","../shell/notifications":"export const setPresentationNotificationPrivacy=()=>{};"};
 const output=await build({stdin:{contents:'export {default as control,personalEditingEnabled} from "./core/src/plugins/personalLocalEdit";export {setPresentationMode} from "./core/src/ui/presentation";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"control-fixture",setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"stub"}:null);b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));}}]});
 const {document,window}=parseHTML('<html><body></body></html>'),host=document.createElement('xray-root'),root=host.attachShadow({mode:'open'});document.body.append(host);
 const context={module:{exports:{}},prefs,document,window,root,Event:window.Event,owner:"423456789012345678"};vm.runInNewContext(output.outputFiles[0].text,context);
 const api=context.module.exports,start=()=>api.control.start({onAction:(name,fn)=>events.set(name,fn),onStop:fn=>stops.push(fn)});start();assert.equal(api.personalEditingEnabled(),false);
 root.querySelector('button').click();await Promise.resolve();await Promise.resolve();assert.equal(api.personalEditingEnabled(),true);
 api.setPresentationMode(true);assert.equal(host.hasAttribute('data-presentation'),true);assert.equal(api.personalEditingEnabled(),true);assert.ok(root.querySelector('.personal-edit-indicator[data-xray-plugin-ui]'));
 stops.forEach(fn=>fn());stops=[];start();assert.equal(api.personalEditingEnabled(),true,"reload remembers the account opt-in");assert.equal(root.querySelector('button').getAttribute('aria-pressed'),"true");
 api.setPresentationMode(false);assert.equal(api.personalEditingEnabled(),true);assert.equal(host.hasAttribute('data-presentation'),false);
 context.owner="523456789012345678";events.get('CONNECTION_OPEN')();assert.equal(api.personalEditingEnabled(),false,"other accounts start off");stops.forEach(fn=>fn());
});
