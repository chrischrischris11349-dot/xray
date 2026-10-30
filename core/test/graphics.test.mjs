import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {build} from 'esbuild';import {parseHTML} from 'linkedom';
const mocks={
 '../shell/bridge':`export const invoke=async(command,args)=>{globalThis.calls.push(args.action);if(args.action==='get')return {...globalThis.graphics};if(globalThis.fail)throw Error('Could not save preference');if(args.action==='set'){globalThis.graphics.enabled=args.enabled;globalThis.graphics.restartRequired=args.enabled!==globalThis.graphics.active;return {...globalThis.graphics};}return {};};`,
 '../history':`export const flushHistory=async()=>{globalThis.calls.push('history');if(globalThis.unsaved)throw Error('History not saved');};`,
 '../history/dmArchive':`export const flushDmArchive=async()=>{globalThis.calls.push('dm');};`,
 '../voice/recorder':`export const recordingNeedsAttention=()=>globalThis.recording;`,
 './picker':`export const showPicker=filter=>{globalThis.filter=filter;};`
};
const result=await build({entryPoints:['core/src/ui/graphics.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'graphics-fixture',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}));}}]});
const tick=()=>new Promise(setImmediate);
function mount(){const {document,window}=parseHTML('<html><body></body></html>'),context={module:{exports:{}},document,calls:[],graphics:{enabled:true,active:true,restartRequired:false,externalOverride:false},recording:false};vm.runInNewContext(result.outputFiles[0].text,context);const api=context.module.exports,view=api.graphicsControl();document.body.append(view);return{context,view,api,click(button){button.dispatchEvent(new window.Event('click'));}};}
test('graphics preference saves separately from the current launch and failed saves keep the previous setting',async()=>{
 const f=mount();await tick();const toggle=f.view.querySelector('[role=switch]'),restart=[...f.view.querySelectorAll('button')].find(b=>b.textContent==='Restart to apply');assert.equal(toggle.getAttribute('aria-checked'),'true');assert.equal(restart.hidden,true);
 f.click(toggle);await tick();assert.equal(toggle.getAttribute('aria-checked'),'false');assert.equal(restart.hidden,false);assert.match(f.view.textContent,/Current launch: Automatic GPU/);assert.match(f.view.textContent,/Restart required/);
 f.context.fail=true;f.click(toggle);await tick();assert.equal(toggle.getAttribute('aria-checked'),'false');assert.match(f.view.textContent,/Could not save/);
});
test('graphics restart flushes pending data and refuses to restart during recording or failed persistence',async()=>{
 const f=mount();await tick();f.context.calls=[];f.context.recording=true;await assert.rejects(f.api.restartForGraphics(),/voice recording/);assert.equal(f.context.calls.length,0);
 f.context.recording=false;f.context.unsaved=true;await assert.rejects(f.api.restartForGraphics(),/History not saved/);assert.deepEqual(f.context.calls,['dm','history']);
 f.context.unsaved=false;f.context.calls=[];await f.api.restartForGraphics();assert.deepEqual(f.context.calls,['dm','history','restart']);
});
test('performance shortcut opens the existing picker without enabling plugins',async()=>{
 const f=mount();await tick();f.context.calls=[];f.click([...f.view.querySelectorAll('button')].find(b=>b.textContent==='Performance plugins'));assert.equal(f.context.filter,'Performance');assert.equal(f.context.calls.length,0);
});
