import {dispatch,onAction} from '../api/flux';
import {stores,whenStore,onStoresChanged} from '../discord';
import {pluginState,save} from '../settings';
import {personalBuild} from '../personalBuild';
import {h} from '../ui/dom';
export interface OutputDevice {id:string;name:string;}
export function outputDevices(engine:any):OutputDevice[]{
 try{const value=engine?.getOutputDevices?.();return Object.values(value??{}).filter((device:any)=>typeof device?.id==='string'&&typeof device?.name==='string') as OutputDevice[];}catch{return[];}
}
export function chooseOutput(devices:OutputDevice[],preference:string):OutputDevice|undefined{
 if(preference==='discord')return;
 if(preference==='sonar-chat'){const matches=devices.filter(device=>/steelseries.*sonar.*chat|sonar.*chat/i.test(device.name));return matches.find(device=>!['default','communications'].includes(device.id))??matches[0];}
 return devices.find(device=>device.id===preference);
}
/** Uses Discord's existing output-device action; never changes input, mute or volume. */
export function applyOutputRoute(engine:any,preference:string,send=dispatch):string|undefined{
 const selected=chooseOutput(outputDevices(engine),preference);if(!selected)return;
 if(engine.getOutputDeviceId?.()!==selected.id)send({type:'AUDIO_SET_OUTPUT_DEVICE',id:selected.id});return selected.id;
}
let installed=false,queued=false,lastRequested:string|undefined,view:HTMLElement|undefined,draw=()=>{};
const preference=()=>{const value=pluginState('voice-output-routing').data?.output;return typeof value==='string'?value:personalBuild?'sonar-chat':'discord';};
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;const value=preference(),selected=chooseOutput(outputDevices(stores.mediaEngine),value);if(selected?.id!==lastRequested){lastRequested=selected?.id;if(selected)applyOutputRoute(stores.mediaEngine,value);}draw();});}
export function installVoiceOutputRouting(){if(installed)return;installed=true;whenStore('MediaEngineStore',store=>{onStoresChanged([store],schedule);schedule();});onAction('CONNECTION_OPEN',()=>{lastRequested=undefined;schedule();});}
export function voiceOutputControl():HTMLElement{
 if(view){draw();return view;}
 const label=h('label',{class:'card-title',attrs:{for:'xray-voice-output'},text:'XRay voice output'}),status=h('p',{class:'pf-note',attrs:{role:'status'}}),select=h('select',{class:'dialog-input',attrs:{id:'xray-voice-output','aria-label':'XRay voice output'}});
 draw=()=>{const devices=outputDevices(stores.mediaEngine),value=preference(),id=stores.mediaEngine?.getOutputDeviceId?.(),current=devices.find(device=>device.id===id);const signature=JSON.stringify(devices);
  if(select.dataset.devices!==signature){select.replaceChildren(h('option',{attrs:{value:'discord'},text:'Follow Discord’s output selection'}),h('option',{attrs:{value:'sonar-chat'},text:'SteelSeries Sonar · Chat'}),...devices.map(device=>h('option',{attrs:{value:device.id},text:device.name})));select.dataset.devices=signature;}
  select.value=value;status.textContent=`Current: ${current?.name??id??'Waiting for Discord audio devices'}${value==='sonar-chat'&&!chooseOutput(devices,value)?' · Sonar Chat is not available; existing output was kept.':''}`;
 };
 select.onchange=()=>{(pluginState('voice-output-routing').data??={}).output=select.value;save();lastRequested=undefined;schedule();};
 view=h('section',{class:'card'},h('div',{class:'card-text'},label,h('p',{class:'pf-note',text:'Routes VC independently of other WebView2 apps. Sonar may still display the shared runtime name. Your microphone and VoiceMeeter input stay unchanged.'}),select,status,h('button',{class:'btn ghost',text:'Apply voice output',on:{click:()=>{lastRequested=undefined;schedule();}}})));draw();return view;
}
