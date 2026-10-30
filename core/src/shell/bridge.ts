/**
 * Calls into xray's Rust side through Tauri's bridge. Discord's page may only
 * call the commands granted in src-tauri/capabilities/main.json.
 */
import {withOfflineStorage} from './offline';
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const call = (window as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__?.invoke;
  const native=(name:string,options?:Record<string,unknown>):Promise<any>=>call?call(name,options):Promise.reject(new Error("xray's Rust bridge isn't available"));
  return withOfflineStorage(command,args,native);
}
