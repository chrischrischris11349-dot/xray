/**
 * Rewrites messages Discord's page sends to its gateway (the WebSocket that
 * carries presence, voice state and the login handshake). Each rule names an
 * opcode and changes that message's `d` payload in place. Discord sends
 * plain JSON text on this socket, so a cheap text check skips everything
 * else before anything is parsed.
 *
 * Fake Deafen keeps its own hook (it also needs to resend), but works the
 * same way.
 */
import { warn } from "../env";
import { patch } from "../patcher";

type Rewrite = (d: any) => void;

const rules = new Map<number, Set<Rewrite>>();
let installed = false;

function isGateway(ws: WebSocket): boolean {
  try {
    const host = new URL(ws.url).hostname;
    return host.startsWith("gateway") && host.endsWith(".discord.gg");
  } catch {
    return false;
  }
}

function install(): void {
  if (installed) return;
  installed = true;
  patch(WebSocket.prototype, "send", {
    before(ws: WebSocket, args) {
      const data = args[0];
      if (typeof data !== "string" || !rules.size || !isGateway(ws)) return;
      const op = /^\{"op":(\d+)/.exec(data)?.[1];
      const list = op === undefined ? undefined : rules.get(Number(op));
      if (!list?.size) return;
      let message: { op: number; d: any };
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      for (const rewrite of list) {
        try {
          rewrite(message.d);
        } catch (err) {
          warn(`a gateway op ${op} rewrite failed`, err);
        }
      }
      args[0] = JSON.stringify(message);
    },
  });
}

/** Changes outgoing gateway messages with this opcode. Returns a function that removes the rule. */
export function onGatewaySend(op: number, rewrite: Rewrite): () => void {
  install();
  let list = rules.get(op);
  if (!list) rules.set(op, (list = new Set()));
  list.add(rewrite);
  return () => list!.delete(rewrite);
}

export const GatewayOp = { IDENTIFY: 2, PRESENCE_UPDATE: 3, VOICE_STATE_UPDATE: 4 } as const;
