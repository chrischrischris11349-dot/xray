/**
 * Hooks Discord's webpack runtime so xray sees every module as it loads.
 *
 * Discord's bundles register themselves by pushing chunks onto
 * `window.webpackChunkdiscord_app`. xray traps that array as it's created and
 * wraps each module factory before webpack stores it. A wrapped factory
 * records its module after it has run, and that record is what `find` and
 * `waitFor` search. Factory calls also hand over `__webpack_require__`, which
 * `findByCode` uses to load modules on demand.
 *
 * Discord runs four webpack runtimes on the same chunk array, and each keeps
 * its own copy of any module it runs. So module ids repeat across runtimes,
 * and every instance is kept. Loading on demand goes through the main runtime
 * (the one with the most modules), which is the one Discord's UI uses.
 *
 * A runtime's own script also carries modules that never pass through the
 * chunk array (in Discord's main script that's thousands, MediaEngineStore
 * among them). The first time xray meets a runtime, it adopts those: ones
 * that already ran are recorded from the runtime's module cache, and the
 * rest are wrapped like any other.
 */
import { warn } from "./env";

type Module = { exports: any };
type Factory = (this: unknown, module: Module, exports: unknown, require: WebpackRequire) => void;
export type WebpackRequire = ((id: PropertyKey) => any) & { m?: Record<PropertyKey, unknown>; c?: Record<PropertyKey, Module> };
export type Filter = (candidate: any) => boolean;

interface Loaded {
  id: PropertyKey;
  module: Module;
  require: WebpackRequire;
}

interface Waiter {
  filter: Filter;
  resolve: (match: any) => void;
  /** Keeps waiting after a match, for every module that matches (see `everyMatch`). */
  forever?: boolean;
}

const CHUNK_GLOBAL = "webpackChunkdiscord_app";
const WRAPPED = Symbol("xray.wrapped");
/** Most modules export a few names. Scanning huge export bags would slow every module load. */
const MAX_SCANNED_KEYS = 64;

/** Every module instance that has run, in load order. */
const loaded: Loaded[] = [];
const recorded = new WeakSet<Module>();
const factories = new Map<PropertyKey, Factory>();
const waiters = new Set<Waiter>();
const instrumented = new WeakSet<object>();
const runtimes = new Set<WebpackRequire>();
let lastRequire: WebpackRequire | undefined;
let mainRuntime: WebpackRequire | undefined;
let mainRuntimeChecked = 0;
let hooked = false;

export function hookWebpack(): void {
  if (hooked) return;
  hooked = true;
  let chunks: unknown = (window as any)[CHUNK_GLOBAL];
  if (Array.isArray(chunks)) {
    warn("webpack started before xray; modules it already loaded were missed");
    instrument(chunks);
    return;
  }
  Object.defineProperty(window, CHUNK_GLOBAL, {
    configurable: true,
    get: () => chunks,
    set(value: unknown) {
      chunks = value;
      if (Array.isArray(value)) instrument(value);
    },
  });
}

type Push = (...items: unknown[]) => number;

/**
 * Wraps the chunk array's `push`. Discord runs more than one webpack runtime
 * on this array. Each runtime reads `push`, keeps it as the fallback it calls
 * after handling a chunk, then sets its own loader, so the loaders form a
 * chain ending in the plain array push. The property behaves exactly like a
 * plain one, except that whatever gets set is wrapped first, so the chain
 * stays intact.
 */
function instrument(chunks: unknown[]): void {
  // Every Discord bundle runs `webpackChunkdiscord_app = webpackChunkdiscord_app || []`,
  // reassigning the same array. Instrumenting it again would reset the chain.
  if (instrumented.has(chunks)) return;
  instrumented.add(chunks);
  chunks.forEach(wrapChunk);
  const wrapPush = (push: Push): Push =>
    function (this: unknown, ...items: unknown[]): number {
      items.forEach(wrapChunk);
      return push.apply(this ?? chunks, items);
    };
  let push = wrapPush(Array.prototype.push);
  Object.defineProperty(chunks, "push", {
    configurable: true,
    get: () => push,
    set(fn: Push) {
      push = wrapPush(fn);
    },
  });
}

function wrapChunk(chunk: unknown): void {
  if (!Array.isArray(chunk)) return;
  const modules = chunk[1] as Record<PropertyKey, Factory & { [WRAPPED]?: true }> | undefined;
  if (!modules || typeof modules !== "object") return;
  for (const id in modules) {
    const factory = modules[id];
    if (typeof factory === "function" && !factory[WRAPPED]) modules[id] = wrapFactory(id, factory);
  }
}

function wrapFactory(id: PropertyKey, factory: Factory): Factory {
  factories.set(id, factory);
  const wrapped = function (this: unknown, module: Module, exports: unknown, require: WebpackRequire) {
    if (require !== lastRequire) {
      lastRequire = require;
      if (!runtimes.has(require)) adopt(require, module);
    }
    factory.call(this, module, exports, require);
    record(id, module, require);
  } as Factory & { [WRAPPED]?: true };
  wrapped[WRAPPED] = true;
  // Code searches (and Discord's own error reports) read factory source.
  wrapped.toString = () => Function.prototype.toString.call(factory);
  return wrapped;
}

/** Modules adopted while still running; offered to waiters once they finish. */
const unsettled = new Set<Module & { loaded?: boolean }>();

/** `settle` is false for a module that's still running: its exports aren't there yet. */
function record(id: PropertyKey, module: Module, require: WebpackRequire, settle = true): void {
  if (recorded.has(module)) return;
  recorded.add(module);
  loaded.push({ id, module, require });
  if (!settle) {
    unsettled.add(module);
    return;
  }
  if (!waiters.size) return;
  settleWaiters(module.exports);
  for (const early of unsettled) {
    if (early.loaded === false) continue;
    unsettled.delete(early);
    settleWaiters(early.exports);
  }
}

/**
 * Takes in a runtime's own modules: see the note at the top of this file.
 * Webpack caches a module before running it, so the cache can hold modules
 * that are still running: `current` (the one whose wrapper got here, which
 * records itself once it has run) and any built-in module that required it.
 */
function adopt(runtime: WebpackRequire, current: Module): void {
  runtimes.add(runtime);
  const table = runtime.m as Record<PropertyKey, (Factory & { [WRAPPED]?: true }) | undefined> | undefined;
  if (table) {
    for (const id in table) {
      const factory = table[id];
      if (typeof factory === "function" && !factory[WRAPPED]) table[id] = wrapFactory(id, factory);
    }
  }
  const cache = runtime.c;
  if (cache) {
    for (const id in cache) {
      const module = cache[id] as Module & { loaded?: boolean };
      if (module && typeof module === "object" && module !== current) record(id, module, runtime, module.loaded !== false);
    }
  }
}

function settleWaiters(exports: unknown): void {
  for (const waiter of waiters) {
    const match = firstMatch(exports, waiter.filter);
    if (match === undefined) continue;
    if (!waiter.forever) waiters.delete(waiter);
    try {
      waiter.resolve(match);
    } catch (err) {
      warn("a waitFor callback failed", err);
    }
  }
}

/** Tests a module's exports, then each of its exported values. */
function firstMatch(exports: unknown, filter: Filter): any {
  if (exports == null || exports === window || exports === document) return undefined;
  if (test(filter, exports)) return exports;
  if (typeof exports !== "object" && typeof exports !== "function") return undefined;
  let keys: string[];
  try {
    keys = Object.keys(exports);
  } catch {
    return undefined;
  }
  if (keys.length > MAX_SCANNED_KEYS) return undefined;
  for (const key of keys) {
    let value: unknown;
    try {
      value = (exports as any)[key];
    } catch {
      continue;
    }
    if (value != null && value !== exports && value !== window && test(filter, value)) return value;
  }
  return undefined;
}

function test(filter: Filter, candidate: unknown): boolean {
  try {
    return filter(candidate) === true;
  } catch {
    return false;
  }
}

/** The first loaded export that passes `filter`, or undefined. */
export function find(filter: Filter): any {
  for (const { module } of loaded) {
    const match = firstMatch(module.exports, filter);
    if (match !== undefined) return match;
  }
  return undefined;
}

/** The runtime with the most modules. Rechecked only when a new runtime has appeared. */
function main(): WebpackRequire | undefined {
  if (runtimes.size !== mainRuntimeChecked) {
    mainRuntimeChecked = runtimes.size;
    let most = -1;
    for (const runtime of runtimes) {
      const size = runtime.m ? Object.keys(runtime.m).length : 0;
      if (size > most) {
        most = size;
        mainRuntime = runtime;
      }
    }
  }
  return mainRuntime;
}

/**
 * Calls `resolve` with the first export that passes `filter`, right away if
 * it's already loaded, otherwise as soon as it loads. Returns a cancel function.
 * Prefer `byProps` and `byStoreName` here: `byCode` reads function source on
 * every module load while it waits.
 */
export function waitFor(filter: Filter, resolve: (match: any) => void): () => void {
  const match = find(filter);
  if (match !== undefined) {
    resolve(match);
    return () => {};
  }
  const waiter: Waiter = { filter, resolve };
  waiters.add(waiter);
  return () => waiters.delete(waiter);
}

/**
 * Calls `callback` with every export that passes `filter`: each one already
 * loaded, then each one as it loads. Discord's runtimes each run their own
 * copy of shared modules (React's among them), and this reaches all of them.
 */
export function everyMatch(filter: Filter, callback: (match: any) => void): void {
  for (const { module } of loaded) {
    const match = firstMatch(module.exports, filter);
    if (match !== undefined) callback(match);
  }
  waiters.add({ filter, resolve: callback, forever: true });
}

/** Finds a module by text in its factory's source and returns its exports, loading it if needed. */
export function findByCode(...code: string[]): any {
  for (const [id, factory] of factories) {
    const source = Function.prototype.toString.call(factory);
    if (!code.every((c) => source.includes(c))) continue;
    const runtime = main();
    const instances = loaded.filter((entry) => entry.id === id);
    const instance = instances.find((entry) => entry.require === runtime) ?? instances[0];
    return instance ? instance.module.exports : runtime?.(id);
  }
  return undefined;
}

export const filters = {
  /** Objects or functions that have every one of these properties. */
  byProps:
    (...props: string[]): Filter =>
    (c) =>
      (typeof c === "object" || typeof c === "function") && c !== null && props.every((p) => p in c),
  /**
   * Objects holding each of these as their own plain, writable function, so
   * the patcher can replace them. This also rules out Discord's lazy
   * proxies, which invent functions on read but own no properties.
   */
  byOwnMethods:
    (...names: string[]): Filter =>
    (c) =>
      typeof c === "object" &&
      c !== null &&
      names.every((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(c, name);
        return !!descriptor && typeof descriptor.value === "function" && descriptor.writable === true;
      }),
  /** Functions whose source contains every one of these strings. */
  byCode:
    (...code: string[]): Filter =>
    (c) => {
      if (typeof c !== "function") return false;
      const source = Function.prototype.toString.call(c);
      return code.every((s) => source.includes(s));
    },
  /**
   * A Flux store by the name Discord registers it under, such as "UserStore".
   * Checks with `in` before reading: some of Discord's exports are lazy
   * proxies that invent a function for any property you read.
   */
  byStoreName:
    (name: string): Filter =>
    (c) =>
      (typeof c === "object" || typeof c === "function") &&
      c !== null &&
      "getName" in c &&
      "addChangeListener" in c &&
      typeof c.getName === "function" &&
      c.getName() === name,
};

export function webpackStats() {
  return { hooked, runtimes: runtimes.size, factories: factories.size, loaded: loaded.length, waiting: waiters.size };
}
