import { intercept, onAction } from "../api/flux";
import { myId, stores } from "../discord";
import { storage } from "../env";
import { deletionExcerpt, ProfileHistory, type Category, type Snapshot } from "./model";
import { HistoryObserver } from "./observer";
import { customStatusSnapshot } from "./customStatus";
import { accountDocument, onStorageModeChanged, serverDataEnabled, storageSwitching } from "../shell/serverStorage";
import type { DocumentSession } from "../shell/documentSession";

let account: string | undefined, engine: ProfileHistory | undefined, observer: HistoryObserver | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let installed = false;
let error = "";
let document: DocumentSession | undefined;
let loading = false, pending = 0;
let changes = 0, savedChanges = 0;
let flight: { backend: DocumentSession; dirty: boolean; promise: Promise<void> } | undefined;
const listeners = new Set<(id: string) => void>();
const key = () => `xray.profileHistory.v1:${account}`;
function notify(id = "*"): void { for (const listener of listeners) listener(id); }
export async function flushHistory(): Promise<void> {
  clearTimeout(timer); timer = undefined;
  if (!account || !engine || !document || loading) return;
  const owner = account, model = engine, backend = document;
  if (flight?.backend === backend) {
    const previous = flight; previous.dirty = true;
    await previous.promise;
    if (account === owner && document === backend) await flushHistory();
    return;
  }
  if (changes === savedChanges) return;
  const version = changes, snapshot = model.serialize();
  const job = { backend, dirty: false, promise: Promise.resolve() };
  flight = job;
  pending++; notify();
  job.promise = (async () => {
    try { await backend.write(snapshot); if (document === backend) { error = ""; savedChanges = version; } }
    catch (failure) { if (document === backend) error = `${String((failure as Error)?.message ?? failure)} Changes are only in memory; keep XRay open and retry saving.`; throw failure; }
    finally {
      if (flight === job) flight = undefined;
      if (document === backend) {
        pending = Math.max(0,pending-1);
        if (job.dirty && timer === undefined) timer = setTimeout(flush, error ? 5000 : 250);
        notify();
      }
    }
  })();
  await job.promise;
}
function flush(): void { void flushHistory().catch(() => {}); }
function current(): ProfileHistory | undefined {
  const id = myId();
  if (id === account) return engine;
  flush(); observer?.clear(); account = id; engine = observer = undefined; document = undefined; error = ""; pending = 0; loading = false; changes = savedChanges = 0;
  if (!id) return;
  document = accountDocument("profile-history",id);
  const backend = document;
  if (serverDataEnabled(id)) {
    loading = true;
    void backend.load().then(() => {
      if (account !== id || document !== backend) return;
      if (backend.value !== null) {
        let parsed;
        try { parsed = JSON.parse(backend.value); } catch { throw new Error("The server history document is unreadable. It was not overwritten."); }
        if (parsed?.version !== 1 || !parsed.people || typeof parsed.people !== "object" || Array.isArray(parsed.people)) throw new Error("The server history format is unsupported. It was not overwritten.");
      }
      engine = new ProfileHistory(backend.value); observer = new HistoryObserver(engine,(channel,message) => stores.messages?.getMessage?.(channel,message)); loading = false;
      if (backend.value !== null && engine.serialize() !== backend.value) { changes++; timer = setTimeout(flush,250); }
      backend.removeMigratedLocal(); notify();
    }).catch(failure => { if (account === id && document === backend) { loading = false; error = String((failure as Error)?.message ?? failure); notify(); } });
    return;
  }
  let raw: string | null = null;
  try { raw = storage?.getItem(key()) ?? null; } catch { error = "Saved history could not be read."; }
  engine = new ProfileHistory(raw); observer = new HistoryObserver(engine, (channel,id) => stores.messages?.getMessage?.(channel,id));
  if (raw !== null && engine.serialize() !== raw) changes++;
  return engine;
}
function changed(id: string): void {
  changes++;
  if (flight && flight.backend === document) flight.dirty = true;
  else if(timer === undefined) timer = setTimeout(flush, error ? 5000 : 250);
  notify(id);
}
export function historyFor(id: string) { const model = current(); model?.prune(false); return model?.get(id); }
export function retryHistoryLoad(): void {
  if(loading || pending || flight || engine)return;
  account=undefined;current();notify();
}
export function historyError(): string { return error || (loading ? "Loading history from your server…" : pending ? "Saving… Keep XRay open until this finishes." : ""); }
export function historyStorageLabel(): string { return serverDataEnabled() ? "your server" : "this device"; }
function writable(): ProfileHistory {
  const model = current();
  if (storageSwitching()) throw new Error("Wait for the storage change to finish.");
  if (!model) throw new Error(error || (loading ? "Wait for server history to load." : "Sign in before saving profile history."));
  return model;
}
export async function configureHistory(id: string, enabled: boolean, categories?: Category[], days?: number): Promise<void> {
  const model = writable();
  model.configure(id, enabled, categories, days); observer?.clear(); changed(id); await flushHistory();
  captureProfile(id);
}
export async function saveProfileNote(id: string, note: string): Promise<void> { writable().note(id,note); changed(id); await flushHistory(); }
export async function clearProfileHistory(id: string): Promise<void> { writable().clear(id); changed(id); await flushHistory(); }
export async function removeProfileHistory(id: string): Promise<void> { writable().remove(id); observer?.clear(); changed(id); await flushHistory(); }
/** User-requested recovery of attachment references; preserve historical text. */
export async function retainRecoveredMedia(id:string,message:any):Promise<void>{
  if(message?.author?.id!==id)throw Error("Original message author does not match this profile");
  const record=writable().get(id);if(!record)throw Error("History is no longer configured");
  const excerpt=deletionExcerpt(message),channel=message.channel_id??message.channelId;
  if(!excerpt.messageImages?.length&&!excerpt.messageVideos?.length)throw Error("The original message returned no supported photo/video attachment URLs");
  for(const event of record.events)if(event.channelId===channel&&event.messageId===message.id){event.messageImages=excerpt.messageImages;event.messageVideos=excerpt.messageVideos;event.messageFiles=excerpt.messageFiles;}
  changed(id);await flushHistory();
}
export function subscribeHistory(listener: (id: string) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
/** Seed only global fields; visiting different server bios must not create false changes. */
export function captureProfile(id: string): void {
  const model = current(); if (!model?.get(id)?.enabled) return;
  const user = stores.users?.getUser?.(id), profile = stores.profiles?.getUserProfile?.(id);
  const snapshot: Snapshot = {};
  for (const field of ["username", "avatar", "banner"] as const) if (user?.[field] === null || typeof user?.[field] === "string") snapshot[field] = user[field];
  if (user?.globalName === null || typeof user?.globalName === "string") snapshot.displayName = user.globalName;
  if (profile?.bio === null || typeof profile?.bio === "string") snapshot.bio = profile.bio;
  const status = stores.presences?.getStatus?.(id);
  if (["online","idle","dnd","offline"].includes(status)) snapshot.presence = status;
  if (["online","idle","dnd"].includes(status)) {
    const customStatus = customStatusSnapshot(stores.presences?.getActivities?.(id));
    if (customStatus !== undefined) snapshot.customStatus = customStatus;
  }
  model.observe(id,snapshot,true);
}
export function observeProfileResponse(id: string, body: any): void {
  if (storageSwitching()) return;
  current();
  if (!body || body.user?.id && body.user.id !== id) return;
  for (const target of observer?.handle({type:"USER_PROFILE_FETCH_SUCCESS",user:body.user ?? {id},user_profile:body.user_profile}) ?? []) changed(target);
}
export function startProfileHistory(): void {
  if (installed) return; installed = true;
  const relevant = new Set(["PRESENCE_UPDATE","PRESENCE_UPDATES","USER_UPDATE","USER_PROFILE_FETCH_SUCCESS","GUILD_MEMBER_ADD","GUILD_MEMBER_REMOVE","MESSAGE_CREATE","MESSAGE_UPDATE","MESSAGE_DELETE","MESSAGE_DELETE_BULK"]);
  intercept(action => {
    if (storageSwitching()) return;
    if(!relevant.has(action.type)) return;
    current();
    if(!engine || !Object.values(engine.document.people).some(person=>person.enabled)) return;
    // Observe only the events already delivered to the client. Never mutate/drop them.
    for (const id of observer?.handle(action) ?? []) changed(id);
  });
  onAction("CONNECTION_OPEN", () => { current()?.resetBaselines(); observer?.clear(); });
  onAction("LOGOUT", () => { flush(); observer?.clear(); account = undefined; engine = observer = undefined; document = undefined; });
  window.addEventListener("pagehide", flush);
  onStorageModeChanged(() => { observer?.clear(); account = undefined; engine = observer = undefined; document = undefined; current(); notify(); });
}
