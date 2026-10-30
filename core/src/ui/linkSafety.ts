import {inspectLink,type LinkAssessment} from './linkPolicy';
import {h} from './dom';
import {onKey,uiRoot} from './root';
import {writeClipboard} from './clipboard';
import {watchElements,addStyle} from '../api/dom';
import {invoke} from '../shell/bridge';
let installed=false,pending:(()=>void)|undefined;
const surfaces=new WeakSet<EventTarget>();
function anchorAt(event:Event):HTMLAnchorElement|null{
 for(const part of event.composedPath()){if(part instanceof Element){const anchor=part.closest<HTMLAnchorElement>('a[href]');if(anchor)return anchor;}}
 return null;
}
function assessment(anchor:HTMLAnchorElement){return inspectLink(anchor.getAttribute('href')??'',anchor.innerText||anchor.textContent||anchor.getAttribute('aria-label')||'',location.href);}
function annotate(anchor:HTMLAnchorElement):void{
 const check=assessment(anchor);if(!check)return;
 const title=`Opens ${check.host}\n${check.href}${check.reasons.length?'\n'+check.reasons.join('\n'):''}`;
 anchor.title=title;anchor.toggleAttribute('data-xray-masked-link',check.masked||check.mismatch);anchor.setAttribute('data-xray-link-host',check.host);
}
export function confirmExternalLink(value:string,label=''):Promise<boolean>{
 const check=inspectLink(value,label);if(!check)return Promise.resolve(false);
 if(!check.external&&!check.blocked)return Promise.resolve(true);
 return showLink(check);
}
function showLink(check:LinkAssessment):Promise<boolean>{
 pending?.();
 return new Promise(resolve=>{
  const root=uiRoot(),previous=root.activeElement??document.activeElement;
  let finished=false,stop=()=>{};
  const done=(allowed:boolean)=>{if(finished)return;finished=true;stop();scrim.remove();pending=undefined;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});resolve(allowed);};
  const status=h('p',{class:'pf-note',attrs:{role:'status'}});
  const cancel=h('button',{class:'btn ghost',text:'Cancel',on:{click:()=>done(false)}});
  const copy=h('button',{class:'btn ghost',text:'Copy destination',on:{click:()=>void writeClipboard(check.href,copy).then(ok=>{status.textContent=ok?'Destination copied.':'Select the destination above and press Ctrl+C.';})}});
  const open=h('button',{class:'btn',attrs:{...(check.blocked?{disabled:''}:{})},text:'Open link',on:{click:()=>done(true)}});
  const controls=[cancel,copy,...(check.blocked?[]:[open])];
  const dialog=h('div',{class:'dialog link-warning',attrs:{role:'dialog','aria-modal':'true','aria-labelledby':'xray-link-warning-title'}},
   h('h2',{class:'dialog-title',attrs:{id:'xray-link-warning-title'},text:check.blocked?'Link blocked':check.mismatch?'Link destination differs':'Open external website?'}),
   h('div',{class:'link-destination-host',attrs:{dir:'ltr'},text:check.host}),
   h('dl',{class:'dialog-facts'},h('dt',{text:'Displayed text'}),h('dd',{text:check.label}),h('dt',{text:'Actual destination'}),h('dd',{class:'link-destination',attrs:{dir:'ltr'},text:check.href})),
   ...check.reasons.map(reason=>h('p',{class:'pf-note',text:reason})),
   h('p',{class:'pf-note',text:'The site can see the network address used by your browser. Redirects may change the destination. XRay has not contacted this link to inspect it.'}),status,h('div',{class:'dialog-actions'},cancel,copy,...(check.blocked?[]:[open])));
  const scrim=h('div',{class:'scrim dialog-scrim link-warning-scrim',attrs:{'data-explicit-dialog':''},on:{mousedown:(event:MouseEvent)=>{if(event.target===scrim)done(false);}}},dialog);
  root.append(scrim);pending=()=>done(false);
  stop=onKey(event=>{if(event.key==='Escape'){done(false);return true;}if(event.key==='Tab'){const current=controls.indexOf(root.activeElement as HTMLButtonElement),next=(current+(event.shiftKey?-1:1)+controls.length)%controls.length;controls[next].focus();return true;}if(event.key==='Enter'||event.key===' '){(controls.includes(root.activeElement as HTMLButtonElement)?root.activeElement as HTMLButtonElement:cancel).click();return true;}return false;},true);
  cancel.focus();
 });
}
export async function openExternalLink(value:string,label=''):Promise<void>{
 const check=inspectLink(value,label);if(!check||check.blocked){if(check)await showLink(check);return;}
 if(await confirmExternalLink(check.href,label))try{await invoke('open_reviewed_link',{url:check.href});}catch(error){await showLink({...check,blocked:true,reasons:[...check.reasons,String((error as Error)?.message??error).slice(0,300)]});}
}
export function installLinkSafetySurface(surface:EventTarget):void{
 if(surfaces.has(surface))return;surfaces.add(surface);
 const hover=(event:Event)=>{const anchor=anchorAt(event);if(anchor)annotate(anchor);};
 const click=(event:Event)=>{const mouse=event as MouseEvent;if(event.type==='auxclick'&&mouse.button!==1)return;const anchor=anchorAt(event);if(!anchor||anchor.hasAttribute('download'))return;const check=assessment(anchor);if(!check||!check.external&&!check.blocked)return;event.preventDefault();event.stopImmediatePropagation();void openExternalLink(check.href,check.label);};
 surface.addEventListener('pointerover',hover,true);surface.addEventListener('focusin',hover,true);surface.addEventListener('click',click,true);surface.addEventListener('auxclick',click,true);
}
export function installLinkSafety():void{
 if(installed)return;installed=true;installLinkSafetySurface(window);
 addStyle('a[data-xray-masked-link]{text-decoration-style:dashed!important}a[data-xray-masked-link]::after{content:" → " attr(data-xray-link-host);font-size:.8em;opacity:.85;unicode-bidi:isolate}');
 watchElements('a[href]',node=>annotate(node as HTMLAnchorElement));
}
