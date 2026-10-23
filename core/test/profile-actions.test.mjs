import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { parseHTML } from "linkedom";

const mocks = {
  "../api/menus": 'export const aboutElement=()=>({user:{id:"fixture"}}),menu={item:x=>x};',
  "../discord": 'export const http=()=>null,stores={};',
  "../settings": 'export const pluginState=()=>({}),save=()=>{};',
  "../ui/dialog": 'export const copyText=()=>{},promptText=()=>{},showDialog=()=>{};',
  "../ui/icons": 'export const icon=()=>\'<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/></svg>\';',
  "../ui/profile": 'export const showProfile=()=>globalThis.opened++;',
};
const result = await build({ entryPoints:["core/src/plugins/people.ts"], bundle:true, write:false, platform:"node", format:"cjs", plugins:[{
  name:"profile-action-fixture", setup(b) {
    b.onResolve({filter:/.*/},args=>args.path in mocks ? {path:args.path,namespace:"fixture"} : undefined);
    b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path]}));
  }
}] });

function mount(markup) {
  const {document,window} = parseHTML(`<html><body>${markup}</body></html>`);
  const context={module:{exports:{}},document,opened:0,KeyboardEvent:class extends window.Event { constructor(type,options){super(type,options);Object.assign(this,options);} }};
  vm.runInNewContext(result.outputFiles[0].text,context);
  let visit,stop;
  context.module.exports.peoplePlugins[0].start({menu(){},css(){},watch(_selector,callback){visit=callback;},onStop(callback){stop=callback;}});
  return {document,window,context,visit,stop};
}

for (const wrapped of [false,true]) test(`profile report is a peer of More (${wrapped ? "tooltip wrappers" : "direct buttons"})`,()=>{
  const more='<button class="bannerButton_fixture" aria-label="More">...</button>';
  const f=mount(`<div class="userProfile_fixture"><div id="actions"><button>Message</button><button>Add friend</button>${wrapped ? `<span><span>${more}</span></span>` : more}</div></div>`);
  const original=f.document.querySelector('[aria-label="More"]'),row=f.document.getElementById("actions");
  original.getBoundingClientRect=()=>({width:32,height:32});
  f.visit(original);
  const button=f.document.querySelector('.xray-details');
  assert.equal(button.parentElement,row);
  assert.ok(button.nextElementSibling===original || button.nextElementSibling.contains(original));
  assert.equal(original.parentElement.querySelectorAll('.xray-details').length,wrapped ? 0 : 1);
  assert.equal(button.style.getPropertyValue('--xray-profile-action-height'),'32px');
  f.visit(original);f.visit(button);
  assert.equal(row.querySelectorAll('.xray-details').length,1);
  button.dispatchEvent(new f.window.Event('click'));
  assert.equal(f.context.opened,1);
  f.stop();
  assert.equal(row.children.length,3);
  assert.ok(original.isConnected);
});

test("unrecognized isolated controls are left intact",()=>{
  const f=mount('<div><span><button aria-label="More">...</button></span></div>');
  f.visit(f.document.querySelector('button'));
  assert.equal(f.document.querySelector('.xray-details'),null);
  f.stop();assert.ok(f.document.querySelector('button'));
});
