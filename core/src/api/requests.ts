/**
 * Watches requests Discord's page sends to its own API, and rewrites their
 * JSON bodies right before they leave. Discord's HTTP client uses XMLHttpRequest, and a
 * few calls use fetch, so both are covered. Messages with attachments carry
 * their JSON in a `payload_json` form field, which is handled the same way.
 *
 * Working on the request rather than Discord's modules means renamed
 * internals can't break a plugin built on it.
 */
import { warn } from "../env";
import { patch } from "../patcher";

export interface ApiRequest {
  method: string;
  /** The path after /api/v<n>, like /channels/123/messages. */
  path: string;
  /** The parsed JSON body. Change it in place. */
  body: any;
}

interface Rule {
  methods: readonly string[];
  path: RegExp;
  rewrite: (request: ApiRequest) => void;
}

const rules = new Set<Rule>();
const watchers = new Set<{ methods: readonly string[]; path: RegExp; seen: (method: string, path: string) => void }>();
const opened = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
let installed = false;

const API_PATH = /^\/api(?:\/v\d+)?(\/.*)$/;

function apiPath(url: string): string | null {
  try {
    const parsed = new URL(url, location.href);
    if (parsed.hostname !== location.hostname) return null;
    return API_PATH.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function rewriteJson(method: string, path: string, json: string): string {
  let body: any;
  try {
    body = JSON.parse(json);
  } catch {
    return json;
  }
  let changed = false;
  for (const rule of rules) {
    if (!rule.methods.includes(method) || !rule.path.test(path)) continue;
    const before = JSON.stringify(body);
    try {
      rule.rewrite({ method, path, body });
    } catch (err) {
      warn("a request rewrite failed", err);
    }
    if (!changed && JSON.stringify(body) !== before) changed = true;
  }
  return changed ? JSON.stringify(body) : json;
}

function rewriteBody(method: string, url: string, body: unknown): unknown {
  if (!rules.size) return body;
  const path = apiPath(url);
  if (!path) return body;
  if (typeof body === "string") return rewriteJson(method, path, body);
  if (body instanceof FormData) {
    const payload = body.get("payload_json");
    if (typeof payload === "string") body.set("payload_json", rewriteJson(method, path, payload));
  }
  return body;
}

/** Tells watchers about a request, body or not. */
function notice(method: string, url: string): void {
  if (!watchers.size) return;
  const path = apiPath(url);
  if (!path) return;
  for (const watcher of watchers) {
    if (!watcher.methods.includes(method) || !watcher.path.test(path)) continue;
    try {
      watcher.seen(method, path);
    } catch (err) {
      warn("a request watcher failed", err);
    }
  }
}

function install(): void {
  if (installed) return;
  installed = true;
  patch(XMLHttpRequest.prototype, "open", {
    before(xhr: XMLHttpRequest, args) {
      opened.set(xhr, { method: String(args[0]).toUpperCase(), url: String(args[1]) });
    },
  });
  patch(XMLHttpRequest.prototype, "send", {
    before(xhr: XMLHttpRequest, args) {
      const request = opened.get(xhr);
      if (!request) return;
      notice(request.method, request.url);
      if (args[0] != null) args[0] = rewriteBody(request.method, request.url, args[0]);
    },
  });
  patch(window, "fetch", {
    before(_self, args) {
      const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      notice(method, url);
      if (!init || init.body == null) return;
      const body = rewriteBody(method, url, init.body);
      if (body !== init.body) args[1] = { ...init, body: body as BodyInit };
    },
  });
}

/**
 * Rewrites the body of matching API requests. `path` is matched against the
 * path after /api/v<n>. Returns a function that removes the rule.
 */
export function onApiRequest(methods: readonly string[], path: RegExp, rewrite: (request: ApiRequest) => void): () => void {
  install();
  const rule: Rule = { methods, path, rewrite };
  rules.add(rule);
  return () => rules.delete(rule);
}

/** Calls `seen` for each matching API request as it's sent. Returns a function that stops it. */
export function onApiCall(methods: readonly string[], path: RegExp, seen: (method: string, path: string) => void): () => void {
  install();
  const watcher = { methods, path, seen };
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** Sending or editing a message: POST /channels/:id/messages and PATCH /channels/:id/messages/:id. */
export const MESSAGE_PATH = /^\/channels\/\d+\/messages(?:\/\d+)?$/;
