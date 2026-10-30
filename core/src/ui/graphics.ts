import {invoke} from '../shell/bridge';
import {flushHistory} from '../history';
import {flushDmArchive} from '../history/dmArchive';
import {recordingNeedsAttention} from '../voice/recorder';
import {h} from './dom';
import {showPicker} from './picker';
type GraphicsState={enabled:boolean;active:boolean;restartRequired:boolean;externalOverride:boolean};
let state:GraphicsState|undefined,view:HTMLElement|undefined,busy=false,error='',activity='';
let draw=()=>{};
export async function restartForGraphics():Promise<void>{
 if(recordingNeedsAttention())throw Error('Finish and save your voice recording before restarting.');
 await flushDmArchive();await flushHistory();await invoke('graphics_settings',{action:'restart'});
}
async function run(action:'get'|'set'|'restart'){
 if(busy)return;busy=true;error='';activity=action==='get'?'Reading desktop graphics settings…':action==='set'?'Saving graphics preference…':'Saving pending messages and restarting…';draw();
 try{
  if(action==='restart')await restartForGraphics();
  else {const reply=await invoke('graphics_settings',{action,...(action==='set'?{enabled:!state?.enabled}:{})}) as GraphicsState;
   if(!reply||['enabled','active','restartRequired','externalOverride'].some(key=>typeof reply[key as keyof GraphicsState]!=='boolean'))throw Error('The desktop graphics settings could not be read.');
   state=reply;
  }
 }catch(failure){error=String((failure as Error)?.message??failure).slice(0,300);}finally{busy=false;draw();}
}
export function graphicsControl():HTMLElement{
 if(view)return view;
 const toggle=h('button',{class:'switch',attrs:{type:'button',role:'switch','aria-label':'Hardware acceleration','aria-describedby':'xray-graphics-explanation'},on:{click:()=>void run('set')}},h('span'));
 const status=h('p',{class:'pf-note',attrs:{role:'status','aria-live':'polite'}});
 const restart=h('button',{class:'btn',text:'Restart to apply',on:{click:()=>void run('restart')}});
 const refresh=h('button',{class:'btn ghost',text:'Refresh graphics status',on:{click:()=>void run('get')}});
 draw=()=>{
  toggle.disabled=busy||!state;toggle.setAttribute('aria-checked',String(state?.enabled??false));toggle.classList.toggle('on',!!state?.enabled);
  restart.hidden=!state?.restartRequired;restart.disabled=busy;refresh.disabled=busy;
  status.textContent=error||(busy?activity:state?`Current launch: ${state.active?'Automatic GPU, when available':'Software compatibility'}${state.restartRequired?' · Restart required to apply your saved choice.':''}${state.externalOverride?' · External WebView2 GPU arguments may override this preference.':''}`:'Loading desktop graphics settings…');
 };
 view=h('section',{class:'card graphics-card',attrs:{'aria-label':'Graphics and performance'}},
  h('div',{class:'graphics-row'},h('div',{class:'card-text'},h('div',{class:'card-title',text:'Hardware acceleration'}),h('p',{class:'card-sub',attrs:{id:'xray-graphics-explanation'},text:'Recommended on. Uses WebView2’s automatic GPU path for rendering and supported video. Turn off only to troubleshoot graphics problems.'})),toggle),
  status,h('p',{class:'pf-note',text:'Changing this needs a full restart and disconnects voice. Pending messages must save first. WebView2 can still fall back when the driver or device cannot accelerate.'}),
  h('div',{class:'dialog-actions'},restart,refresh,h('button',{class:'btn ghost',text:'Performance plugins',on:{click:()=>showPicker('Performance')}}),h('button',{class:'btn ghost',text:'Typing feel',on:{click:()=>showPicker('Typing')}})),
  h('p',{class:'pf-note',text:'Includes FastDiscord and UI Optimisations from this build. These are optional; some settings reduce motion or animated media. Your existing choices stay as they are.'}));
 draw();void run('get');return view;
}
