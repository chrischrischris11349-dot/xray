export interface MonitorEvent {at:number;kind:string;detail:string}
export interface ServerMonitor {guildId:string;name:string;testerId:string;enabled:boolean;events:MonitorEvent[]}
export class ServerMonitors {
  servers:ServerMonitor[]=[];
  private baselines=new Map<string,string>();
  constructor(raw:string|null=null,private clock=()=>Date.now()) {
    if(!raw)return;const parsed=JSON.parse(raw);if(parsed?.version!==1 || !Array.isArray(parsed.servers))throw Error("Unsupported monitor list; existing data was not overwritten.");
    this.servers=parsed.servers.slice(0,32).filter((s:any)=>/^\d{14,20}$/.test(s?.guildId)).map((s:any)=>({guildId:s.guildId,name:String(s.name??"Server").slice(0,100),testerId:/^\d{14,20}$/.test(s.testerId)?s.testerId:"",enabled:s.enabled===true,events:Array.isArray(s.events)?s.events.slice(-100).filter((e:any)=>typeof e.kind==="string"&&typeof e.detail==="string"&&Number.isFinite(e.at)).map((e:any)=>({at:e.at,kind:e.kind.slice(0,40),detail:e.detail.slice(0,300)})):[]}));this.prune();
  }
  add(guildId:string,name:string):void {if(!/^\d{14,20}$/.test(guildId))throw Error("Invalid server ID");if(this.servers.some(s=>s.guildId===guildId))return;if(this.servers.length>=32)throw Error("Monitor at most 32 servers");this.servers.push({guildId,name:name.slice(0,100),testerId:"",enabled:false,events:[]});}
  configure(guildId:string,testerId:string,enabled:boolean):void {const server=this.servers.find(s=>s.guildId===guildId);if(!server || !/^\d{14,20}$/.test(testerId))throw Error("Choose a valid tester");server.testerId=testerId;server.enabled=enabled;this.baselines.delete(guildId);}
  observe(action:any,getMessage:(channel:string,id:string)=>any,guildFor:(channel:string)=>string|undefined):boolean {
    if(!action || action.mlDeleted || action.xrayLocalEdit || action.xrayLocalDelete)return false;
    let changed=false;
    const add=(server:ServerMonitor,kind:string,detail:string)=>{server.events.push({at:this.clock(),kind,detail:detail.slice(0,300)});changed=true;};
    for(const server of this.servers.filter(s=>s.enabled&&s.testerId)) {
      if(action.type==="PRESENCE_UPDATE" || action.type==="PRESENCE_UPDATES")for(const p of action.updates??action.presences??[action]) {
        if((p.user?.id??p.userId??p.user_id)!==server.testerId)continue;
        const activities=Array.isArray(p.activities)?p.activities.slice(0,5).map((a:any)=>[a.name,a.details,a.state].filter(v=>typeof v==="string").join(" · ").slice(0,160)):[];
        const snapshot=JSON.stringify([p.status??"unknown",activities]);const old=this.baselines.get(server.guildId);this.baselines.set(server.guildId,snapshot);
        if(old!==undefined&&old!==snapshot)add(server,"Presence / shared app activity",`${p.status??"unknown"}${activities.length?` · ${activities.join("; ")}`:""}`);
      }
      if(["MESSAGE_CREATE","MESSAGE_UPDATE","MESSAGE_DELETE","MESSAGE_DELETE_BULK"].includes(action.type)) {
        const channel=action.message?.channel_id??action.channelId??action.channel_id;
        for(const id of action.type==="MESSAGE_DELETE_BULK"?action.ids??[]:[action.message?.id??action.id]) {
          const cached=getMessage(channel,id);const message=action.message?{...cached,...action.message,author:action.message.author??cached?.author}:cached;const guild=message?.guild_id??message?.guildId??guildFor(channel);
          if(message?.author?.id===server.testerId&&guild===server.guildId)add(server,action.type.replace("MESSAGE_","").toLowerCase(),`Message ${id} · channel ${channel}`);
        }
      }
      if(["GUILD_MEMBER_ADD","GUILD_MEMBER_REMOVE"].includes(action.type)&&(action.guildId??action.guild_id)===server.guildId&&(action.user?.id??action.userId??action.member?.user?.id)===server.testerId)add(server,action.type==="GUILD_MEMBER_ADD"?"Joined server":"Membership removed","Observed membership event; removal reason unavailable");
    }
    if(changed)this.prune();return changed;
  }
  prune(){for(const s of this.servers)s.events=s.events.filter(e=>e.at>=this.clock()-7*864e5&&e.at<=this.clock()+60000).slice(-100);const all=this.servers.flatMap(server=>server.events.map(event=>({server,event}))).sort((a,b)=>a.event.at-b.event.at);for(const {server,event}of all.slice(0,Math.max(0,all.length-1000)))server.events=server.events.filter(e=>e!==event);}
  serialize(){this.prune();return JSON.stringify({version:1,servers:this.servers});}
}
