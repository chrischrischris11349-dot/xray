import { dispatch } from "../api/flux";
import { menu } from "../api/menus";
import { promptText, showDialog } from "../ui/dialog";
import { definePlugin } from "./types";
import { canEditLocally } from "./messageModeration";

export class LocalMessageEdits {
  private edits = new Map<string, { id: string; channel_id: string; original: string; content: string }>();
  private key(message: any): string { return `${message.channel_id}:${message.id}`; }
  get(message: any) { return this.edits.get(this.key(message)); }
  save(message: any, content: string): void {
    this.edits.set(this.key(message), { id: message.id, channel_id: message.channel_id, original: this.get(message)?.original ?? message.content ?? "", content });
  }
  apply(message: any): any {
    if (!message) return message;
    const edit = this.get(message);
    if (!edit) return message;
    if (typeof message.content === "string") edit.original = message.content;
    return { ...message, content: edit.content };
  }
  reset(message: any) {
    const edit = this.get(message);
    this.edits.delete(this.key(message));
    return edit ? { id: edit.id, channel_id: edit.channel_id, content: edit.original } : undefined;
  }
  clear() { return [...this.edits.values()].map(edit => this.reset(edit)!); }
}

export default definePlugin({
  id: "localMessageEdit",
  name: "Local Message Edit",
  description: "Edit any message’s text in your own view. Right-click a message to edit or reset it. Edits last for this session.",
  category: "Chat",
  impact: "light",
  impactReason: "Rewrites only locally edited messages when they load or update",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    const edits = new LocalMessageEdits();
    let active = true;
    const update = (message: any) => dispatch({ type: "MESSAGE_UPDATE", message, xrayLocalEdit: true });
    ctx.intercept(action => {
      if (action.xrayLocalEdit) return;
      if (action.type === "MESSAGE_CREATE" || action.type === "MESSAGE_UPDATE") action.message = edits.apply(action.message);
      if (action.type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(action.messages)) action.messages = action.messages.map(message => edits.apply(message));
    });
    ctx.menu("message", (items, { message }) => {
      if (!message?.id || !message.channel_id) return;
      items.push(menu.group(menu.item({ id: "edit-locally", label: "Edit Locally", disabled: !canEditLocally(message), subtext: "Only your view changes. Other-author edits require moderator controls on.", action: () => {
        if (!canEditLocally(message)) return;
        void (async () => {
          const content = await promptText({ title: "Edit message locally · visible only to you", value: edits.get(message)?.content ?? message.content ?? "", confirm: "Save local edit", multiline: true });
          if (content === null || !active || !canEditLocally(message)) return;
          if (content.length > 4000) { showDialog({ title: "Message too long", body: "Local edits can contain up to 4,000 characters." }); return; }
          edits.save(message, content);
          await update({ id: message.id, channel_id: message.channel_id, content });
        })().catch(() => showDialog({ title: "Could not edit message", body: "Discord could not update this message. Try opening the channel again." }));
      } }), edits.get(message) ? menu.item({ id: "reset-local-edit", label: "Reset Local Edit", action: () => {
        const original = edits.reset(message);
        if (original) void update(original).catch(error => ctx.log("Could not reset local edit", error));
      } }) : null));
    });
    ctx.onStop(() => {
      active = false;
      for (const original of edits.clear()) void update(original).catch(error => ctx.log("Could not restore local edit", error));
    });
  },
});
