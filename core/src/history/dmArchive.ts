import {onAction,intercept} from '../api/flux';
import {myId,http,stores} from '../discord';
import {invoke} from '../shell/bridge';
import {serverDataEnabled,onStorageModeChanged} from '../shell/serverStorage';
import {collectionArray,channelList} from '../ui/messageHistory';
import {searchDmPage} from '../ui/messageSearch';
import {dmSnapshot} from './dmSnapshot';
import {backfillDm,type DmScope} from './dmBackfill';
let owner:string|undefined,scopes:DmScope[]=[],generation=0,job:{target:string;cancel:boolean;promise:Promise<void>}|undefined;
let status='Load a saved archive or start saving accessible past DMs.',error='',tail=Promise.resolve(),pending=0;
const listeners=new Set<()=>void>(),notify=()=>listeners.forEach(fn=>fn());
export const onDmArchiveChanged=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const dmArchiveStatus=()=>({status,error,busy:!!job,target:job?.target,pending});
const request=(account:string,payload:any)=>invoke('message_archive',{payload:{...payload,owner:account}}) as Promise<any>;
export async function loadDmArchive(target?:string):Promise<any>{const account=myId();if(!account||!serverDataEnabled(account))throw Error('Enable Store profile data on my server first.');const result=await request(account,{action:'status',...(target?{target}:{})});if(myId()===account){if(owner!==account){owner=account;scopes=[];}scopes=target?[...scopes.filter(s=>s.target!==target),...result.scopes]:result.scopes;}return result;}
export function knownDmChannels(target:string):string[]{return channelList(stores.channels?.getMutablePrivateChannels?.()).filter(c=>[1,3].includes(c.type)&&collectionArray(c.recipients??c.rawRecipients).some(user=>(typeof user==='string'?user:user?.id)===target)).map(c=>c.id);}
export async function savePastDms(target:string):Promise<void>{
 if(job)throw Error('Pause the current history load before starting another.');const account=myId();if(!account||!serverDataEnabled(account))throw Error('Enable Store profile data on my server first.');
 const client=http();if(!client?.get)throw Error('Discord message loading is not ready.');
 const serial=generation,run={target,cancel:false,promise:Promise.resolve()};job=run;error='';
 const active=()=>!run.cancel&&generation===serial&&myId()===account&&serverDataEnabled(account);
 run.promise=(async()=>{
  await loadDmArchive(target);if(!active())return;
  const channels=[...new Set([...knownDmChannels(target),...scopes.filter(s=>s.target===target).map(s=>s.channel)])];if(!channels.length)throw Error('Open a DM with this person first. Only known, accessible conversations can be saved.');
  const configured=await request(account,{action:'configure',target,channels,enabled:true});if(!active())return;
  owner=account;scopes=[...scopes.filter(s=>s.target!==target),...configured.scopes];
  for(let index=0;index<configured.scopes.length&&active();index++){
   const scope=configured.scopes[index];let pages=0;status=`Saving past DMs · conversation ${index+1}/${configured.scopes.length}`;notify();
   await backfillDm(scope,{active,page:before=>searchDmPage(r=>client.get(r),scope.channel,target,before),save:async messages=>{for(let start=0;start<messages.length;start+=5){if(!active())return;await request(account,{action:'ingest',target,channel:scope.channel,mode:'history',messages:messages.slice(start,start+5).map(m=>dmSnapshot(m,scope.channel))});}},checkpoint:change=>request(account,{action:'checkpoint',target,channel:scope.channel,...change}),progress:()=>{status=`Saved ${++pages} pages · conversation ${index+1}/${configured.scopes.length}. Photos/videos copy separately; check their save status.`;notify();},yield:()=>new Promise(resolve=>setTimeout(resolve,1000))});
  }
  if(generation===serial)status=active()?'All accessible pages in the listed DMs saved. Live collection remains on while XRay is connected.':'History load paused. Saved pages remain; click Resume to catch up and continue.';
 })().catch(failure=>{if(generation===serial){error=String((failure as Error)?.message??failure);status='History load paused; acknowledged pages remain on your server.';}throw failure;}).finally(()=>{if(job===run)job=undefined;notify();});
 notify();return run.promise;
}
export function pauseDmArchive():void{if(job)job.cancel=true;status='Pausing after the current operation…';notify();}
export async function stopDmArchive(target:string):Promise<void>{const running=job?.target===target?job:undefined;if(running){pauseDmArchive();await running.promise.catch(()=>{});}await loadDmArchive(target);const channels=scopes.filter(s=>s.target===target).map(s=>s.channel);if(!channels.length)return;const account=myId();if(!account)throw Error('Account changed');for(const scope of scopes)if(scope.target===target)scope.enabled=0;await tail;await request(account,{action:'configure',target,channels,enabled:false});await loadDmArchive(target);status='Live DM archiving stopped for this person. Saved messages remain on the server.';notify();}
export async function archivedDmPage(target:string,before?:string):Promise<any>{const account=myId();if(!account||!serverDataEnabled(account))throw Error('Enable server storage to read saved messages.');return request(account,{action:'page',target,...(before?{before}:{})});}
/** A read/page error has no unsaved payload. Drain real uploads before restarting. */
export async function flushDmArchive():Promise<void>{if(job){pauseDmArchive();await job.promise.catch(()=>{});}await tail;if(pending)throw Error('DM archive writes are still pending. Keep XRay open.');}
function enqueue(account:string,payload:any):void{
 if(pending>=200){error='Live DM archive queue is full. Click Save past DMs to backfill accessible messages after the server recovers.';notify();return;}
 pending++;tail=tail.then(async()=>{if(myId()!==account||!serverDataEnabled(account))throw Error('Account/storage changed before a live message could save. Backfill accessible messages when you return.');await request(account,payload);}).catch(failure=>{error=`Live DM archive save failed: ${String((failure as Error)?.message??failure)}`;notify();}).finally(()=>{pending--;});
}
export function startDmArchive():void{
 const reset=()=>{generation++;if(job)job.cancel=true;owner=undefined;scopes=[];error='';status='Load a saved archive or resume past DMs.';notify();};
 const restore=()=>{reset();const serial=generation;if(myId()&&serverDataEnabled())void loadDmArchive().catch(failure=>{if(generation===serial){error=String((failure as Error)?.message??failure);notify();}});};
 onAction('CONNECTION_OPEN',restore);onAction('LOGOUT',reset);onStorageModeChanged(restore);
 intercept(action=>{const account=myId();if(!account||owner!==account||!serverDataEnabled()||action.xrayLocalEdit||action.xrayLocalDelete)return;
  const channel=action.channelId??action.channel_id??action.message?.channel_id??action.message?.channelId;
  const enrolled=scopes.filter(s=>s.enabled&&s.channel===channel);if(!enrolled.length)return;
  if(action.type==='MESSAGE_DELETE'||action.type==='MESSAGE_DELETE_BULK'){enqueue(account,{action:'deleted',channel,ids:action.ids??[action.id]});return;}
  if(!['MESSAGE_CREATE','MESSAGE_UPDATE'].includes(action.type))return;
  const message=action.message;if(!message?.id||message.mlDeleted)return;const canonical=stores.messages?.getMessage?.(channel,message.id),author=message.author??canonical?.author;
  const scope=enrolled.find(s=>s.target===author?.id);if(!scope)return;
  try{enqueue(account,{action:'ingest',target:scope.target,channel,mode:'live',messages:[dmSnapshot({...canonical,...message,author},channel)]});}catch(failure){error=String((failure as Error)?.message??failure);notify();}
 });
}
