import {h} from './dom';
import {myId} from '../discord';
import {offlineDb} from '../shell/offlineDb';
import {offlineStorageStats,offlineStorageMessage,onOfflineStorageChanged,copyServerArchive,stopOfflineCopy,syncOfflineStorage,clearDownloadedCache} from '../shell/offline';
import {reloadSavedDocuments} from '../shell/serverStorage';
import {flushHistory} from '../history';
import {confirmAction,showDialog} from './dialog';
import {saveTextAs} from './saveAs';
let view:HTMLElement|undefined,refreshView:(()=>void)|undefined;
export function offlineStorageControl():HTMLElement{
 if(view){refreshView?.();return view;}
 const status=h('p',{class:'pf-note',attrs:{role:'status'}}),stats=h('p',{class:'pf-note'}),actions=h('div',{class:'pf-journal-actions'});let busy=false,failure='';
 const draw=()=>{status.textContent=failure||offlineStorageMessage();};
 const refresh=async()=>{const owner=myId();try{const value=await offlineStorageStats(owner);if(myId()===owner)stats.textContent=`${(value.bytes/1048576).toFixed(1)} MB on this device · ${value.documents} profile records · ${value.messages} messages · ${value.pending} pending saves`;}catch(error){stats.textContent=String((error as Error)?.message??error);}draw();};
 const run=(job:()=>Promise<unknown>)=>{if(busy)return;busy=true;failure='';actions.querySelectorAll('button').forEach(b=>b.disabled=true);void job().catch(error=>{failure=String((error as Error)?.message??error);draw();}).finally(()=>{busy=false;actions.querySelectorAll('button').forEach(b=>b.disabled=false);void refresh();});};
 const media=h('input',{attrs:{type:'checkbox'}});media.checked=true;
 actions.append(h('button',{class:'btn ghost',text:'Copy server data to this device',on:{click:()=>run(()=>copyServerArchive(myId(),media.checked))}}),h('button',{class:'btn ghost',text:'Retry server uploads',on:{click:()=>run(async()=>{await flushHistory();await syncOfflineStorage();await reloadSavedDocuments();})}}),h('button',{class:'btn ghost',text:'Clear downloaded cache',on:{click:()=>run(async()=>{if(await confirmAction('Clear downloaded cache?','Downloaded pictures, videos, playback copies and saved lookup responses will be removed from this device. Saved message history, local edits, local recordings and pending uploads are kept. Reconnect their sources to download cleared files again.','Clear cache'))await clearDownloadedCache();})}}),h('button',{class:'btn ghost',text:'Export local history',on:{click:()=>run(async()=>{const owner=myId();if(!owner)throw Error('Sign in first.');const rows=(await offlineDb.list(owner)).filter(r=>!['media-part','recording-part','recording-playback','media-meta'].includes(r.kind));if(myId()!==owner)throw Error('Account changed; export cancelled.');await saveTextAs(`xray-local-history-${owner}.json`,JSON.stringify({version:1,owner,exportedAt:new Date().toISOString(),records:rows},null,2));})}}),h('button',{class:'btn ghost',text:'Refresh details',on:{click:()=>void refresh()}}));
 const lookups=h('div');
 actions.append(h('button',{class:'btn ghost',text:'View saved lookups',on:{click:()=>run(async()=>{
  const owner=myId();if(!owner)return;
  const records=(await offlineDb.list(owner,'lookup')).sort((a,b)=>b.at-a.at).slice(0,30);
  if(myId()!==owner)return;
  lookups.replaceChildren(h('p',{class:'pf-note',text:records.length?'Saved provider responses · historical results, not new live searches':'No saved lookup responses on this device yet.'}),...records.map(record=>{
   let provider='Provider';try{const [command,args]=JSON.parse(record.id);provider=args?.provider??(command==='oathnet_lookup'?'Oathnet':provider);}catch{}
   return h('button',{class:'btn ghost',text:`${provider} · ${new Date(record.at).toLocaleString()}`,on:{click:()=>{
    if(myId()===owner)showDialog({title:`Saved ${provider} response`,body:`Historical provider data saved ${new Date(record.at).toLocaleString()}. This is not a new live lookup.`,code:JSON.stringify(record.data,null,2)});
   }}});
  }));
 })}}));
 view=h('section',{class:'card offline-storage-control'},h('div',{class:'card-text'},h('div',{class:'card-title',text:'Local backup & cache'}),h('p',{class:'pf-note',text:'Server preferred, with automatic local fallback. Previously copied history and media remain available during an outage. Local backups use disk space; 1 GB maximum. Uncopied server-only files need the server to return.'}),status,stats,h('label',{class:'pf-history-option'},media,'Include media and playable recordings when copying'),actions,h('button',{class:'btn ghost',text:'Pause server copy',on:{click:stopOfflineCopy}}),lookups));
 onOfflineStorageChanged(draw);refreshView=()=>void refresh();void refresh();return view;
}
