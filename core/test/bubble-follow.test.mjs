import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';
const mocks={'../settings':'export const pluginState=key=>globalThis.states[key]??={};export const save=()=>globalThis.saves++;','./root':'export const onKey=fn=>{globalThis.key=fn;return()=>{}};'};
const bundle=await build({entryPoints:['core/src/ui/floatingPanel.ts'],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'floating-fixture',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}));}}]});
function fixture(states={}){
 const {window,document}=parseHTML('<html><body><div class="qr"><div class="qr-head" tabindex="0">Messages</div><div class="msgs">Keep this conversation mounted</div></div></body></html>');
 const frames=new Map();let next=0;
 const scope={module:{exports:{}},states,saves:0,window,HTMLElement:window.HTMLElement,innerWidth:1280,innerHeight:820,setTimeout,clearTimeout,requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{observe(){}disconnect(){}}};
 vm.runInNewContext(bundle.outputFiles[0].text,scope);const panel=document.querySelector('.qr');panel.setPointerCapture=()=>{};panel.hasPointerCapture=()=>false;
 const control=scope.module.exports.makeFloatingPanel(panel,{key:'quickReplyWindow',header:'.qr-head',initial:{x:700,y:150,width:360,height:400}});
 return{scope,panel,control,states,document,window};
}
test('open conversation follows bubble drag on the compositor and saves once on release',()=>{
 const f=fixture(),messages=f.panel.querySelector('.msgs');f.control.moveBy(60,30,true);assert.equal(f.panel.style.left,'700px');assert.equal(f.panel.style.transform,'translate3d(60px,30px,0)');assert.equal(f.scope.saves,0);
 f.control.moveBy(100,50,true);assert.equal(f.panel.style.transform,'translate3d(100px,50px,0)','deltas are from drag start, not accumulated');
 f.control.moveBy(100,50);assert.equal(f.panel.style.left,'800px');assert.equal(f.panel.style.top,'200px');assert.equal(f.panel.style.transform,'');assert.equal(f.scope.saves,1);assert.equal(f.panel.querySelector('.msgs'),messages);f.control();
});
test('following preserves a manually resized panel and remains inside the viewport',()=>{
 const f=fixture({quickReplyWindow:{data:{x:300,y:120,width:500,height:500}}});f.control.moveBy(5000,5000,true);assert.equal(f.panel.style.transform,'translate3d(472px,192px,0)');f.control.moveBy(5000,5000);
 assert.equal(f.panel.style.left,'772px');assert.equal(f.panel.style.top,'312px');assert.equal(f.panel.style.width,'500px');assert.equal(f.panel.style.height,'500px');f.control();
});
test('keyboard or corner moves follow from the current panel offset and restore after reopening',()=>{
 const states={};const first=fixture(states);first.control.moveBy(-100,20);first.control.moveBy(-12,0);assert.equal(first.panel.style.left,'588px');assert.equal(first.panel.style.top,'170px');first.control();
 const reopened=fixture(states);assert.equal(reopened.panel.style.left,'588px');assert.equal(reopened.panel.style.top,'170px');reopened.control();
});
test('closing during a drag saves its last visible position without leaving a frame loop',()=>{
 const f=fixture();f.control.moveBy(20,30,true);f.control();assert.equal(f.scope.saves,1);assert.equal(f.states.quickReplyWindow.data.x,720);assert.equal(f.states.quickReplyWindow.data.y,180);
});
