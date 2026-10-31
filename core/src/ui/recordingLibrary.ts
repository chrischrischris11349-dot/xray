import {h} from './dom';
import {invoke} from '../shell/bridge';
import {myId} from '../discord';
import {formatDateTime} from '../time';
import {saveAsButton} from './saveAs';
/** One in-memory player per view; no audio download or playback occurs until clicked. */
export function recordingLibrary(target?:string):{element:HTMLElement;refresh():Promise<void>;close():void}{
 const owner=myId(),element=h('section',{class:'pf-block wide'}),status=h('p',{class:'pf-note',attrs:{role:'status'}}),list=h('div'),player=h('div');let active=true,busy=false,url:string|undefined;
 const current=()=>active&&myId()===owner;
 async function refresh(){try{status.textContent='Loading saved recording list…';const rows:any=await invoke('recording_transfer',{payload:{action:'list'}});if(!current())return;if(!Array.isArray(rows))throw Error('Recording list is unavailable.');const selected=rows.filter(row=>row.complete&&(!target||row.participantIds?.includes(target)));
  list.replaceChildren(...selected.map(row=>h('div',{class:'recording-row'},h('span',{text:`${formatDateTime(new Date(row.startedAt))} · ${Math.ceil(row.bytes/1024)} KB${row.partial?' · Partial':''}`}),h('button',{class:'btn ghost',text:'Load audio player',on:{click:()=>void load(row)}}))));status.textContent=selected.length?`${selected.length} saved recordings${target?' associated with this participant’s recorded calls; this does not prove they spoke.':''}`:target?'No recordings associated with this profile. Older clips without participant metadata remain in Intelligence → Recordings.':'No completed recordings saved.';
 }catch(error){if(current())status.textContent=String((error as Error)?.message??error);}}
 async function load(row:any){if(busy||!current())return;busy=true;player.querySelector('audio')?.pause();if(url){URL.revokeObjectURL(url);url=undefined;}player.replaceChildren();try{
  if(!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>32*1024*1024)throw Error('Recording size is invalid or exceeds the 32 MB playback limit.');
  const parts:Uint8Array<ArrayBuffer>[]=[];let offset=0;
  while(offset<row.bytes){if(!current())return;status.textContent=`Loading recording · ${Math.round(offset/row.bytes*100)}%`;const file:any=await invoke('recording_transfer',{payload:{action:'read',id:row.id,offset}});if(!current())return;
   if(file.offset!==offset||file.bytes!==row.bytes||typeof file.data!=='string'||file.data.length>700000)throw Error('Recording chunk was invalid. Update the server if it does not support paged playback.');const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>512*1024||file.next!==offset+bytes.length)throw Error('Recording chunk was incomplete.');parts.push(bytes);offset=file.next;
  }
  url=URL.createObjectURL(new Blob(parts,{type:'audio/webm'}));const audio=h('audio',{attrs:{controls:'',src:url,preload:'metadata','aria-label':'Saved VC recording'}});audio.addEventListener('error',()=>{status.textContent='This recording could not decode. Download the clip or retry loading the saved copy.';});player.append(audio,saveAsButton(url,`xray-vc-${row.id}.webm`));status.textContent='Recording loaded from your server · press Play.';
 }catch(error){if(current())status.textContent=String((error as Error)?.message??error);}finally{busy=false;}}
 element.append(h('h3',{class:'pf-title',text:target?'Recordings involving this profile':'Saved recording playback'}),h('button',{class:'btn ghost',text:'Refresh saved clips',on:{click:()=>void refresh()}}),status,player,list);void refresh();
 return {element,refresh,close(){active=false;player.querySelector('audio')?.pause();if(url)URL.revokeObjectURL(url);}};
}
