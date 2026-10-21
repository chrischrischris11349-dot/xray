/**
 * Hooks Discord's webpack runtime so xray sees every module as it loads.
 *
 * Discord's bundles register themselves by pushing chunks onto
 * `window.webpackChunkdiscord_app`. xray traps that array as it's created and
 * wraps each module factory before webpack stores it. A wrapped factory
 * records its module after it has run, and that record is what `find` and
 * `waitFor` search. The first factory call also hands over
 * `__webpack_require__`, which `findByCode` uses to load modules on demand.
 */
import { warn } from "./env";

type Module = { exports: any };
type Factory = (this: unknown, module: Module, exports: unknown, require: WebpackRequire) => void;
export type WebpackRequire = (id: PropertyKey) => any;
export type Filter = (candidate: any) => boolean;

interface Waiter {
  filter: Filter;
  resolve: (match: any) => void;
}

const CHUNK_GLOBAL = "webpackChunkdiscord_app";
const WRAPPED = Symbol("xray.wrapped");
/** Most modules export a few names. Scanning huge export bags would slow every module load. */
const MAX_SCANNED_KEYS = 64;

const loaded = new Map<PropertyKey, Module>();
const factories = new Map<PropertyKey, Factory>();
const waiters = new Set<Waiter>();
const instrumented = new WeakSet<object>();
let wreq: WebpackRequire | undefined;
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
    wreq ??= require;
    factory.call(this, module, exports, require);
    loaded.set(id, module);
    if (waiters.size) settleWaiters(module.exports);
  } as Factory & { [WRAPPED]?: true };
  wrapped[WRAPPED] = true;
  // Code searches (and Discord's own error reports) read factory source.
  wrapped.toString = () => Function.prototype.toString.call(factory);
  return wrapped;
}

function settleWaiters(exports: unknown): void {
  for (const waiter of waiters) {
    const match = firstMatch(exports, waiter.filter);
    if (match === undefined) continue;
    waiters.delete(waiter);
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
  for (const module of loaded.values()) {
    const match = firstMatch(module.exports, filter);
    if (match !== undefined) return match;
  }
  return undefined;
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

/** Finds a module by text in its factory's source and returns its exports, loading it if needed. */
export function findByCode(...code: string[]): any {
  for (const [id, factory] of factories) {
    const source = Function.prototype.toString.call(factory);
    if (!code.every((c) => source.includes(c))) continue;
    const module = loaded.get(id);
    return module ? module.exports : wreq?.(id);
  }
  return undefined;
}

export const filters = {
  /** Objects or functions that have every one of these properties. */
  byProps:
    (...props: string[]): Filter =>
    (c) =>
      (typeof c === "object" || typeof c === "function") && c !== null && props.every((p) => p in c),
  /** Functions whose source contains every one of these strings. */
  byCode:
    (...code: string[]): Filter =>
    (c) => {
      if (typeof c !== "function") return false;
      const source = Function.prototype.toString.call(c);
      return code.every((s) => source.includes(s));
    },
  /** A Flux store by the name Discord registers it under, such as "UserStore". */
  byStoreName:
    (name: string): Filter =>
    (c) =>
      typeof c?.getName === "function" && typeof c?.addChangeListener === "function" && c.getName() === name,
};

export function webpackStats() {
  return { hooked, require: wreq !== undefined, factories: factories.size, loaded: loaded.size, waiting: waiters.size };
}
