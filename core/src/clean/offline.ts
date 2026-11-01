// Clean builds never copy the server archive (history, recordings, lookups) to this device.
export function installOfflineBackups(): void {}
export function offlineStorageControl(): null { return null; }
export class OfflineRecordings {
  constructor(_db: unknown, _changed?: (owner: string, message: string) => void) {}
  async transfer(_owner: string, p: any, _native: unknown, _remote?: boolean): Promise<any> {
    if (p?.action === "list") return [];
    throw Error("Not included in this build");
  }
  async sync(_owner: string, _native: unknown): Promise<void> {}
}
