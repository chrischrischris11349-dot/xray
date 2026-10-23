/** Session-only mini-chat tombstones. No storage, polling or Discord mutations. */
export function isDeletedMessage(message: any): boolean {
  return message?.deleted === true || typeof message?.xrayDeletedAt === "number";
}

const short = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0,limit) : undefined;
function snapshot(message: any, channel: string, id: string): any {
  const timestamp = message?.timestamp?.toDate?.() ?? message?.timestamp;
  return { id, channel_id: channel, content: short(message?.content,4000), timestamp,
    author: { id: message?.author?.id, username: short(message?.author?.username,80), globalName: short(message?.author?.globalName ?? message?.author?.global_name,80) },
    attachments: Array.isArray(message?.attachments) ? message.attachments.slice(0,10).map((file: any) => ({
      filename: short(file.filename ?? file.fileName,160), url: short(file.url,2048), proxy_url: short(file.proxy_url ?? file.proxyURL,2048),
      content_type: short(file.content_type ?? file.contentType,80), size: typeof file.size === "number" ? file.size : undefined,
      spoiler: file.spoiler === true,
    })) : [],
  };
}

export class DeletedMessages {
  private visible = new Map<string, any>();
  private deleted = new Map<string, any>();
  constructor(private clock = () => Date.now()) {}
  clear(): void { this.visible.clear(); this.deleted.clear(); }
  remember(channel: string, messages: any[]): void {
    // Keep only the rows actually displayed in the current mini-chat.
    this.visible.clear();
    for (const message of messages.slice(-40)) if (typeof message?.id === "string" && !isDeletedMessage(message))
      this.visible.set(`${channel}:${message.id}`, snapshot(message,channel,message.id));
  }
  handle(action: any, getMessage: (channel: string,id: string) => any): boolean {
    if (!["MESSAGE_DELETE","MESSAGE_DELETE_BULK"].includes(action?.type)) return false;
    const channel = action.channelId ?? action.channel_id;
    if (typeof channel !== "string") return false;
    let changed = false;
    for (const id of action.type === "MESSAGE_DELETE_BULK" ? action.ids ?? [] : [action.id]) {
      if (typeof id !== "string") continue;
      const key = `${channel}:${id}`;
      if (action.mlDeleted || action.xrayLocalDelete) { changed = this.deleted.delete(key) || changed; this.visible.delete(key); continue; }
      if (this.deleted.has(key)) continue;
      // Prefer the real pre-delete store over a potentially older displayed row.
      const source = getMessage(channel,id) ?? this.visible.get(key);
      if (!source) continue;
      this.deleted.set(key,{...snapshot(source,channel,id),deleted:true,xrayDeletedAt:this.clock()});
      while (this.deleted.size > 80) this.deleted.delete(this.deleted.keys().next().value!);
      changed = true;
    }
    return changed;
  }
  merge(channel: string, messages: any[]): any[] {
    const merged = new Map<string,any>();
    for (const message of this.deleted.values()) if (message.channel_id === channel) merged.set(message.id,message);
    for (const message of messages) merged.set(message.id,this.deleted.has(`${channel}:${message.id}`) ? {...message,deleted:true,xrayDeletedAt:this.deleted.get(`${channel}:${message.id}`).xrayDeletedAt} : message);
    return [...merged.values()].sort((a,b) => {
      try { const left=BigInt(a.id), right=BigInt(b.id); return left < right ? -1 : left > right ? 1 : 0; } catch { return 0; }
    });
  }
}
