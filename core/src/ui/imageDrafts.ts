export interface DraftImage { id: number; file: File; url: string }
export interface ReplyTarget { id: string; channelId: string; author: string; preview: string; mention: boolean }
export interface ChatDraft { text: string; images: DraftImage[]; reply?: ReplyTarget }
const MAX_IMAGES = 10;
const MAX_STAGED_BYTES = 50 * 1024 * 1024;

/** Session-only drafts. Object URLs live only as long as their staged image. */
export class ImageDrafts {
  private drafts = new Map<string, ChatDraft>();
  private nextId = 1;
  private session = 0;
  constructor(private urls = { create: (file: File) => URL.createObjectURL(file), revoke: (url: string) => URL.revokeObjectURL(url) }) {}
  token(): number { return this.session; }
  get(channel: string): ChatDraft {
    if (!this.drafts.has(channel)) this.drafts.set(channel, { text: "", images: [] });
    return this.drafts.get(channel)!;
  }
  add(channel: string, files: readonly File[]): void {
    const draft = this.get(channel);
    if (draft.images.length + files.length > MAX_IMAGES) throw new Error("Attach up to 10 images per message.");
    if (files.some(file => !file.size || !/^image\/(png|jpeg|gif|webp|avif)$/i.test(file.type))) throw new Error("Choose PNG, JPEG, GIF, WebP or AVIF images.");
    const total = [...this.drafts.values()].flatMap(d => d.images).reduce((sum, image) => sum + image.file.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_STAGED_BYTES) throw new Error("Mini-chat can stage 50 MB of images at once. Discord also applies your account's upload limit when sending.");
    const added: DraftImage[] = [];
    try { for (const file of files) added.push({ id: this.nextId++, file, url: this.urls.create(file) }); }
    catch (error) { added.forEach(image => this.urls.revoke(image.url)); throw error; }
    draft.images.push(...added);
  }
  remove(channel: string, id: number): void {
    const draft = this.get(channel), image = draft.images.find(item => item.id === id);
    if (image) { this.urls.revoke(image.url); draft.images = draft.images.filter(item => item.id !== id); }
  }
  complete(channel: string, sentText: string, sentImages: readonly number[], sentReply?: ReplyTarget, token = this.session): void {
    if (token !== this.session) return;
    const draft = this.get(channel);
    if (draft.text === sentText) draft.text = "";
    if (draft.reply === sentReply) draft.reply = undefined;
    sentImages.forEach(id => this.remove(channel, id));
    if (!draft.text && !draft.images.length && !draft.reply) this.drafts.delete(channel);
  }
  clear(): void { this.session++; this.drafts.forEach(draft => draft.images.forEach(image => this.urls.revoke(image.url))); this.drafts.clear(); }
}
