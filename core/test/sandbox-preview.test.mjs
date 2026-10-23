import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
const html=readFileSync('shell/sandbox.html','utf8');
test('HTML preview resolves relative assets and retains sandbox restrictions',()=>{
 const {document}=parseHTML(html);const create=document.createElement.bind(document);document.createElement=name=>{const node=create(name);if(name==='base')Object.defineProperty(node,'href',{set(value){this.setAttribute('href',value);}});return node;};runInNewContext(document.querySelector('script').textContent,{document,window:{__sandboxContent:{html:'<img src="images/test.png">',scripts:false,baseUrl:'https://example.com/folder/page.html'}}});
 const frame=document.querySelector('iframe');assert.equal(frame.getAttribute('sandbox'),'');assert.match(frame.srcdoc,/base href="https:\/\/example.com\/folder\/page.html"/);assert.match(frame.srcdoc,/script-src 'none'/);assert.match(frame.srcdoc,/connect-src 'none'/);assert.match(frame.srcdoc,/frame-src 'none'/);
});
test('script opt-in never grants same-origin access',()=>{const {document}=parseHTML(html);const create=document.createElement.bind(document);document.createElement=name=>{const node=create(name);if(name==='base')Object.defineProperty(node,'href',{set(value){this.setAttribute('href',value);}});return node;};runInNewContext(document.querySelector('script').textContent,{document,window:{__sandboxContent:{html:'<p>test</p>',scripts:true}}});assert.equal(document.querySelector('iframe').getAttribute('sandbox'),'allow-scripts');});
