import { messageActions, messageLink, myId, navigate, pinActions, stores } from "../discord";
import { deleteMessageAuthorized, messageAllowed, moderationEnabled } from "../plugins/messageModeration";
import { confirmAction, copyText, promptText } from "./dialog";
import { miniMenu, type MiniAction } from "./miniMenu";
import { photoAttachment, showPhotoMetadata } from "./photoMetadata";
import { showProfile } from "./profile";
import { isDeletedMessage } from "./deletedMessages";
import { personalBuild } from "../personalBuild";
import { editMessageLocally,hideMessageLocally,localEditAvailable } from "../plugins/localMessageEdit";

export function mayPin(channel: any, can: (permission: bigint, channel: any) => boolean): boolean {
  return !!channel && ([1, 3].includes(channel.type) || !!channel.guild_id && can(1n << 51n, channel));
}
export function messageMenu(event: MouseEvent, source: any, reply: (message: any) => void, fail: (error: unknown) => void): void {
  const latest = () => stores.messages?.getMessage?.(source.channel_id, source.id) ?? source;
  const channel = stores.channels?.getChannel?.(source.channel_id);
  const can = (permission: bigint, c: any) => stores.permissions?.can?.(permission, c) === true;
  const deleted = () => isDeletedMessage(source) || isDeletedMessage(latest());
  const policy = () => ({ actor: myId(), author: latest().author?.id, enabled: moderationEnabled(), guild: !!channel?.guild_id, manageMessages: can(1n << 13n, channel) });
  const actions: MiniAction[] = [
    ...(personalBuild?[{label:"Edit locally · personal",disabled:deleted()||!localEditAvailable(latest()),run:()=>editMessageLocally(latest())}]:[]),
    ...(personalBuild?[{label:"Delete from this session",disabled:!localEditAvailable(latest()),run:()=>hideMessageLocally(latest())}]:[]),
    { label: "Reply", disabled: deleted(), run: () => { if (deleted()) throw new Error("Deleted messages cannot be replied to."); reply(latest()); } },
    { label: source.pinned ? "Unpin message" : "Pin message", disabled: deleted() || !mayPin(channel, can), run: async () => {
      if (deleted()) throw new Error("Deleted messages cannot be pinned.");
      if (!mayPin(channel, can)) throw new Error("Pin Messages permission is required in this channel.");
      const message = latest(), method = message.pinned ? "unpinMessage" : "pinMessage", pins = pinActions();
      if (typeof pins?.[method] !== "function") throw new Error("Discord's pin action is unavailable. Open the channel in Discord and retry.");
      const result = await pins[method](channel, message.id);
      if (result?.ok === false || result?.status >= 400) throw new Error("Discord rejected this pin action.");
    } },
    { label: "Copy text", disabled: !source.content, run: () => copyText(latest().content ?? "") },
    { label: "Copy message link", run: () => copyText(messageLink(channel?.guild_id, source.channel_id, source.id)) },
    { label: "Copy message ID", run: () => copyText(source.id) },
    { label: "Open message in Discord", run: () => navigate(`/channels/${channel?.guild_id ?? "@me"}/${source.channel_id}/${source.id}`) },
    { label: "Open profile report", disabled: !source.author?.id, run: () => showProfile(source.author.id, channel?.guild_id) },
    { label: "Edit message", disabled: deleted() || source.author?.id !== myId(), run: async () => {
      if (deleted()) throw new Error("Deleted messages cannot be edited.");
      if (latest().author?.id !== myId()) throw new Error("Only the author can edit this message on Discord.");
      const content = await promptText({ title: "Edit message on Discord", value: latest().content ?? "", multiline: true, confirm: "Save edit" });
      if (content === null) return;
      if (latest().author?.id !== myId()) throw new Error("The signed-in account changed. Reopen this conversation.");
      if (!content.trim() || content.length > 2000) throw new Error("Enter between 1 and 2,000 characters.");
      const actions = messageActions(); if (typeof actions?.editMessage !== "function") throw new Error("Discord's editor is unavailable.");
      const result = await actions.editMessage(source.channel_id, source.id, { content });
      if (result?.ok === false || result?.status >= 400) throw new Error("Discord rejected this edit.");
    } },
    { label: "Delete message", danger: true, disabled: deleted() || !messageAllowed("delete", policy()), run: async () => {
      if (deleted()) throw new Error("This message is already deleted.");
      if (await confirmAction("Delete message on Discord?", "This removes it for everyone. Discord checks channel permissions.", "Delete message", true)) await deleteMessageAuthorized(latest());
    } },
  ];
  for (const attachment of source.attachments ?? []) if (photoAttachment(attachment)) actions.push({ label: `Photo metadata · ${attachment.filename ?? attachment.fileName ?? "image"}`, run: () => showPhotoMetadata(attachment) });
  miniMenu(event, actions, fail);
}
