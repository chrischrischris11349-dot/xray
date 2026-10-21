/**
 * Hooks on the messages you send and edit. Discord's chat box, quick reply
 * and xray's own UI all send through Discord's message actions
 * (`sendMessage(channelId, message, ...)`, `editMessage(channelId,
 * messageId, message)`), so xray patches those once and runs plugin hooks
 * in order.
 *
 * A hook gets the message object and may change `content` in place. A send
 * hook can also return false to stop the send (the text is already gone
 * from the chat box by then, so only do that when you've handled it), or
 * return an array of messages to send several in its place.
 */
import { warn } from "../env";
import { patch } from "../patcher";
import { waitFor, type Filter } from "../webpack";

export interface OutgoingMessage {
  content: string;
  [key: string]: any;
}

/** Return false to cancel, an array to send these messages instead, or nothing to send as is. */
export type SendHook = (channelId: string, message: OutgoingMessage) => void | false | OutgoingMessage[];
export type EditHook = (channelId: string, messageId: string, message: OutgoingMessage) => void;

const sendHooks = new Set<SendHook>();
const editHooks = new Set<EditHook>();
let installed = false;

const isMessageActions: Filter = (c) =>
  typeof c === "object" &&
  c !== null &&
  "sendMessage" in c &&
  "editMessage" in c &&
  "deleteMessage" in c &&
  String(c.sendMessage).includes("sendMessage(");

function install(): void {
  if (installed) return;
  installed = true;
  waitFor(isMessageActions, (actions) => {
    patch(actions, "sendMessage", {
      instead(self, args, original) {
        if (!sendHooks.size) return original(...args);
        const [channelId, message] = args as [string, OutgoingMessage];
        if (!message || typeof message.content !== "string") return original(...args);
        let outgoing: OutgoingMessage[] = [message];
        for (const hook of sendHooks) {
          const next: OutgoingMessage[] = [];
          for (const m of outgoing) {
            let result: ReturnType<SendHook>;
            try {
              result = hook(channelId, m);
            } catch (err) {
              warn("a send hook failed", err);
              result = undefined;
            }
            if (result === false) continue;
            next.push(...(Array.isArray(result) ? result : [m]));
          }
          outgoing = next;
        }
        if (outgoing.length === 0) return Promise.resolve();
        if (outgoing.length === 1) return original(channelId, outgoing[0], ...args.slice(2));
        // Several messages: send them one after another, in order.
        return outgoing.reduce<Promise<unknown>>(
          (previous, m) => previous.then(() => original.call(self, channelId, m, ...args.slice(2))),
          Promise.resolve(),
        );
      },
    });
    patch(actions, "editMessage", {
      before(_self, args) {
        const [channelId, messageId, message] = args as [string, string, OutgoingMessage];
        if (!message || typeof message.content !== "string") return;
        for (const hook of editHooks) {
          try {
            hook(channelId, messageId, message);
          } catch (err) {
            warn("an edit hook failed", err);
          }
        }
      },
    });
  });
}

/** Runs before each message you send. Returns a function that removes the hook. */
export function onSend(hook: SendHook): () => void {
  install();
  sendHooks.add(hook);
  return () => sendHooks.delete(hook);
}

/** Runs before each edit you save. Returns a function that removes the hook. */
export function onEdit(hook: EditHook): () => void {
  install();
  editHooks.add(hook);
  return () => editHooks.delete(hook);
}

/** Copies a message for sending again with new text (used when splitting one into several). */
export function withContent(message: OutgoingMessage, content: string): OutgoingMessage {
  // Each message needs its own nonce, or Discord treats the copies as one.
  const { nonce: _nonce, ...rest } = message;
  return { ...rest, content };
}
