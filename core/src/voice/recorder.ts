import { invoke } from "../shell/bridge";
import { myId,stores } from "../discord";
import { onAction,intercept } from "../api/flux";
import { h } from "../ui/dom";
import { confirmAction,showDialog,showSheet,closeDialog } from "../ui/dialog";
import {recordingLibrary} from "../ui/recordingLibrary";
import { uiRoot } from "../ui/root";
import { recordingTrackOwner,includeRecordingTrack } from "./recordingSelection";

const peers=new Set<RTCPeerConnection>(),listeners=new Set<()=>void>();
let installed=false,recorder:MediaRecorder|undefined,context:AudioContext|undefined,destination:MediaStreamAudioDestinationNode|undefined;
const sources=new Map<MediaStreamTrack,{node:MediaStreamAudioSourceNode;cleanup:()=>void}>();
let session="",channel="",owner="",index=0,bytes=0,queued:Uint8Array[]=[],uploading=false,starting=false,finishing=false,error="",partialReason="",label="Ready · VC audio only",stopTimer:number|undefined;
let indicator:HTMLElement|undefined,cancelPreparing=false;
let selection:Set<string>|null=null;
const connections=():any[]=>{const value=stores.mediaEngine?.getMediaEngine?.()?.connections;return value&&typeof value.values==="function"?[...value.values()]:[];};
function participants(id:string):string {
 const states=stores.voiceStates?.getVoiceStatesForChannel?.(id);
 if(!states || typeof states!=="object")throw Error("Voice participants are unavailable. Rejoin the call and retry.");
 const ids=Object.entries(states).map(([key,state]:[string,any])=>state?.userId??state?.user_id??key).filter((id:any)=>typeof id==="string" && /^\d{14,20}$/.test(id));
 if(!ids.length)throw Error("Voice participants are unavailable. Rejoin the call and retry.");
 return [...new Set(ids)].sort().join(",");
}
function releaseAudio():void {for(const {node,cleanup} of sources.values()){node.disconnect();cleanup();}sources.clear();destination?.stream.getTracks().forEach(track=>track.stop());void context?.close().catch(()=>{});context=destination=undefined;}
const voiceChannel=()=>stores.voiceStates?.getVoiceStateForUser?.(myId())?.channelId as string|undefined;
const update=()=>{if(indicator){indicator.hidden=!session;indicator.textContent=recorder?.state==="recording"?`● Recording VC audio · ${Math.ceil(bytes/1024)} KB sent · click to stop`:error?"Recording upload needs attention · open Recordings":"Saving recording…";}if(indicator)indicator.setAttribute("aria-label",indicator.textContent??"VC recording status");listeners.forEach(fn=>fn());};
const transfer=(payload:any)=>invoke("recording_transfer",{payload}) as Promise<any>;
function attach(track:MediaStreamTrack):void {
  if(!context || !destination || track.kind!=="audio" || track.readyState!=="live" || sources.has(track))return;
  const node=context.createMediaStreamSource(new MediaStream([track]));node.connect(destination);
  const ended=()=>{node.disconnect();sources.delete(track);};
  sources.set(track,{node,cleanup:()=>track.removeEventListener("ended",ended)});
  track.addEventListener("ended",ended,{once:true});
}
async function attachIncoming(peer:RTCPeerConnection,track:MediaStreamTrack):Promise<void>{
 if(!context||!session)return;if(selection===null){attach(track);return;}
 const id=session,receiver=peer.getReceivers().find(receiver=>receiver.track===track);if(!receiver)return;
 const user=await recordingTrackOwner(receiver,connections(),new Set(participants(channel).split(",")));
 if(session===id&&includeRecordingTrack(user,selection))attach(track);
}
async function chooseRecordingAudio(ids:string[],available:Set<string>):Promise<Set<string>|null|undefined>{
 return new Promise(resolve=>{
  let result:Set<string>|null|undefined,all=true;const chosen=new Set<string>();
  const consent=h("input",{attrs:{type:"checkbox","aria-label":"Everyone whose audio is captured has agreed"}});
  const checks=ids.filter(id=>id!==myId()).map(id=>{
   const input=h("input",{attrs:{type:"checkbox",...(available.has(id)?{}:{disabled:""})}});input.onchange=()=>{input.checked?chosen.add(id):chosen.delete(id);draw();};
   const user=stores.users?.getUser?.(id);return h("label",{class:"recording-choice"},input,h("span",{text:`${user?.globalName??user?.username??id}${available.has(id)?"":" · separate audio unavailable"}`}));
  });
  const scope=h("select",{class:"dialog-input",attrs:{"aria-label":"Recording audio selection"}},h("option",{attrs:{value:"all"},text:"All incoming audio"}),h("option",{attrs:{value:"selected"},text:"Selected participants"}));
  const list=h("div",{},...checks),status=h("p",{class:"pf-note",attrs:{role:"status"}});
  const start=h("button",{class:"btn",text:"Start recording",on:{click:()=>{if(!consent.checked||!all&&!chosen.size)return;result=all?null:new Set(chosen);closeDialog();}}});
  const draw=()=>{list.hidden=all;start.disabled=!consent.checked||!all&&!chosen.size;status.textContent=all?"Includes incoming call audio and watched stream audio; your microphone is excluded.":available.size?"Only selected, separately identified incoming audio is captured. Unidentified audio is excluded.":"Discord has not exposed separate participant audio in this session. All incoming audio is still available.";};
  scope.onchange=()=>{all=scope.value==="all";draw();};consent.onchange=draw;draw();
  showSheet(h("section",{class:"dialog",attrs:{role:"dialog","aria-label":"Record VC audio"}},h("h2",{class:"dialog-title",text:"Record VC audio"}),scope,list,status,h("label",{class:"recording-choice"},consent,h("span",{text:"Everyone whose audio is captured has agreed"})),h("p",{class:"pf-note",text:"Audio is saved on your configured server. A visible indicator stays on while recording. Joining participants or changing the voice channel stops capture."}),h("div",{class:"dialog-actions"},h("button",{class:"btn ghost",text:"Cancel",on:{click:closeDialog}}),start)),()=>resolve(result));
 });
}
export function installVoiceRecording():void {
  if(installed)return;installed=true;
  if(typeof window.RTCPeerConnection==="function") {
    const Original=window.RTCPeerConnection;
    window.RTCPeerConnection=new Proxy(Original,{construct(target,args,newTarget){const peer=Reflect.construct(target,args,newTarget) as RTCPeerConnection;peers.add(peer);peer.addEventListener("track",event=>void attachIncoming(peer,event.track).catch(()=>{}));peer.addEventListener("connectionstatechange",()=>{if(peer.connectionState==="closed")peers.delete(peer);});if(peers.size>64)peers.delete(peers.values().next().value!);return peer;}});
  }
  intercept(action=>{
    if(action.type!=="VOICE_STATE_UPDATES" || !session)return;
    for(const state of action.voiceStates??[]) {
      if(state.userId===owner && state.channelId!==channel){label="Voice channel changed; recording stopped.";stop();break;}
      const old=stores.voiceStates?.getVoiceStateForUser?.(state.userId)?.channelId;
      if(state.userId!==owner && state.channelId===channel && old!==channel){label="A participant joined. Confirm everyone's consent before starting a new recording.";stop();break;}
    }
  });
  onAction("LOGOUT",()=>stop());
  onAction("CONNECTION_OPEN",()=>{if(session && owner!==myId()){label="Account changed; recording stopped.";stop();}});
}
async function drain():Promise<void> {
  if(uploading || !session)return;uploading=true;
  try {
    while(queued.length) {
      const chunk=queued[0];let text="";for(const byte of chunk)text+=String.fromCharCode(byte);
      await transfer({action:"chunk",id:session,index,data:btoa(text)});
      queued.shift();index++;bytes+=chunk.byteLength;error="";update();
    }
    if(finishing){const saved=await transfer({action:"finish",id:session,partial:!!partialReason});label=`Saved ${saved.partial?"partial recording ":""}on your server · ${Math.ceil(saved.bytes/1024)} KB`;session="";finishing=false;error="";}
  }catch(failure){error=String((failure as Error)?.message??failure);if(recorder?.state==="recording")stop();}
  finally{uploading=false;update();}
}
function stop():void {cancelPreparing=true;clearTimeout(stopTimer);if(recorder && recorder.state!=="inactive")recorder.stop();update();}
async function start(expectedChannel?:string):Promise<void> {
  if(session || uploading || starting)return;
  starting=true;cancelPreparing=false;update();
  try {
  const current=voiceChannel();if(!current)throw Error("Join a voice channel first.");
  if(expectedChannel&&current!==expectedChannel)throw Error("Join the selected voice channel before recording it.");
  if(typeof MediaRecorder==="undefined" || !MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))throw Error("This WebView cannot record Opus audio. Update WebView2.");
  const tracks=[...peers].flatMap(peer=>peer.getReceivers().map(receiver=>receiver.track)).filter(track=>track?.kind==="audio" && track.readyState==="live");
  if(!tracks.length)throw Error("No incoming VC audio is available. Rejoin voice after launching this XRay build, then retry.");
  const account=myId(),members=participants(current);
  const ready=()=>!cancelPreparing && voiceChannel()===current && myId()===account && participants(current)===members;
  const receivers=[...peers].flatMap(peer=>peer.getReceivers()).filter(receiver=>tracks.includes(receiver.track)).slice(0,64),membersSet=new Set(members.split(","));
  const identities=await Promise.all(receivers.map(receiver=>recordingTrackOwner(receiver,connections(),membersSet)));
  if(!ready())throw Error("Voice channel or participants changed. Reopen recording.");
  const selected=await chooseRecordingAudio([...membersSet],new Set(identities.filter((id):id is string=>!!id)));if(selected===undefined)return;selection=selected;
  if(!ready())throw Error("Voice channel, account or participants changed. Confirm consent again.");
  const saved=await transfer({action:"start",consent:true,channelId:current,owner:account,participantIds:selection?[...selection]:members.split(",").filter(id=>id!==account)});
  session=saved.id;channel=current;owner=myId()??"";index=bytes=0;queued=[];error="";partialReason="";finishing=false;
  try {
    if(!ready())throw Error("Voice channel, account or participants changed. Confirm consent again.");
    context=new AudioContext();await context.resume();
    if(!ready())throw Error("Recording preparation was interrupted. Confirm consent again.");
    destination=context.createMediaStreamDestination();receivers.forEach((receiver,i)=>{if(includeRecordingTrack(identities[i],selection))attach(receiver.track);});
    if(!sources.size)throw Error("None of the selected participants has a separate live audio stream. Try All incoming audio.");
    recorder=new MediaRecorder(destination.stream,{mimeType:"audio/webm;codecs=opus",audioBitsPerSecond:48000});
    let pending=Promise.resolve(), reserved=0;
    recorder.ondataavailable=event=>{
      if(!event.data.size)return;
      const occupied=queued.reduce((sum,c)=>sum+c.length,0)+reserved;
      if(occupied+event.data.size>2*1024*1024){partialReason="Pending audio limit reached";label="Recording stopped at the pending audio limit; the remaining tail was not captured.";error="Upload interrupted. Retry to save the captured portion.";stop();return;}
      reserved+=event.data.size;
      pending=pending.then(async()=>{
        const chunk=new Uint8Array(await event.data.arrayBuffer());reserved-=event.data.size;
        for(let from=0;from<chunk.length;from+=96*1024)queued.push(chunk.slice(from,from+96*1024));
        void drain();
      }).catch(()=>{reserved=0;partialReason="Captured audio could not be read";error="Could not read captured audio; saving earlier chunks.";stop();});
    };
    recorder.onerror=()=>{partialReason="Audio capture failed";error="Audio capture failed; saving received chunks.";stop();};
    recorder.onstop=()=>{releaseAudio();recorder=undefined;void pending.then(()=>{finishing=true;void drain();update();});};
    recorder.start(3000);label="Recording · VC audio only";stopTimer=window.setTimeout(stop,2*60*60*1000);
    indicator??=h("button",{class:"recording-status",attrs:{type:"button","aria-label":"Recording VC audio · stop recording"},on:{click:()=>{if(error)void import("../ui/intelligence").then(m=>m.openIntelligence("Recordings"));else stop();}}});if(!indicator.isConnected)uiRoot().append(indicator);update();
  }catch(failure){finishing=true;error=String(failure);releaseAudio();if(!bytes&&!queued.length){void transfer({action:"abort",id:session}).catch(()=>{});session="";finishing=false;}throw failure;}
  } finally { starting=false;update(); }
}
export function recordingPanel():{element:HTMLElement;close():void} {
  const element=h("section"),status=h("p",{class:"pf-note",attrs:{role:"status"}});let active=true;
  const begin=h("button",{class:"btn",attrs:{type:"button"},text:"Start VC recording",on:{click:()=>{begin.disabled=true;void start().catch(e=>{error=String((e as Error)?.message??e);update();if(!active)showDialog({title:"Recording could not start",body:error});}).finally(draw);}}});
  const stopButton=h("button",{class:"btn ghost",attrs:{type:"button"},text:"Stop and save",on:{click:stop}});
  const discard=h("button",{class:"btn ghost",attrs:{type:"button"},text:"Discard incomplete recording",on:{click:()=>void (async()=>{if(uploading || recorder || !session)return;if(!await confirmAction("Discard captured audio?","This removes the unfinished recording on your server and pending audio in memory.","Discard recording"))return;try{await transfer({action:"abort",id:session});queued=[];session="";finishing=false;error="";label="Incomplete recording discarded.";update();}catch(e){error=String(e);update();}})()}});
  const partial=h("button",{class:"btn ghost",attrs:{type:"button"},text:"Save uploaded portion",on:{click:()=>void (async()=>{
    if(uploading || recorder || !session)return;
    if(!await confirmAction("Save only uploaded audio?","Finalize the portion already on your server. Pending audio in memory will be omitted, and the file will be marked partial.","Save partial recording"))return;
    try{const saved=await transfer({action:"finish",id:session,partial:true});queued=[];session="";finishing=false;error="";label=`Partial recording saved on your server · ${Math.ceil(saved.bytes/1024)} KB`;update();}catch(e){error=String(e);update();if(!active)showDialog({title:"Could not save partial recording",body:error});}
  })()}});
  const retry=h("button",{class:"btn ghost",attrs:{type:"button"},text:"Retry pending upload",on:{click:()=>void drain()}});
  function draw(){if(!active)return;status.textContent=[label,error,error && session?"Pending audio is in memory only. Keep XRay open; do not switch accounts or exit.":""].filter(Boolean).join(" · ");begin.disabled=!!session || uploading || starting;stopButton.disabled=!recorder;retry.hidden=!session || !error;discard.hidden=!session || !error || !!recorder;discard.disabled=uploading;partial.hidden=discard.hidden;partial.disabled=uploading;}
  element.append(h("h2",{text:"VC recordings"}),h("p",{class:"pf-note",text:"VC audio only; no microphone access. Explicit participant consent is required. Server limit: 32 MB per recording, 512 MB total, seven-day retention. No persistent local audio copy; save a download only when you choose."}),h("div",{class:"pf-journal-actions"},begin,stopButton,retry,partial,discard,h("button",{class:"btn ghost",attrs:{type:"button"},text:"Refresh server recordings",on:{click:()=>void library.refresh()}})),status);
  const library=recordingLibrary();element.append(library.element);listeners.add(draw);draw();return{element,close(){active=false;listeners.delete(draw);library.close();}};
}
/** Prevent restarting while audio or pending recording chunks remain in memory. */
export function recordingNeedsAttention():boolean{return !!session||!!recorder||uploading||queued.length>0;}
/** Shared by the recordings panel and native context menu; consent checks stay in start(). */
export function voiceRecordingState(){return {channel:voiceChannel(),recordingChannel:channel,recording:recorder?.state==="recording",busy:starting||finishing||uploading||!!session};}
export async function startVoiceRecording(channelId:string):Promise<void>{await start(channelId);}
export function stopVoiceRecording():void{stop();}
