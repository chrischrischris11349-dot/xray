interface Person { name: string; avatar: string | null }
export function notificationIdentity(title: string, options: NotificationOptions, user: (id: string) => Person | null, message: (channel: string, id: string) => any, guildIcon: (guild: string | undefined, channel: string | undefined) => string | null = () => null): { title: string; icon: string } {
  const data = options.data && typeof options.data === "object" ? options.data : {};
  const channel = data.channel_id ?? data.channelId;
  const messageId = data.message_id ?? data.messageId;
  const exact = typeof channel === "string" && typeof messageId === "string" ? message(channel, messageId) : null;
  const author = exact?.author ?? data.message?.author ?? data.author;
  let id = author?.id ?? data.author_id ?? data.authorId ?? data.sender_id ?? data.senderId;
  if (!id && options.icon) {
    try { const url = new URL(options.icon); if (url.protocol === "https:" && url.hostname === "cdn.discordapp.com" && !url.username && !url.password) id = /^\/avatars\/(\d{14,19})\//.exec(url.pathname)?.[1]; } catch { /* use the supplied notification title */ }
  }
  const known = typeof id === "string" && /^\d{14,19}$/.test(id) ? user(id) : null;
  const name = known?.name ?? (typeof author?.global_name === "string" ? author.global_name : typeof author?.globalName === "string" ? author.globalName : typeof author?.username === "string" ? author.username : null);
  const generic = !title.trim() || /^(discord|xray|new message)$/i.test(title.trim());
  let authorIcon: string | null = null;
  if (typeof id === "string" && /^\d{14,20}$/.test(id) && typeof author?.avatar === "string" && /^[a-zA-Z0-9_]+$/.test(author.avatar)) authorIcon=`https://cdn.discordapp.com/avatars/${id}/${author.avatar}.png?size=64`;
  const supplied = String(options.icon ?? "");
  const personIcon = /^https:\/\/cdn\.discordapp\.com\/(avatars\/|guilds\/\d+\/users\/)/.test(supplied);
  const guildId = data.guild_id ?? data.guildId ?? exact?.guild_id ?? data.message?.guild_id;
  const serverIcon = guildIcon(typeof guildId === "string" ? guildId : undefined,typeof channel === "string" ? channel : undefined);
  const defaultAvatar = typeof id === "string" && /^\d{14,20}$/.test(id) ? `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id)>>22n)%6n)}.png` : null;
  return { title: name ? generic ? name : title.toLowerCase().includes(name.toLowerCase()) ? title : `${name} · ${title}` : title,
    icon: (personIcon ? supplied : null) ?? known?.avatar ?? authorIcon ?? defaultAvatar ?? serverIcon ?? supplied };
}

export class NotificationMessages {
  private recent:{at:number;message:any}[]=[];
  constructor(private clock=()=>Date.now()){}
  remember(message:any):void {if(!message?.id || !message.author?.id || !message.content)return;this.recent=this.recent.filter(row=>this.clock()-row.at<15000).slice(-39);this.recent.push({at:this.clock(),message});}
  match(body:string):any|null {
    const text=body.trim();if(text.length<3)return null;
    const matches=this.recent.filter(row=>this.clock()-row.at<15000 && typeof row.message.content==="string" && row.message.content.trim().length>=3 && (text.includes(row.message.content.trim()) || row.message.content.trim()===text));
    return matches.length===1?matches[0].message:null;
  }
}
