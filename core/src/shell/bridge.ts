/**
 * Calls into xray's Rust side through Tauri's bridge. Discord's page may only
 * call the commands granted in src-tauri/capabilities/main.json.
 */
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const call = (window as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__?.invoke;
  return call ? call(command, args) : Promise.reject(new Error("xray's Rust bridge isn't available"));
}
