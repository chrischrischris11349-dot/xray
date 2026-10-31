import {invoke} from '../shell/bridge';
import {h} from './dom';
import {uiRoot} from './root';
import {addStyle} from '../api/dom';
import {promptText,confirmAction,showDialog} from './dialog';
import {recordingNeedsAttention} from '../voice/recorder';
import {flushHistory} from '../history';
import {flushDmArchive} from '../history/dmArchive';
type Tab={id:string;name:string;open:boolean};
type State={current:string;active:string;limit:number;tabs:Tab[]};
let state:State|undefined,bar:HTMLElement|undefined,card:HTMLElement|undefined,busy=false,error='',mounted=false,revision=0;
function valid(value:any):value is State{return value&&typeof value.current==='string'&&typeof value.active==='string'&&Number.isInteger(value.limit)&&Array.isArray(value.tabs)&&value.tabs.length<=6&&value.tabs.every((tab:any)=>typeof tab.id==='string'&&typeof tab.name==='string'&&typeof tab.open==='boolean');}
export async function refreshAccountTabs():Promise<void>{
 const request=++revision;
 try{const reply=await invoke('account_sessions',{action:'get'});if(request!==revision)return;if(!valid(reply))throw Error('Account tabs could not be read.');state=reply;error='';}
 catch(failure){if(request!==revision)return;error=String((failure as Error)?.message??failure).slice(0,300);}
 draw();
}
async function run(action:string,id?:string,name?:string){
 if(busy)return;busy=true;error='';draw();
 try{const reply=await invoke('account_sessions',{action,id,name});if(valid(reply))state=reply;}
 catch(failure){error=String((failure as Error)?.message??failure).slice(0,300);showDialog({title:'Account tabs',body:error,allowPresentation:true});}
 finally{busy=false;draw();}
}
async function add(){const name=await promptText({title:'New account tab',value:`Account ${(state?.tabs.length??1)+1}`,confirm:'Open sign-in',allowPresentation:true});if(name!==null)await run('add',undefined,name);}
async function rename(tab:Tab){const name=await promptText({title:'Rename account tab',value:tab.name,confirm:'Save label',allowPresentation:true});if(name!==null)await run('rename',tab.id,name);}
async function close(tab:Tab){if(!await confirmAction(`Close ${tab.name}?`,'This disconnects this account from voice and stops its live session. Its login and saved history stay on this device. Reopen it from Account tabs.','Close tab'))return;await run('close',tab.id);}
function draw(){
 const opened=state?.tabs.filter(tab=>tab.open)??[];const visible=opened.length>1;
 document.documentElement.toggleAttribute('data-xray-account-tabs',visible);
 if(bar){bar.hidden=!visible;bar.replaceChildren(...opened.map(tab=>{
  const button=h('button',{class:'account-tab',attrs:{type:'button',role:'tab','aria-label':tab.name,'aria-selected':String(tab.id===state?.current),tabindex:tab.id===state?.current?'0':'-1',title:tab.name},on:{click:()=>void run('activate',tab.id)}},h('span',{class:'account-initial',attrs:{'aria-hidden':'true'},text:Array.from(tab.name)[0]?.toLocaleUpperCase()??'A'}),h('span',{class:'account-tab-label',text:tab.name}));button.disabled=busy;return button;
 }),h('button',{class:'account-tab-add',attrs:{type:'button','aria-label':'Open another account tab',title:'Open another account tab'},text:'+',on:{click:()=>void add()}}));
  const plus=bar.lastElementChild as HTMLButtonElement;plus.disabled=busy||!state||state.tabs.length>=state.limit;
 }
 if(card){card.replaceChildren(h('div',{class:'card-title',text:'Account tabs'}),h('p',{class:'card-sub',text:'Each tab has its own Discord login. Opened tabs stay connected while you switch; each uses additional memory. Sign in normally—no tokens are copied.'}),
  h('div',{class:'account-tab-list'},...(state?.tabs??[]).map(tab=>h('div',{class:'account-tab-row'},h('span',{class:'account-session-initial',attrs:{'aria-hidden':'true'},text:Array.from(tab.name)[0]?.toLocaleUpperCase()??'A'}),h('div',{class:'account-tab-name'},h('strong',{text:tab.name}),h('span',{class:'account-session-state',text:tab.id===state?.current?'Current session':tab.open?'Open in background':'Closed · login retained'})),
   ...(tab.id!==state?.current?[h('button',{class:'btn ghost',text:tab.open?'Switch':'Reopen',attrs:{...(busy?{disabled:''}:{})},on:{click:()=>void run('activate',tab.id)}})]:[]),
   h('button',{class:'btn ghost',text:'Rename',attrs:{...(busy?{disabled:''}:{})},on:{click:()=>void rename(tab)}}),
   ...(tab.id!=='main'&&tab.open?[h('button',{class:'btn ghost',text:'Close tab',attrs:{...(busy?{disabled:''}:{})},on:{click:()=>void close(tab)}})]:[])))),
  h('div',{class:'dialog-actions'},h('button',{class:'btn ghost',text:'Add account tab',attrs:{...(busy||!state||state.tabs.length>=state.limit?{disabled:''}:{})},on:{click:()=>void add()}}),h('button',{class:'btn ghost',text:'Refresh tabs',on:{click:()=>void refreshAccountTabs()}})),h('p',{class:'pf-note',attrs:{role:'status','aria-live':'polite'},text:error||(busy?'Opening account session…':state?`${opened.length} opened · up to ${state.limit} saved tabs. Closing a tab keeps its login; sign out in Discord to remove access.`:'Loading account sessions…')}));}
}
export function accountTabsControl():HTMLElement{if(!card){card=h('section',{class:'card account-tabs-card',attrs:{'aria-label':'Account tabs'}});draw();}return card;}
export function mountAccountTabs():void{
 if(mounted)return;mounted=true;
 bar=h('div',{class:'account-tabs',attrs:{role:'tablist','aria-label':'Discord account tabs'},on:{keydown:(event:KeyboardEvent)=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...bar!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];const index=tabs.indexOf(uiRoot().activeElement as HTMLButtonElement);if(index<0)return;event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next]?.focus();tabs[next]?.click();
 }}});uiRoot().append(bar);
 addStyle(`html[data-xray-account-tabs]{--custom-app-top-bar-height:82px!important}html[data-xray-account-tabs] [class*="base_"]>[class^="bar_"]{padding-bottom:36px!important}html[data-xray-account-tabs] [class*="base_"]>[class^="bar_"]::before{top:23px!important}`);
 void refreshAccountTabs();
}
/** Native restart/close waits for every opened session's own recording guard and flush. */
export async function prepareAccountRestart(request:number):Promise<void>{
 let ready=false;try{if(recordingNeedsAttention())throw Error('Recording is active');await flushDmArchive();await flushHistory();ready=true;}catch{}
 await invoke('account_sessions',{action:'ready',request,ready}).catch(()=>{});
}
