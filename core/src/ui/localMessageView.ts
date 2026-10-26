/** Session-only view overrides. Never written into Discord stores or server history. */
export class SessionMessageView {
  private values=new Map<string,{content?:string;hidden?:boolean}>();
  private key(message:any){return `${message.channel_id}:${message.id}`;}
  get(message:any){return this.values.get(this.key(message));}
  edit(message:any,content:string){this.values.set(this.key(message),{...this.get(message),content});}
  hide(message:any){this.values.set(this.key(message),{...this.get(message),hidden:true});}
  reset(message:any){this.values.delete(this.key(message));}
  clear(){this.values.clear();}
}
export const sessionMessageView=new SessionMessageView();
