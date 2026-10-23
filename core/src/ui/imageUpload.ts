import { cloudUploader, messageActions } from "../discord";
import type { ReplyTarget } from "./imageDrafts";

export async function sendMiniChatMessage(channel: string, content: string, files: readonly File[], actions = messageActions(), Uploader = files.length ? cloudUploader() : undefined, reply?: ReplyTarget): Promise<void> {
  if (typeof actions?.sendMessage !== "function") throw new Error("Discord's message sender isn't available yet. Open the chat and retry.");
  if (files.length && typeof Uploader !== "function") throw new Error("Discord's image uploader isn't available yet. Open the main chat and retry.");
  if (reply && (reply.channelId !== channel || !/^\d{14,20}$/.test(reply.id))) throw new Error("The reply belongs to a different conversation or is not a Discord message.");
  const uploads = files.map(file => new Uploader!({ file, platform: 1 }, channel));
  const result = await actions.sendMessage(channel, { content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, true, {
    ...(uploads.length ? { attachmentsToUpload: uploads } : {}),
    ...(reply ? { messageReference: { channel_id: channel, message_id: reply.id }, allowedMentions: { parse: [], replied_user: reply.mention } } : {}),
  });
  if (result?.ok === false || result?.status >= 400) throw new Error("Discord rejected this message. Your draft is saved; check upload limits and channel access.");
}
