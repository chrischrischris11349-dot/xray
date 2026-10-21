/**
 * Pushes and pulls your own xray settings through the Rust `sync_config`
 * command, which talks to your server (sync.rs). The page never holds the
 * address or token. Both calls fail soft: with no server configured, or if it
 * can't be reached, they resolve to null/false and your local settings stand.
 */
import { invoke } from "./bridge";

export interface SyncReply {
  value?: unknown;
  updatedAt?: number;
}

/** Reads the stored blob for `ns`, or null if there's none or the call fails. */
export async function pullConfig(ns: string): Promise<SyncReply | null> {
  try {
    const reply = (await invoke("sync_config", { ns, payload: null })) as SyncReply;
    return reply && typeof reply === "object" ? reply : null;
  } catch {
    return null;
  }
}

/** Stores `value` under `ns`. Returns whether it reached the server. */
export async function pushConfig(ns: string, value: unknown): Promise<boolean> {
  try {
    await invoke("sync_config", { ns, payload: value });
    return true;
  } catch {
    return false;
  }
}
