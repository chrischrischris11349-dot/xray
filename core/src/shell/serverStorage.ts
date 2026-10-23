import { myId } from "../discord";
import { storage } from "../env";
import { invoke } from "./bridge";
import { DocumentSession, type DocumentReply } from "./documentSession";

type Kind = "profile-history" | "moderation-audit" | "server-monitors";
const key = (account: string) => `xray.serverData.v1:${account}`;
const localKey = (kind: Kind, account: string) => `xray.${kind === "profile-history" ? "profileHistory" : kind === "server-monitors" ? "serverMonitors" : "moderationAudit"}.v1:${account}`;
const transport = {
  read: (ns: string) => invoke("document_store", { ns, value: null, revision: null }) as Promise<DocumentReply>,
  write: (ns: string, value: string, revision: number) => invoke("document_store", { ns, value, revision }) as Promise<{ revision: number }>,
};
let activeAccount: string | undefined;
let documents = new Map<Kind, DocumentSession>();
let switching = false;
const listeners = new Set<() => void>();
export function serverDataEnabled(account = myId()): boolean { try { return !!account && storage?.getItem(key(account)) === "true"; } catch { return false; } }
export const storageSwitching = () => switching;
export function accountDocument(kind: Kind, account: string): DocumentSession {
  if (activeAccount !== account) { activeAccount = account; documents = new Map(); }
  let document = documents.get(kind);
  if (!document) { document = new DocumentSession(`${kind}.${account}`, localKey(kind, account), storage, serverDataEnabled(account), transport); documents.set(kind, document); }
  return document;
}
export function onStorageModeChanged(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export async function setServerData(on: boolean): Promise<void> {
  const account = myId(); if (!account || !storage) throw new Error("Sign in before changing storage.");
  if (switching) throw new Error("A storage change is already running.");
  if (on === serverDataEnabled(account)) return;
  switching = true;
  try {
    const kinds: Kind[] = ["profile-history", "moderation-audit", "server-monitors"];
    for (const doc of documents.values()) await doc.idle();
    const prepared: DocumentSession[] = [];
    if (on) {
      for (const kind of kinds) { const doc = new DocumentSession(`${kind}.${account}`, localKey(kind, account), storage, true, transport); await doc.load(); prepared.push(doc); }
    } else {
      for (const kind of kinds) { const doc = accountDocument(kind,account); await doc.load(); if (doc.value !== null) storage.setItem(localKey(kind,account),doc.value); }
    }
    if (myId() !== account) throw new Error("Account changed. Reopen settings for the current account.");
    storage.setItem(key(account), String(on));
    // Server acknowledgement and read-back precede removing any local record.
    try { for (const doc of prepared) doc.removeMigratedLocal(); }
    finally { documents.clear(); listeners.forEach(listener => listener()); }
  } finally { switching = false; }
}
