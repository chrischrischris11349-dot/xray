import { deletionExcerpt, ProfileHistory, type HistoryEvent, type Snapshot } from "./model";
import { customStatusSnapshot } from "./customStatus";

/** Passive, bounded cache. Excerpts are persisted only on an opted-in deletion. */
export class HistoryObserver {
  private messages = new Map<string, { userId: string; channelId: string; guildId?: string } & Pick<HistoryEvent,"messageText"|"messageFiles"|"messageImages"|"messageVideos"|"messageSentAt">>();
  constructor(readonly history: ProfileHistory, private getMessage: (channel: string, id: string) => any = () => null) {}
  clear(): void { this.messages.clear(); }
  private remember(message: any): void {
    const userId = message?.author?.id, channelId = message?.channel_id ?? message?.channelId;
    if (!this.history.get(userId)?.enabled || typeof message.id !== "string" || typeof channelId !== "string") return;
    const key = `${channelId}:${message.id}`;
    const old = this.messages.get(key);
    const excerpt = this.history.get(userId)?.categories.some(c=>c==="deletions"||c==="messages"||c==="edits") ? deletionExcerpt(message) : {};
    this.messages.delete(key); this.messages.set(key, { userId, channelId, guildId: message.guild_id ?? message.guildId ?? old?.guildId,
      messageText: excerpt.messageText ?? old?.messageText, messageFiles: excerpt.messageFiles ?? old?.messageFiles, messageImages: excerpt.messageImages ?? old?.messageImages, messageVideos: excerpt.messageVideos ?? old?.messageVideos, messageSentAt: excerpt.messageSentAt ?? old?.messageSentAt });
    if (this.messages.size > 5000) this.messages.delete(this.messages.keys().next().value!);
  }
  handle(action: any): Set<string> {
    const changed = new Set<string>();
    if (!action || action.xrayLocalEdit || action.xrayLocalDelete || action.mlDeleted) return changed;
    const observe = (id: string, patch: Snapshot) => {
      const record = this.history.get(id); if (!record?.enabled) return;
      const old = record.events.at(-1); this.history.observe(id, patch);
      if (record.events.at(-1) !== old) changed.add(id);
    };
    if (action.type === "PRESENCE_UPDATES" || action.type === "PRESENCE_UPDATE") {
      for (const presence of action.updates ?? action.presences ?? [action]) {
        const id = presence.user?.id ?? presence.userId ?? presence.user_id;
        if (["online", "offline", "idle", "dnd"].includes(presence.status)) observe(id, { presence: presence.status });
        // Offline activities are hidden; this does not prove a status was cleared.
        if (presence.status !== "offline" && presence.status !== "invisible") {
          const customStatus = customStatusSnapshot(presence.activities);
          if (customStatus !== undefined) observe(id, { customStatus });
        }
      }
    }
    if (action.type === "USER_UPDATE" || action.type === "USER_PROFILE_FETCH_SUCCESS") {
      const user = action.user ?? action.profile?.user ?? {};
      const id = user.id ?? action.userId ?? action.user_id;
      const profile = action.userProfile ?? action.user_profile ?? action.profile?.user_profile ?? {};
      const patch: Snapshot = {};
      for (const field of ["username", "avatar", "banner"] as const) if (user[field] === null || typeof user[field] === "string") patch[field] = user[field];
      const display = user.globalName !== undefined ? user.globalName : user.global_name;
      if (display === null || typeof display === "string") patch.displayName = display;
      if (profile.bio === null || typeof profile.bio === "string") patch.bio = profile.bio;
      observe(id, patch);
    }
    if (action.type === "GUILD_MEMBER_ADD" || action.type === "GUILD_MEMBER_REMOVE") {
      const member = action.member ?? action;
      const id = member.user?.id ?? member.userId ?? action.userId ?? action.user?.id;
      const guildId = action.guildId ?? action.guild_id ?? member.guildId;
      if (typeof guildId === "string") {
        const kind = action.type === "GUILD_MEMBER_ADD" ? "memberAdded" : "memberRemoved";
        const after = member.joined_at ?? member.joinedAt;
        if (this.history.add(id, "membership", { id: `${kind}:${guildId}:${action.eventId ?? Date.now()}`, kind, guildId, after: typeof after === "string" ? after : undefined })) changed.add(id);
      }
    }
    if (action.type === "MESSAGE_CREATE" || action.type === "MESSAGE_UPDATE") {
      const message = action.message;
      if (!message) return changed;
      const channelId = message.channel_id ?? message.channelId ?? action.channelId ?? action.channel_id;
      const existing = this.getMessage(channelId, message.id);
      const previous = this.messages.get(`${channelId}:${message.id}`);
      this.remember({ ...existing, ...message, channel_id:channelId,
        author: message.author ?? existing?.author ?? (previous ? {id:previous.userId} : undefined),
        content: typeof message.content === "string" ? message.content : previous?.messageText ?? existing?.content });
      const metadata = this.messages.get(`${channelId}:${message.id}`);
      if (action.type === "MESSAGE_CREATE" && metadata && this.history.add(metadata.userId,"messages",{id:`message:${channelId}:${message.id}`,kind:"messageObserved",messageId:message.id,channelId,guildId:metadata.guildId,...deletionExcerpt(message)})) changed.add(metadata.userId);
      const edited = message.edited_timestamp ?? message.editedTimestamp;
      if (action.type === "MESSAGE_UPDATE" && metadata && edited != null && this.history.add(metadata.userId, "edits", { id: `edit:${channelId}:${message.id}:${String(edited)}`, kind: "messageEdited", messageId: message.id, channelId, guildId: metadata.guildId, ...(this.history.get(metadata.userId)?.categories.includes("messages") ? {messageText:metadata.messageText,messageBefore:previous?.messageText ?? (typeof existing?.content==="string"?existing.content:undefined),messageSentAt:metadata.messageSentAt,messageFiles:metadata.messageFiles,messageImages:metadata.messageImages,messageVideos:metadata.messageVideos} : {}) })) changed.add(metadata.userId);
    }
    if (action.type === "MESSAGE_DELETE" || action.type === "MESSAGE_DELETE_BULK") {
      const channelId = action.channelId ?? action.channel_id;
      for (const id of action.type === "MESSAGE_DELETE_BULK" ? action.ids ?? [] : [action.id]) {
        if (typeof channelId !== "string" || typeof id !== "string") continue;
        const key = `${channelId}:${id}`;
        if (!this.messages.has(key)) this.remember(this.getMessage(channelId, id));
        const metadata = this.messages.get(key);
        if (metadata && this.history.add(metadata.userId, "deletions", { id: `delete:${key}`, kind: "messageDeleted", messageId: id, channelId, guildId: metadata.guildId ?? action.guildId ?? action.guild_id, messageText: metadata.messageText, messageSentAt:metadata.messageSentAt, messageFiles: metadata.messageFiles, messageImages: metadata.messageImages,messageVideos:metadata.messageVideos })) changed.add(metadata.userId);
        this.messages.delete(key);
      }
    }
    return changed;
  }
}
