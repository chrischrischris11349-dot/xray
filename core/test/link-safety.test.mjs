import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';import {parseHTML} from 'linkedom';
const output=await build({entryPoints:['core/src/ui/linkPolicy.ts'],bundle:true,write:false,platform:'node',format:'cjs'}),context={module:{exports:{}},URL};vm.runInNewContext(output.outputFiles[0].text,context);const {inspectLink}=context.module.exports;
test('masked labels, lookalike domains and shorteners expose the canonical destination without fetching it',()=>{
 assert.equal(inspectLink('https://example.net/a','Read more').masked,true);
 const spoof=inspectLink('https://discord.com.attacker.example/a','https://discord.com');assert.equal(spoof.mismatch,true);assert.equal(spoof.host,'discord.com.attacker.example');
 assert.equal(inspectLink('https://example.net/a','https://example.net/a').masked,false);
 assert.ok(inspectLink('https://bit.ly/abc','Video').reasons.some(reason=>reason.startsWith('Shortened')));
 assert.ok(inspectLink('https://xn--pple-43d.com','Apple').reasons.some(reason=>reason.startsWith('Internationalized')));
 assert.ok(inspectLink('https://example.net','abc\u202edef').reasons.some(reason=>reason.includes('hidden')));
 assert.equal(inspectLink('https://discord.com@attacker.example','Discord').blocked,true);
 assert.ok(inspectLink('http://example.net').reasons.some(reason=>reason.includes('unencrypted')));
 assert.equal(inspectLink('/channels/@me','Friends').masked,false);assert.equal(inspectLink('/channels/@me','Friends').external,false);
 for(const href of ['javascript:alert(1)','data:text/html,hi','file:///C:/secret'])assert.equal(inspectLink(href),null);
});
async function guard(){
 const {document,window}=parseHTML('<html><body><a href="https://attacker.example/track">https://discord.com</a></body></html>'),host=document.createElement('xray-root'),root=host.attachShadow({mode:'open'});document.body.append(host);const old=document.createElement('section');old.id='existing-report';root.append(old);const opens=[];
 const stubs={'../shell/bridge':'export const invoke=async(...args)=>globalThis.opens.push(args);','./root':'export const uiRoot=()=>globalThis.root;export const onKey=()=>()=>{};','./clipboard':'export const writeClipboard=async()=>true;','../api/dom':'export const watchElements=()=>()=>{};export const addStyle=()=>()=>{};'};
 const compiled=await build({entryPoints:['core/src/ui/linkSafety.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'guard-fixtures',setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:'stub'}:null);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
 window.open=(...args)=>opens.push(args);const ctx={module:{exports:{}},opens,root,document,window,URL,Element:window.Element,HTMLElement:window.HTMLElement,location:{href:'https://discord.com/channels/@me'}};vm.runInNewContext(compiled.outputFiles[0].text,ctx);ctx.module.exports.installLinkSafetySurface(document);
 return {document,window,root,opens,api:ctx.module.exports};
}
test('click preview blocks opening, preserves the report, snapshots the destination and permits only explicit Open',async()=>{
 const f=await guard(),anchor=f.document.querySelector('a'),event=new f.window.Event('click',{bubbles:true,cancelable:true});anchor.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(f.opens.length,0);assert.ok(f.root.querySelector('#existing-report'));assert.match(f.root.querySelector('.link-warning').textContent,/attacker.example/);
 anchor.href='https://changed.example';[...f.root.querySelectorAll('button')].find(button=>button.textContent==='Open link').click();await Promise.resolve();await Promise.resolve();assert.equal(f.opens.length,1);assert.equal(f.opens[0][0],'open_reviewed_link');assert.equal(f.opens[0][1].url,'https://attacker.example/track');assert.equal(f.root.querySelector('.link-warning'),null);assert.ok(f.root.querySelector('#existing-report'));
});
test('Cancel, credential blocking and internal Discord links never open an external window',async()=>{
 const f=await guard(),promise=f.api.openExternalLink('https://outside.example','Video');assert.equal(f.opens.length,0);f.root.querySelector('button').click();await promise;assert.equal(f.opens.length,0);
 const denied=f.api.openExternalLink('https://user:password@outside.example','Discord');assert.ok(![...f.root.querySelectorAll('button')].some(button=>button.textContent==='Open link'));f.root.querySelector('button').click();await denied;assert.equal(f.opens.length,0);
 const anchor=f.document.querySelector('a');anchor.href='https://discord.com/channels/@me';anchor.textContent='Friends';const event=new f.window.Event('click',{bubbles:true,cancelable:true});anchor.dispatchEvent(event);assert.equal(event.defaultPrevented,false);
 anchor.href='https://discord.com/channels/@me/123456789012345678';anchor.textContent='Friend\u200e · Online';const formatted=new f.window.Event('click',{bubbles:true,cancelable:true});anchor.dispatchEvent(formatted);assert.equal(formatted.defaultPrevented,false);assert.equal(f.opens.length,0);assert.equal(f.root.querySelector('.link-warning'),null);
});
