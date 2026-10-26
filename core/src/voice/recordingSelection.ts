/** Identity is accepted only from Discord's explicit SSRC lookup, never track order. */
export async function recordingTrackOwner(receiver:Pick<RTCRtpReceiver,"getStats">,connections:any[],participants:Set<string>):Promise<string|undefined>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const report=await Promise.race([receiver.getStats(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),2000);})]);
    if(!report)return;const owners=new Set<string>();
    report.forEach((stat:any)=>{if(stat.type!=="inbound-rtp"||(stat.kind??stat.mediaType)!=="audio"||!Number.isFinite(stat.ssrc))return;
      for(const connection of connections){let id;try{id=connection?.getUserIdBySsrc?.(stat.ssrc);}catch{continue;}if(typeof id==="string"&&participants.has(id))owners.add(id);}
    });
    return owners.size===1?[...owners][0]:undefined;
  }catch{return;}finally{clearTimeout(timer);}
}
export function includeRecordingTrack(owner:string|undefined,selection:Set<string>|null):boolean{return selection===null||!!owner&&selection.has(owner);}
