/** Personal view overrides. Only edits persist; session-only hiding stays ephemeral. */
export class SessionMessageView {
  constructor(private changed:()=>void=()=>{}){}
  private values=new Map<string,{content?:string;hidden?:boolean;system?:boolean}>();
  private ids=new Map<string,string>();
  private key(message:any){return `${message.channel_id}:${message.id}`;}
  get(message:any){return this.values.get(this.key(message));}
  getById(id:string){return this.values.get(this.ids.get(id)??"");}
  edit(message:any,content:string,system=false){this.values.set(this.key(message),{...this.get(message),content,system});this.ids.set(message.id,this.key(message));this.changed();}
  hide(message:any){this.values.set(this.key(message),{...this.get(message),hidden:true});this.ids.set(message.id,this.key(message));this.changed();}
  reset(message:any){this.values.delete(this.key(message));this.ids.delete(message.id);this.changed();}
  clear(){this.values.clear();this.ids.clear();this.changed();}
  entries(){return [...this.values].filter(([,value])=>value.content!==undefined).map(([key,value])=>{const [channel_id,id]=key.split(":");return {channel_id,id,content:value.content!,system:value.system===true};});}
  serialize():string{const edits=this.entries(),text=JSON.stringify({version:1,edits});if(edits.length>1000||new TextEncoder().encode(text).length>1_000_000)throw Error("Saved local edits have reached their limit. Reset an older edit before adding more.");return text;}
  load(raw:string|null,preserveHidden=false):void{
    let parsed:any;try{if(raw!==null&&raw.length>1_000_000)throw Error();parsed=raw===null?{version:1,edits:[]}:JSON.parse(raw);}catch{throw Error("Saved local edits are unreadable; they were not overwritten.");}
    if(parsed?.version!==1||!Array.isArray(parsed.edits)||parsed.edits.length>1000)throw Error("Saved local edits are unreadable; they were not overwritten.");
    const next=new SessionMessageView();
    for(const edit of parsed.edits){if(!/^\d{14,20}$/.test(edit?.id)||!/^\d{14,20}$/.test(edit?.channel_id)||typeof edit.content!=="string"||edit.content.length>4000||typeof edit.system!=="boolean"||next.getById(edit.id))throw Error("Saved local edits are unreadable; they were not overwritten.");next.edit(edit,edit.content,edit.system);}
    next.serialize();
    if(preserveHidden)for(const [key,value]of this.values)if(value.hidden){const [channel_id,id]=key.split(":");next.hide({channel_id,id});}
    this.values=next.values;this.ids=next.ids;this.changed();
  }
}
const listeners=new Set<()=>void>();
export const onLocalMessageViewChanged=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const sessionMessageView=new SessionMessageView(()=>listeners.forEach(fn=>fn()));
