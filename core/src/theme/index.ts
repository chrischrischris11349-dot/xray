/**
 * Applies xray's look to Discord. The theme's CSS sits in one constructed
 * stylesheet adopted by the document, so Discord re-rendering its own DOM
 * can never drop it. Switching it off just removes a class from <html>.
 */
import { themeEnabled } from "../settings";
import { obsidianCss } from "./obsidian";

const CLASS = "xray-obsidian";

let installed = false;
let active = false;

export function installTheme(): void {
  if (installed) return;
  installed = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(obsidianCss);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  active = themeEnabled();
  whenHtmlExists((html) => {
    syncClass(html);
    // Discord sets its own classes on <html>; if it ever replaces them wholesale, put ours back.
    new MutationObserver(() => syncClass(html)).observe(html, { attributes: true, attributeFilter: ["class"] });
  });
}

export function setThemeActive(on: boolean): void {
  active = on;
  if (document.documentElement) syncClass(document.documentElement);
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
