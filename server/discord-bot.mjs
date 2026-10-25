// GPL-3.0-or-later. Official Bot authentication only; no personal-account tokens.
import { botHistory } from "./bot-history.mjs";
export async function startDiscordBot(db,data,{token=process.env.XRAY_BOT_TOKEN??"",fetcher=fetch,Socket=WebSocket,log=console}={}){
  const history=botHistory(db,data);let socket,heartbeat,reconnect,closed=false,sequence=null,sessionId=null,resumeUrl=null,acked=true,attempt=0;
  const clear=()=>{clearInterval(heartbeat);heartbeat=undefined;};
  const setStatus=(state,error="")=>{try{history.status(state,error);}catch{log.error("Could not update VPS bot status");}};
  const stop=()=>{closed=true;clear();clearTimeout(reconnect);socket?.close(1000);};
  if(!token){setStatus("setup-required","Configure XRAY_BOT_TOKEN in the private server environment and install the bot in a monitored test server");return {stop,history};}
  async function rest(path){const response=await fetcher(`https://discord.com/api/v10/${path}`,{headers:{Authorization:`Bot ${token}`},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`Discord bot authentication/API failed (HTTP ${response.status})`);return response.json();}
  try{const user=await rest("users/@me");if(user.bot!==true)throw Error("A Discord bot token is required");}catch(error){setStatus("authentication-failed",error.message);return{stop,history};}
  let gateway;
  try{gateway=await rest("gateway/bot");if(!gateway.url?.startsWith("wss://gateway.discord.gg"))throw Error("Discord returned an invalid gateway");if(gateway.session_start_limit?.remaining===0)throw Error("Discord bot session-start quota exhausted");}catch(error){setStatus("connection-failed",error.message);return{stop,history};}
  const send=(op,d)=>{if(socket?.readyState===1)socket.send(JSON.stringify({op,d}));};
  const beat=()=>{if(!acked){socket?.close(4000,"Heartbeat not acknowledged");return;}acked=false;send(1,sequence);};
  function connect(){
    if(closed)return;setStatus("connecting");socket=new Socket(`${resumeUrl??gateway.url}/?v=10&encoding=json`);
    socket.addEventListener("message",event=>{
      try{
        if(typeof event.data!=="string"||event.data.length>8_000_000)throw Error("Invalid gateway payload");const packet=JSON.parse(event.data);if(packet.s!=null)sequence=packet.s;
        if(packet.op===10){clear();acked=true;const interval=packet.d?.heartbeat_interval;if(!Number.isFinite(interval)||interval<1000||interval>300000)throw Error("Invalid gateway heartbeat");heartbeat=setInterval(beat,interval);heartbeat.unref?.();if(sessionId)send(6,{token,session_id:sessionId,seq:sequence});else send(2,{token,intents:1|2|128|256|512|32768,properties:{os:process.platform,browser:"XRay VPS collector",device:"XRay VPS collector"}});}
        else if(packet.op===11)acked=true;
        else if(packet.op===1)beat();
        else if(packet.op===7)socket.close(4000,"Discord requested reconnect");
        else if(packet.op===9){if(!packet.d){sessionId=resumeUrl=null;sequence=null;}socket.close(4000,"Session invalidated");}
        else if(packet.op===0){if(packet.t==="READY"){sessionId=packet.d.session_id;resumeUrl=/^wss:\/\/[a-z0-9.-]+\.discord\.gg$/.test(packet.d.resume_gateway_url??"")?packet.d.resume_gateway_url:null;attempt=0;setStatus("connected");}else if(packet.t==="RESUMED"){attempt=0;setStatus("connected");}else history.dispatch(packet.t,packet.d);}
      }catch{setStatus("event-error","A gateway event could not be processed; no message body was logged to service output");}
    });
    socket.addEventListener("error",()=>setStatus("connection-failed","Discord gateway connection failed"));
    socket.addEventListener("close",event=>{clear();if(closed)return;if([4004,4010,4011,4012,4013,4014].includes(event.code)){closed=true;setStatus("configuration-required",event.code===4014?"Enable the bot's Server Members, Presence and Message Content intents in Discord Developer Portal":`Discord rejected bot configuration (${event.code})`);return;}if([4007,4009].includes(event.code)){sessionId=resumeUrl=null;sequence=null;}setStatus("reconnecting");reconnect=setTimeout(connect,Math.min(60000,5000*2**Math.min(attempt++,4))+Math.floor(Math.random()*1000));reconnect.unref?.();});
  }
  connect();return {stop,history};
}
