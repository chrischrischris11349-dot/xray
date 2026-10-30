/**
 * The one shadow root all of xray's UI lives in (the panel, the quick-reply
 * bubble, the search palette), and the keyboard router they share. The root
 * is closed, so Discord's CSS can't reach in and Discord's scripts can't
 * poke at it.
 *
 * Keyboard: Discord moves focus to its message box when you type anywhere,
 * so keys typed into xray's UI must never reach Discord's listeners. The
 * router sits on `window` in the capture phase, installed before Discord's
 * scripts run, so it sees every key first. Handlers registered here can
 * claim a key, and any key aimed at xray's UI stops at the router. Typing
 * still works because the browser's default action isn't cancelled.
 */
import { css } from "./styles";
import { installClipboard } from "./clipboard";
import {installLinkSafetySurface} from './linkSafety';

type KeyHandler = (event: KeyboardEvent) => boolean;

let root: ShadowRoot | undefined;
let host: HTMLElement | undefined;
const keyHandlers: KeyHandler[] = [];
const keyUpHandlers: KeyHandler[] = [];

/** Creates the root on first use. Call it only after the document exists. */
export function uiRoot(): ShadowRoot {
  if (root) return root;
  host = document.createElement("xray-root");
  root = host.attachShadow({ mode: "closed" });
  installClipboard(root);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];
  document.documentElement.append(host);
  installLinkSafetySurface(root);
  if((window as any).__xrayTorMode){const badge=document.createElement('span');badge.className='tor-mode-badge';badge.textContent='Tor · chat only';badge.title='Strict Tor routing is enabled. Voice, video, screenshare and native update downloads are blocked. Links open in Tor Browser. Signing in still identifies your Discord account.';root.append(badge);}
  return root;
}

/** True when the event started inside xray's UI. */
export function fromXray(event: Event): boolean {
  return !!host && event.composedPath().includes(host);
}

/**
 * Registers a key handler. Return true to claim the key: Discord won't see it
 * and its default is cancelled. Returns a function that removes the handler.
 */
export function onKey(handler: KeyHandler, first = false): () => void {
  if(first)keyHandlers.unshift(handler);else keyHandlers.push(handler);
  return () => remove(keyHandlers, handler);
}

/** Like `onKey`, for key releases. */
export function onKeyUp(handler: KeyHandler): () => void {
  keyUpHandlers.push(handler);
  return () => remove(keyUpHandlers, handler);
}

function remove(list: KeyHandler[], handler: KeyHandler): void {
  const i = list.indexOf(handler);
  if (i !== -1) list.splice(i, 1);
}

export function installKeyRouter(): void {
  window.addEventListener(
    "keydown",
    (event) => {
      for (const handler of keyHandlers.slice()) {
        if (handler(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      if (fromXray(event)) event.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (event) => {
      for (const handler of keyUpHandlers.slice()) {
        if (handler(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      if (fromXray(event)) event.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener("keypress", (event) => {
    if (fromXray(event)) event.stopImmediatePropagation();
  }, true);
}
