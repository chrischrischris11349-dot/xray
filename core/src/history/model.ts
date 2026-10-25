/** Opt-in observations. Deleted-message excerpts contain only previously visible data. */
export type Category = "profile" | "presence" | "membership" | "deletions" | "edits" | "messages";
export const categories: readonly Category[] = ["profile", "presence", "membership", "deletions", "edits", "messages"];
export type Snapshot = Partial<Record<"username" | "displayName" | "avatar" | "banner" | "bio" | "customStatus" | "presence", string | null>>;
export interface HistoryEvent { id: string; at: number; kind: string; before?: string; after?: string; guildId?: string; channelId?: string; messageId?: string; messageText?: string; messageFiles?: string[]; messageImages?: string[]; messageVideos?: string[]; messageBefore?: string; messageSentAt?: string }
export interface HistoryRecord { enabled: boolean; startedAt: number; retentionDays: number; categories: Category[]; notes: string; events: HistoryEvent[] }
export interface HistoryDocument { version: 1; people: Record<string, HistoryRecord> }
const DAY = 864e5;
const validId = (value: string) => /^\d{14,20}$/.test(value);
const text = (value: unknown, limit = 300) => typeof value === "string" ? value.length > limit ? `${value.slice(0,limit-1)}…` : value : undefined;
export function deletionExcerpt(message: any): Pick<HistoryEvent, "messageText" | "messageFiles" | "messageImages" | "messageVideos" | "messageBefore" | "messageSentAt"> {
  const attachments=Array.isArray(message?.attachments)?message.attachments:undefined;
  const media=(kind:string,extension:RegExp)=>attachments?imageLinks(attachments.filter((file:any)=>String(file.content_type??file.contentType??"").startsWith(`${kind}/`) || extension.test(file.filename??file.fileName??"")).map((file:any)=>file.url??file.proxy_url??file.proxyURL)):undefined;
  return {messageSentAt:sentAt(message?.timestamp),messageImages:media("image",/\.(png|jpe?g|gif|webp|avif)$/i),messageVideos:media("video",/\.(mp4|webm|mov)$/i),messageText:text(message?.content,4000),messageFiles:attachments?.slice(0,4).map((file:any)=>text(file.filename??file.fileName,80)).filter((name:unknown):name is string=>typeof name==="string")};
}

function sentAt(value:any):string|undefined {
 try {const date=new Date(value?.toDate?.() ?? value);return value && Number.isFinite(date.getTime())?date.toISOString():undefined;}catch{return undefined;}
}
function cleanExcerpt(event: Partial<HistoryEvent>): Pick<HistoryEvent, "messageText" | "messageFiles" | "messageImages" | "messageVideos" | "messageBefore" | "messageSentAt"> {
  if (!["messageDeleted","messageObserved","messageEdited"].includes(event.kind ?? "")) return {};
  return { messageBefore: text(event.messageBefore,4000), messageSentAt: sentAt(event.messageSentAt), messageImages: imageLinks(event.messageImages), messageVideos: imageLinks(event.messageVideos), messageText: text(event.messageText, 4000), messageFiles: Array.isArray(event.messageFiles) ? event.messageFiles.slice(0,4).map(name => text(name,80)).filter((name): name is string => name !== undefined) : undefined };
}

/** Only Discord attachment images, without arbitrary tracker/image hosts. Links can expire. */
export function imageLinks(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return;
  const result=values.slice(0,4).filter((value):value is string=>{
    if(typeof value!=="string" || value.length>2048)return false;
    try {const u=new URL(value);return u.protocol==="https:" && !u.username && !u.password && !u.port && ["cdn.discordapp.com","media.discordapp.net"].includes(u.hostname) && /^\/(attachments|ephemeral-attachments)\//.test(u.pathname);}catch{return false;}
  });return result;
}
export class ProfileHistory {
  readonly document: HistoryDocument = { version: 1, people: {} };
  private lastPrune = 0;
  private baselines = new Map<string, Snapshot>();
  constructor(raw?: string | null, private clock = () => Date.now()) {
    try {
      if (!raw || raw.length > 2_000_000) return;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !parsed.people || typeof parsed.people !== "object") return;
      for (const [id, item] of Object.entries(parsed.people).slice(0, 30)) {
        const value = item as HistoryRecord;
        if (!validId(id) || !value || typeof value !== "object") continue;
        this.document.people[id] = { enabled: value.enabled === true, startedAt: Number.isFinite(value.startedAt) ? value.startedAt : this.clock(), retentionDays: value.retentionDays === 7 ? 7 : 30,
          categories: Array.isArray(value.categories) ? categories.filter(c => value.categories.includes(c)) : [...categories], notes: text(value.notes, 2000) ?? "",
          events: Array.isArray(value.events) ? value.events.slice(-200).filter(e => e && typeof e.id === "string" && Number.isFinite(e.at) && typeof e.kind === "string").map(e => ({ id: e.id.slice(0, 200), at: e.at, kind: e.kind.slice(0, 40), before: text(e.before), after: text(e.after), guildId: text(e.guildId, 20), channelId: text(e.channelId, 20), messageId: text(e.messageId, 20), ...cleanExcerpt(e) })) : [] };
      }
      this.prune();
    } catch { /* Corrupt local data never prevents Discord starting. */ }
  }
  get(id: string): HistoryRecord | undefined { return this.document.people[id]; }
  configure(id: string, enabled: boolean, selected: Category[] = categories.filter(c=>c!=="messages"), retentionDays = 30): void {
    if (!validId(id)) throw new Error("Invalid profile ID.");
    const old = this.document.people[id];
    if (!old && Object.keys(this.document.people).length >= 30) throw new Error("History supports 30 profiles. Remove an old profile first.");
    this.document.people[id] = { enabled, startedAt: old?.startedAt ?? this.clock(), retentionDays: retentionDays === 7 ? 7 : 30, categories: categories.filter(c => selected.includes(c)), notes: old?.notes ?? "", events: old?.events ?? [] };
    // Resuming establishes a new baseline. Changes during gaps have unknown times.
    if (!old?.enabled || !enabled) this.baselines.delete(id);
    this.prune();
  }
  note(id: string, note: string): void {
    if (!this.document.people[id]) this.configure(id, false);
    this.document.people[id].notes = note.slice(0, 2000);
  }
  remove(id: string): void { delete this.document.people[id]; this.baselines.delete(id); }
  clear(id: string): void { const record = this.get(id); if (record) { record.events = []; record.startedAt = this.clock(); } this.baselines.delete(id); }
  resetBaselines(): void { this.baselines.clear(); }
  observe(id: string, patch: Snapshot, seedOnly = false): void {
    const record = this.get(id);
    if (!record?.enabled) return;
    const previous = this.baselines.get(id) ?? {};
    for (const key of ["username", "displayName", "avatar", "banner", "bio", "customStatus", "presence"] as const) {
      const value = patch[key];
      if (value !== null && typeof value !== "string") continue;
      if (seedOnly && Object.hasOwn(previous,key)) continue;
      if (Object.hasOwn(previous, key) && previous[key] !== value) this.add(id, key === "presence" ? "presence" : "profile", { id: `${key}:${this.clock()}:${record.events.length}`, kind: key, before: previous[key] ?? "(empty)", after: value ?? "(empty)" });
      previous[key] = value;
    }
    this.baselines.set(id, previous);
  }
  add(id: string, category: Category, event: Omit<HistoryEvent, "at">): boolean {
    const record = this.get(id);
    if (!record?.enabled || !record.categories.includes(category) || record.events.some(e => e.id === event.id)) return false;
    record.events.push({ ...event, messageText: undefined, messageFiles: undefined, messageImages: undefined, messageVideos: undefined, ...cleanExcerpt(event), before: text(event.before), after: text(event.after), at: this.clock() });
    this.prune(true); return true;
  }
  prune(force = true): void {
    const now = this.clock();
    if(!force && now-this.lastPrune<60_000)return;
    this.lastPrune=now;
    for (const record of Object.values(this.document.people)) record.events = record.events.filter(e => e.at >= now - record.retentionDays * DAY && e.at <= now + 60_000).slice(-200);
    const all = Object.values(this.document.people).flatMap(record => record.events.map(event => ({ record, event }))).sort((a,b) => a.event.at - b.event.at);
    for (const {record,event} of all.slice(0, Math.max(0, all.length - 2000))) record.events = record.events.filter(e => e !== event);
  }
  serialize(): string {
    this.prune();
    // UTF-8 excerpts must also fit the native server's byte limit, including emoji.
    const encoder = new TextEncoder();
    let serialized = JSON.stringify(this.document);
    if (encoder.encode(serialized).byteLength > 1_800_000) {
      const events = Object.values(this.document.people).flatMap(record => record.events.map(event => ({record,event}))).sort((a,b) => a.event.at-b.event.at);
      let bytes = encoder.encode(serialized).byteLength;
      for (const {record,event} of events) {
        if (bytes <= 1_750_000) break;
        record.events = record.events.filter(item => item !== event);
        bytes -= encoder.encode(JSON.stringify(event)).byteLength;
      }
      serialized = JSON.stringify(this.document);
    }
    return serialized;
  }
}
