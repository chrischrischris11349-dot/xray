/**
 * Element hooks: how xray changes Discord's UI without rewriting its code.
 *
 * Discord's UI is React, and every element it renders is created by one
 * function, the JSX runtime's `jsx()` (Discord's modules call it as
 * `(0, r.jsx)(Type, props)`, reading it off the module each time). xray wraps
 * that function once, and plugins register hooks for the component types
 * they care about. A hook sees an element's props as it's created and can
 * return new ones: add a menu item, wrap children, change a label.
 *
 * A component can be named two ways:
 *   - by identity, when a plugin found it among Discord's exports
 *   - by code: text in its source, for components Discord doesn't export.
 *     Each new component type is checked once, the first time it renders,
 *     and only while some hook is waiting for code.
 *
 * With no hooks registered, the wrapper costs one boolean check per element.
 */
import { warn } from "../env";
import { everyMatch, filters, find } from "../webpack";

/** Gets the element's props; return replacement props, or nothing to keep them. */
export type ElementHook = (props: any, type: unknown) => any;

interface CodeHook {
  needles: readonly string[];
  hook: ElementHook;
}

const byType = new Map<unknown, Set<ElementHook>>();
const codeHooks = new Set<CodeHook>();
/** Which generation of code hooks each component type was last checked against. */
const checked = new WeakMap<object, number>();
let generation = 0;
let active = false;
const wrappedRuntimes = new WeakSet<object>();

const isJsxRuntime = (c: any) =>
  typeof c === "object" && c !== null && "jsx" in c && "jsxs" in c && "Fragment" in c && typeof c.jsx === "function";

everyMatch(isJsxRuntime, (runtime) => {
  if (wrappedRuntimes.has(runtime)) return;
  wrappedRuntimes.add(runtime);
  const jsx = runtime.jsx;
  const jsxs = runtime.jsxs;
  runtime.jsx = wrap(jsx);
  runtime.jsxs = jsxs === jsx ? runtime.jsx : wrap(jsxs);
});

function wrap(original: (type: unknown, props: any, key?: unknown) => unknown) {
  const wrapped = function (type: unknown, props: any, key?: unknown) {
    if (active) {
      const hooks = byType.get(type) ?? (codeHooks.size ? classify(type) : undefined);
      if (hooks) props = run(hooks, type, props);
    }
    return original(type, props, key);
  };
  wrapped.toString = () => Function.prototype.toString.call(original);
  return wrapped;
}

function run(hooks: Set<ElementHook>, type: unknown, props: any): any {
  for (const hook of hooks) {
    try {
      const next = hook(props, type);
      if (next !== undefined) props = next;
    } catch (err) {
      warn("an element hook failed", err);
    }
  }
  return props;
}

/** The function to read source from: the component itself, or what a memo/forwardRef wraps. */
function sourceOf(type: unknown): Function | undefined {
  if (typeof type === "function") return type;
  if (typeof type === "object" && type !== null) {
    const inner = (type as any).render ?? (type as any).type;
    if (typeof inner === "function") return inner;
  }
  return undefined;
}

function classify(type: unknown): Set<ElementHook> | undefined {
  if (typeof type !== "function" && (typeof type !== "object" || type === null)) return undefined;
  if (checked.get(type) === generation) return undefined;
  checked.set(type, generation);
  const fn = sourceOf(type);
  if (!fn) return undefined;
  let source: string;
  try {
    source = Function.prototype.toString.call(fn);
  } catch {
    return undefined;
  }
  for (const { needles, hook } of codeHooks) {
    if (needles.every((needle) => source.includes(needle))) add(type, hook);
  }
  return byType.get(type);
}

function add(type: unknown, hook: ElementHook): void {
  let hooks = byType.get(type);
  if (!hooks) byType.set(type, (hooks = new Set()));
  hooks.add(hook);
}

function refresh(): void {
  active = byType.size > 0 || codeHooks.size > 0;
}

/** Hooks elements of one component type. Returns a function that removes the hook. */
export function onElement(type: unknown, hook: ElementHook): () => void {
  add(type, hook);
  refresh();
  return () => {
    const hooks = byType.get(type);
    hooks?.delete(hook);
    if (hooks && hooks.size === 0) byType.delete(type);
    refresh();
  };
}

/** Hooks elements of every component whose source contains all of `needles`. */
export function onElementByCode(needles: readonly string[], hook: ElementHook): () => void {
  const entry: CodeHook = { needles, hook };
  codeHooks.add(entry);
  // Types checked before this hook existed get checked again.
  generation++;
  refresh();
  return () => {
    codeHooks.delete(entry);
    for (const [type, hooks] of byType) {
      if (hooks.delete(hook) && hooks.size === 0) byType.delete(type);
    }
    refresh();
  };
}

let reactModule: any;

/** Discord's React, for building elements. */
export function react(): any {
  return (reactModule ??= find(filters.byProps("useState", "useEffect", "createElement", "Fragment")));
}

/** Builds a React element, or null if React isn't loaded yet. */
export function createElement(type: unknown, props?: any, ...children: unknown[]): any {
  return react()?.createElement(type, props, ...children) ?? null;
}
