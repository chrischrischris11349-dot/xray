/**
 * Small DOM helpers for plugins: stylesheets that come and go with a plugin,
 * and one shared MutationObserver that tells plugins when elements matching
 * their selectors appear. The observer only looks at added nodes, and only
 * runs while some plugin is watching.
 */
import { warn } from "../env";
import { addedElementRoots } from "./addedElements";

/** Adds CSS to Discord's page. Returns a function that removes it. */
export function addStyle(css: string): () => void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  return () => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  };
}

interface Watcher {
  selector: string;
  onAdded: (element: Element) => void;
}

const watchers = new Set<Watcher>();
let observer: MutationObserver | undefined;

function check(node: Node): void {
  if (!(node instanceof Element)) return;
  for (const watcher of watchers) {
    try {
      if (node.matches(watcher.selector)) watcher.onAdded(node);
      if (node.firstElementChild) node.querySelectorAll(watcher.selector).forEach(watcher.onAdded);
    } catch (err) {
      warn(`a watcher for ${watcher.selector} failed`, err);
    }
  }
}

function startObserver(): void {
  if (observer) return;
  const begin = () => {
    if (observer || !watchers.size) return;
    observer = new MutationObserver((records) => {
      const added: Element[] = [];
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) added.push(node);
      addedElementRoots(added).forEach(check);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Elements that arrived before <body> was ready to watch.
    check(document.body);
  };
  if (document.body) begin();
  else document.addEventListener("DOMContentLoaded", begin, { once: true });
}

/**
 * Calls `onAdded` for each element matching `selector` that's already on the
 * page, then for each one added later. Returns a function that stops watching.
 */
export function watchElements(selector: string, onAdded: (element: Element) => void): () => void {
  const watcher: Watcher = { selector, onAdded };
  watchers.add(watcher);
  // A running observer has already seen the page; a new one scans it as it starts.
  if (observer) document.body.querySelectorAll(selector).forEach(onAdded);
  else startObserver();
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}
