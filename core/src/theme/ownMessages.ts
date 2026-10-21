/**
 * Marks your own messages with `data-xray-mine`, so the shell can draw their
 * bubbles white. Discord's DOM doesn't say who wrote a message, but every
 * message row has the id `chat-messages-<channel>-<message>`, and the author
 * comes from Discord's MessageStore.
 *
 * One MutationObserver watches for new message rows. It only looks at
 * elements that were added, so it costs nothing while the chat is still.
 */
import { stores } from "../discord";

const ROW_SELECTOR = 'li[id^="chat-messages-"]';
const ROW_ID = /^chat-messages-(\d+)-(\d+)$/;
const ATTRIBUTE = "data-xray-mine";

let observer: MutationObserver | undefined;

function mark(row: Element): void {
  const ids = ROW_ID.exec(row.id);
  if (!ids) return;
  let mine = false;
  try {
    const me = stores.users?.getCurrentUser?.()?.id;
    mine = !!me && stores.messages?.getMessage?.(ids[1], ids[2])?.author?.id === me;
  } catch {
    // stores not ready: leave the row unmarked
  }
  if (mine !== row.hasAttribute(ATTRIBUTE)) row.toggleAttribute(ATTRIBUTE, mine);
}

function scan(node: Node): void {
  if (!(node instanceof Element)) return;
  if (node.matches(ROW_SELECTOR)) mark(node);
  else if (node.firstElementChild) node.querySelectorAll(ROW_SELECTOR).forEach(mark);
}

export function startOwnMessages(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(scan);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}

export function stopOwnMessages(): void {
  observer?.disconnect();
  observer = undefined;
  document.querySelectorAll(`[${ATTRIBUTE}]`).forEach((row) => row.removeAttribute(ATTRIBUTE));
}
