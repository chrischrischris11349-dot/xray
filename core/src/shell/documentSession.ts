export interface DocumentReply { value: string | null; revision: number }
export interface DocumentTransport {
  read(ns: string): Promise<DocumentReply>;
  write(ns: string, value: string, revision: number): Promise<{ revision: number }>;
}
type LocalStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Serialized, revision-checked writes. No persistent fallback when remote storage fails. */
export class DocumentSession {
  value: string | null = null;
  private revision = 0;
  private ready?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private original: string | null = null;
  constructor(readonly ns: string, readonly localKey: string, private local: LocalStore | null, readonly remote: boolean, private transport: DocumentTransport) {}
  load(): Promise<void> {
    return this.ready ??= (async () => {
      this.original = this.local?.getItem(this.localKey) ?? null;
      if (!this.remote) { this.value = this.original; return; }
      const reply = await this.transport.read(this.ns);
      if (!Number.isSafeInteger(reply?.revision) || reply.revision < 0 || reply.value !== null && typeof reply.value !== "string") throw new Error("Server returned an invalid document.");
      this.value = reply.value; this.revision = reply.revision;
      if (this.original !== null && this.original !== this.value) {
        if (this.value !== null) throw new Error("Local and server records differ. Neither was overwritten. Export the local data and reconcile it before switching storage.");
        await this.put(this.original);
        const verified = await this.transport.read(this.ns);
        if (verified.value !== this.original || verified.revision !== this.revision) throw new Error("Server migration could not be verified. The local copy was kept.");
      }
    })();
  }
  /** Called only after every account document has migrated and the mode flag is durable. */
  removeMigratedLocal(): void {
    if (this.remote && this.original !== null && this.local?.getItem(this.localKey) === this.original) this.local.removeItem(this.localKey);
  }
  private async put(value: string): Promise<void> {
    if (new TextEncoder().encode(value).length > 2_000_000) throw new Error("Saved data exceeds the 2 MB document limit.");
    if (this.remote) {
      const reply = await this.transport.write(this.ns, value, this.revision);
      if (reply?.revision !== this.revision + 1) throw new Error("Server did not acknowledge the document revision.");
      this.revision = reply.revision;
    } else {
      if (!this.local) throw new Error("Local storage is unavailable.");
      this.local.setItem(this.localKey, value);
    }
    this.value = value;
  }
  update(change: (value: string | null) => string): Promise<void> {
    const job = this.queue.catch(() => {}).then(async () => { await this.load(); await this.put(change(this.value)); });
    this.queue = job; return job;
  }
  write(value: string): Promise<void> { return this.update(() => value); }
  async idle(): Promise<void> { await this.queue; }
}
