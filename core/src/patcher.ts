/**
 * Method patching: run code before or after an existing method, or replace it.
 * Patches on one method stack, each returns its own undo, and an error inside
 * a patch is logged instead of breaking Discord.
 *
 * This works on methods stored on objects and prototypes. Webpack's ES module
 * exports are read-only getters, so those can't be patched this way: patch
 * the object or prototype the function lives on instead.
 */
import { warn } from "./env";

export interface Hooks {
  /** Runs first. Can change `args` in place. */
  before?(self: any, args: any[]): void;
  /** Replaces the call. `original` runs the next patch down, or the real method. */
  instead?(self: any, args: any[], original: (...args: any[]) => any): any;
  /** Runs last. Return a value to replace the result, or nothing to keep it. */
  after?(self: any, args: any[], result: any): any;
}

interface Patched {
  original: (...args: any[]) => any;
  wrapper: (...args: any[]) => any;
  hooks: Hooks[];
}

const patched = new WeakMap<object, Map<PropertyKey, Patched>>();

export function patch(target: object, key: PropertyKey, hooks: Hooks): () => void {
  let byKey = patched.get(target);
  if (!byKey) patched.set(target, (byKey = new Map()));
  const entry = byKey.get(key) ?? install(target, key);
  byKey.set(key, entry);
  entry.hooks.push(hooks);

  return () => {
    const i = entry.hooks.indexOf(hooks);
    if (i !== -1) entry.hooks.splice(i, 1);
    if (entry.hooks.length === 0 && (target as any)[key] === entry.wrapper) {
      (target as any)[key] = entry.original;
      byKey.delete(key);
    }
  };
}

function install(target: object, key: PropertyKey): Patched {
  const original = (target as any)[key];
  if (typeof original !== "function") throw new TypeError(`xray: can't patch ${String(key)}, it isn't a function`);
  const entry: Patched = { original, hooks: [], wrapper: original };
  entry.wrapper = function (this: unknown, ...args: any[]) {
    return run(entry, this, args);
  };
  Object.defineProperty(entry.wrapper, "name", { value: original.name, configurable: true });
  Object.defineProperty(entry.wrapper, "length", { value: original.length, configurable: true });
  entry.wrapper.toString = () => Function.prototype.toString.call(original);
  try {
    (target as any)[key] = entry.wrapper;
  } catch {
    // checked below
  }
  if ((target as any)[key] !== entry.wrapper) throw new TypeError(`xray: ${String(key)} is read-only, so it can't be patched`);
  return entry;
}

function run(entry: Patched, self: unknown, args: any[]): any {
  const hooks = entry.hooks.slice();
  for (const h of hooks) if (h.before) guard(() => h.before!(self, args));

  // Each `instead` wraps the ones added before it; the oldest wraps the original.
  let call = (a: any[]) => entry.original.apply(self, a);
  for (const h of hooks) {
    if (!h.instead) continue;
    const next = call;
    const instead = h.instead;
    call = (a) => {
      let reachedOriginal = false;
      try {
        return instead(self, a, (...x: any[]) => {
          reachedOriginal = true;
          return next(x);
        });
      } catch (err) {
        // Errors from Discord's own code pass through untouched.
        if (reachedOriginal) throw err;
        warn("an instead patch failed; running the original", err);
        return next(a);
      }
    };
  }

  let result = call(args);
  for (const h of hooks) {
    if (!h.after) continue;
    guard(() => {
      const replaced = h.after!(self, args, result);
      if (replaced !== undefined) result = replaced;
    });
  }
  return result;
}

function guard(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    warn("a patch failed", err);
  }
}
