/**
 * Discord's Flux dispatcher. Every change in Discord's client is an action
 * sent through it: MESSAGE_CREATE, MESSAGE_DELETE, VOICE_STATE_UPDATES,
 * CHANNEL_SELECT and hundreds more. The action names are plain strings that
 * Discord keeps stable across builds, which makes them the sturdiest thing
 * for a plugin to build on.
 *
 * Plugins can listen to actions, send their own, and intercept actions
 * before Discord's stores see them (to drop one, or change it in place).
 */
import { warn } from "../env";
import { waitFor } from "../webpack";

export interface Action {
  type: string;
  [key: string]: any;
}

/** Return true to drop the action before any store sees it. */
export type Interceptor = (action: Action) => boolean | void;

const isDispatcher = (c: any) =>
  typeof c === "object" &&
  c !== null &&
  "_actionHandlers" in c &&
  "_interceptors" in c &&
  typeof c.dispatch === "function" &&
  typeof c.subscribe === "function" &&
  typeof c.addInterceptor === "function";

let dispatcher: any;
const ready: ((d: any) => void)[] = [];
const interceptors = new Set<Interceptor>();

waitFor(isDispatcher, (found) => {
  dispatcher = found;
  // One interceptor for all of xray. Discord has no way to remove one, so
  // plugins come and go from the set instead.
  found.addInterceptor((action: Action) => {
    for (const interceptor of interceptors) {
      try {
        if (interceptor(action) === true) return true;
      } catch (err) {
        warn(`an interceptor for ${action?.type} failed`, err);
      }
    }
    return false;
  });
  ready.splice(0).forEach((then) => then(found));
});

function whenReady(then: (d: any) => void): void {
  if (dispatcher) then(dispatcher);
  else ready.push(then);
}

/** Calls `listener` after Discord's stores have handled each action of this type. Returns a function that stops it. */
export function onAction(type: string, listener: (action: Action) => void): () => void {
  let stopped = false;
  const safe = (action: Action) => {
    try {
      listener(action);
    } catch (err) {
      warn(`a ${type} listener failed`, err);
    }
  };
  whenReady((d) => {
    if (!stopped) d.subscribe(type, safe);
  });
  return () => {
    stopped = true;
    dispatcher?.unsubscribe(type, safe);
  };
}

/** Sees every action before Discord's stores do. Returns a function that stops it. */
export function intercept(interceptor: Interceptor): () => void {
  interceptors.add(interceptor);
  return () => interceptors.delete(interceptor);
}

/** Sends an action, exactly as Discord's own code does. */
export function dispatch(action: Action): Promise<void> {
  if (!dispatcher) return Promise.reject(new Error("Discord's dispatcher isn't loaded yet"));
  return dispatcher.dispatch(action);
}
