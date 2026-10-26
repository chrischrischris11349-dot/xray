import { menu } from "../api/menus";
import { stores } from "../discord";
import { showDialog } from "../ui/dialog";
import { startVoiceRecording,stopVoiceRecording,voiceRecordingState } from "../voice/recorder";
import { definePlugin } from "./types";
export default definePlugin({id:"voiceRecordingMenu",name:"VC recording menu",category:"Voice",enabledByDefault:true,needsReload:false,impact:"light",impactReason:"Builds actions only when a voice context menu opens",description:"Right-click your connected voice channel or a participant to start a consented VC-audio recording, or stop and save it on your configured server.",start(ctx){
 ctx.menu(["channel-context","user-context"],(items,target)=>{
  const channel=target.channel;
  const selected=channel&&[2,13].includes(channel.type)?channel.id:target.user?stores.voiceStates?.getVoiceStateForUser?.(target.user.id)?.channelId:undefined;
  if(!selected)return;
  const state=voiceRecordingState(),current=selected===state.channel;
  items.push(menu.group(menu.item({id:"xray-record-voice",label:state.recording&&state.recordingChannel===selected?"Stop and save VC audio":"Start VC audio recording…",disabled:!current||state.busy&&!state.recording,subtext:current?"Everyone must agree · incoming VC audio only":"Join this voice channel first",action:()=>{
   const latest=voiceRecordingState();
   if(latest.recording&&latest.recordingChannel===selected){stopVoiceRecording();return;}
   void startVoiceRecording(selected).catch(error=>showDialog({title:"VC recording",body:String((error as Error)?.message??error)}));
  }}),menu.item({id:"xray-voice-recordings",label:"Open VC recordings",action:()=>void import("../ui/intelligence").then(module=>module.openIntelligence("Recordings"))})));
 });
}});
