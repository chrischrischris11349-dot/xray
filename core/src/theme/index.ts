/**
 * Applies xray's look to Discord. The theme's CSS (colors from obsidian.ts,
 * layout from shell.ts) sits in one constructed stylesheet adopted by the
 * document, so Discord re-rendering its own DOM can never drop it. Switching
 * it off removes a class from <html> and stops the own-message marker.
 */
import { themeEnabled } from "../settings";
import { obsidianCss } from "./obsidian";
import { startOwnMessages, stopOwnMessages } from "./ownMessages";
import { shellCss } from "./shell";

const CLASS = "xray-obsidian";

let installed = false;
let active = false;

export function installTheme(): void {
  if (installed) return;
  installed = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(obsidianCss + shellCss);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  active = themeEnabled();
  whenHtmlExists((html) => {
    syncClass(html);
    // Discord sets its own classes on <html>; if it ever replaces them wholesale, put ours back.
    new MutationObserver(() => syncClass(html)).observe(html, { attributes: true, attributeFilter: ["class"] });
  });
  // The marker needs <body>, which doesn't exist at document start.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncMarker, { once: true });
  else syncMarker();
  markLoadedWhenReady();
}

/**
 * Discord paints its own loading screen (seasonal art included) before its app
 * mounts. xray's glass would otherwise cover it, so the backdrop only takes
 * over once the app's first real layer appears, marked by `data-xray-loaded`.
 */
/** The logged-in app, or the login page. Discord's loading screen sits in a plain `app_` wrapper, so that can't count. */
const READY = '[class*="baseLayer_"], [class*="authBox_"]';

function markLoadedWhenReady(): void {
  const mark = () => document.documentElement?.setAttribute("data-xray-loaded", "");
  if (document.querySelector(READY)) return mark();
  const observer = new MutationObserver(() => {
    if (document.querySelector(READY)) {
      observer.disconnect();
      mark();
    }
  });
  const start = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}

export function setThemeActive(on: boolean): void {
  active = on;
  if (document.documentElement) syncClass(document.documentElement);
  syncMarker();
}

function syncMarker(): void {
  if (active) startOwnMessages();
  else stopOwnMessages();
}

function syncClass(html: HTMLElement): void {
  // Only touch the attribute when it's wrong, so the observer doesn't loop.
  if (html.classList.contains(CLASS) !== active) html.classList.toggle(CLASS, active);
}

/** At document start the parser hasn't created <html> yet. */
function whenHtmlExists(then: (html: HTMLElement) => void): void {
  if (document.documentElement) return then(document.documentElement);
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    then(document.documentElement);
  });
  observer.observe(document, { childList: true });
}
