/**
 * Plugins that tell you things: a desktop toast when a keyword or a person
 * you follow shows up, when someone removes you, and a spoken narrator for
 * your voice channel. They all listen to Discord's own actions (see
 * api/flux.ts), so they see exactly what your client sees and nothing more.
 */
import { dispatch } from "../api/flux";
import { menu } from "../api/menus";
import { desktopNotify } from "../api/notify";
import { currentChannelId, displayName, myId, navigate, stores } from "../discord";
import { definePlugin, type Plugin } from "./types";

const SELF_ACTION_MS = 30_000;

/** "#general" for a server channel, "a DM" or the group's name otherwise. */
function placeName(channelId: string): string {
  const channel = stores.channels?.getChannel?.(channelId);
  if (!channel) return "a channel";
  if (channel.guild_id) {
    const guild = stores.guilds?.getGuild?.(channel.guild_id);
    return `#${channel.name}${guild ? ` · ${guild.name}` : ""}`;
  }
  return channel.type === 3 ? channel.name || "a group DM" : "a DM";
}

function snippet(content: string, max = 180): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text || "(attachment)";
}

/** True when you're already looking at this channel, so a toast would be noise. */
function watching(channelId: string): boolean {
  return document.hasFocus() && currentChannelId() === channelId;
}

function openMessage(message: any, guildId?: string | null): void {
  navigate(`/channels/${guildId ?? "@me"}/${message.channel_id}/${message.id}`);
}

const relationshipNotifier = definePlugin({
  id: "relationshipNotifier",
  name: "Removal Alerts",
  description: "A desktop alert when a friend removes you, or you're removed from a server or group DM.",
  category: "Notifications",
  impact: "light",
  impactReason: "Only reacts to those rare events",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    // Things you removed yourself, so they don't alert.
    const self = new Map<string, number>();
    const markSelf = (_method: string, path: string) => {
      const id = /(\d+)$/.exec(path)?.[1];
      if (id) self.set(id, Date.now());
    };
    const bySelf = (id: string) => {
      const at = self.get(id);
      return at !== undefined && Date.now() - at < SELF_ACTION_MS;
    };
    ctx.onApiCall(["DELETE"], /^\/users\/@me\/relationships\/\d+$/, markSelf);
    ctx.onApiCall(["DELETE"], /^\/users\/@me\/guilds\/\d+$/, markSelf);
    ctx.onApiCall(["DELETE"], /^\/channels\/\d+$/, markSelf);
    ctx.onApiCall(["DELETE"], /^\/channels\/\d+\/recipients\/@me$/, (method, path) => markSelf(method, path.replace(/\/recipients\/@me$/, "")));
    // Before Discord's stores forget the names.
    ctx.intercept((action) => {
      if (action.type === "RELATIONSHIP_REMOVE") {
        const id = action.relationship?.id;
        const FRIEND = 1;
        if (id && !bySelf(id) && stores.relationships?.getRelationshipType?.(id) === FRIEND) {
          desktopNotify("A friend removed you", `${displayName(id)} is no longer on your friends list.`);
        }
      } else if (action.type === "GUILD_DELETE") {
        const id = action.guild?.id;
        if (id && !action.guild.unavailable && !bySelf(id)) {
          const name = stores.guilds?.getGuild?.(id)?.name ?? "a server";
          desktopNotify("Removed from a server", `You're no longer in ${name}. You may have been kicked or banned, or it was deleted.`);
        }
      } else if (action.type === "CHANNEL_DELETE") {
        const channel = action.channel;
        const GROUP_DM = 3;
        if (channel?.type === GROUP_DM && !bySelf(channel.id)) {
          desktopNotify("Removed from a group", `You're no longer in ${channel.name || "a group DM"}.`);
        }
      }
    });
  },
});

/** Each line is a word or phrase, or a /regex/. */
function matcher(lines: readonly string[]): (text: string) => boolean {
  const tests = lines.flatMap((line) => {
    const regex = /^\/(.+)\/([imsuy]*)$/.exec(line);
    if (regex) {
      try {
        const re = new RegExp(regex[1], regex[2].includes("i") ? regex[2] : regex[2] + "i");
        return [(text: string) => re.test(text)];
      } catch {
        return [];
      }
    }
    const needle = line.toLowerCase();
    return needle ? [(text: string) => text.toLowerCase().includes(needle)] : [];
  });
  return (text) => tests.some((test) => test(text));
}

const keywordNotify = definePlugin({
  id: "keywordNotify",
  name: "Keyword Alerts",
  description: "A desktop alert whenever a message you can see mentions one of your keywords.",
  category: "Notifications",
  impact: "light",
  impactReason: "Checks each new message's text",
  needsReload: false,
  enabledByDefault: false,
  options: {
    keywords: { type: "list", label: "Keywords", description: "Words or phrases, one per line. /regex/ works too.", default: [] },
    ignoreBots: { type: "boolean", label: "Ignore bots", default: true },
  },
  start(ctx) {
    const { keywords, ignoreBots } = ctx.options;
    if (!keywords.length) return;
    const matches = matcher(keywords);
    ctx.onAction("MESSAGE_CREATE", ({ message, guildId, optimistic }) => {
      if (optimistic || !message?.content || message.author?.id === myId()) return;
      if (ignoreBots && message.author?.bot) return;
      if (watching(message.channel_id) || !matches(message.content)) return;
      desktopNotify(`${displayName(message.author.id, guildId)} in ${placeName(message.channel_id)}`, snippet(message.content), () =>
        openMessage(message, guildId),
      );
    });
  },
});

const watchUsers = definePlugin({
  id: "watchUsers",
  name: "Message Alerts",
  description: "Pick people (right-click them) and get a desktop alert whenever they post somewhere you can see.",
  category: "Notifications",
  impact: "light",
  impactReason: "Checks each new message's author",
  needsReload: false,
  enabledByDefault: false,
  options: {
    users: { type: "list", label: "People", description: "User IDs, one per line. Right-click someone to add or remove them.", default: [] },
  },
  start(ctx) {
    const users = new Set(ctx.options.users);
    ctx.menu("user-context", (items, { user }) => {
      if (!user || user.id === myId()) return;
      const on = users.has(user.id);
      items.push(
        menu.checkbox({
          id: "watch-user",
          label: "Alert me when they post",
          checked: on,
          action: () => ctx.setOption("users", on ? [...users].filter((id) => id !== user.id) : [...users, user.id]),
        }),
      );
    });
    if (!users.size) return;
    ctx.onAction("MESSAGE_CREATE", ({ message, guildId, optimistic }) => {
      if (optimistic || !message || !users.has(message.author?.id) || watching(message.channel_id)) return;
      desktopNotify(`${displayName(message.author.id, guildId)} in ${placeName(message.channel_id)}`, snippet(message.content ?? ""), () =>
        openMessage(message, guildId),
      );
    });
  },
});

const narrator = definePlugin({
  id: "vcNarrator",
  name: "Voice Narrator",
  description: "A voice tells you who joins and leaves your voice channel, so you don't have to look.",
  category: "Voice",
  impact: "light",
  impactReason: "Only speaks when someone joins or leaves",
  needsReload: false,
  enabledByDefault: false,
  options: {
    volume: { type: "number", label: "Volume (%)", default: 70, min: 0, max: 100 },
    rate: { type: "number", label: "Speed", description: "1 is normal.", default: 1.1, min: 0.5, max: 2, step: 0.1 },
    voice: { type: "string", label: "Voice", description: "Part of a Windows voice's name, like Zira or Aria. Empty uses the default.", default: "" },
    mutes: { type: "boolean", label: "Also announce mutes and deafens", default: false },
  },
  start(ctx) {
    const { volume, rate, voice, mutes } = ctx.options;
    const say = (text: string) => {
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = volume / 100;
      utterance.rate = rate;
      if (voice) {
        const found = speechSynthesis.getVoices().find((v) => v.name.toLowerCase().includes(voice.toLowerCase()));
        if (found) utterance.voice = found;
      }
      speechSynthesis.speak(utterance);
    };
    // Read before Discord's stores update, to know where everyone was.
    ctx.intercept((action) => {
      if (action.type !== "VOICE_STATE_UPDATES" || !Array.isArray(action.voiceStates)) return;
      const me = myId();
      const voiceStates = stores.voiceStates;
      const mine = me ? voiceStates?.getVoiceStateForUser?.(me)?.channelId : null;
      if (!mine) return;
      for (const state of action.voiceStates) {
        if (!state?.userId || state.userId === me) continue;
        const before = voiceStates?.getVoiceStateForUser?.(state.userId);
        const was = before?.channelId ?? null;
        const now = state.channelId ?? null;
        const name = displayName(state.userId, state.guildId);
        if (was !== mine && now === mine) say(`${name} joined`);
        else if (was === mine && now !== mine) say(`${name} left`);
        else if (mutes && was === mine && now === mine && before) {
          if (!before.selfDeaf && state.selfDeaf) say(`${name} deafened`);
          else if (before.selfDeaf && !state.selfDeaf) say(`${name} undeafened`);
          else if (!before.selfMute && state.selfMute) say(`${name} muted`);
          else if (before.selfMute && !state.selfMute) say(`${name} unmuted`);
        }
      }
    });
    ctx.onStop(() => window.speechSynthesis?.cancel());
  },
});

const streamerMode = definePlugin({
  id: "streamerModeOnStream",
  name: "Streamer Mode When Sharing",
  description: "Turns on Discord's Streamer Mode while you share your screen, and back off when you stop.",
  category: "Privacy",
  impact: "light",
  impactReason: "Only reacts to starting and stopping a stream",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    let turnedOn = false;
    const set = (enabled: boolean) => void dispatch({ type: "STREAMER_MODE_UPDATE", key: "enabled", value: enabled }).catch(() => {});
    ctx.onAction("STREAM_START", () => {
      if (stores.streamerMode?.enabled) return;
      turnedOn = true;
      set(true);
    });
    const stopped = ({ streamKey }: { streamKey?: string; [key: string]: unknown }) => {
      const me = myId();
      if (!turnedOn || (streamKey && me && !streamKey.endsWith(`:${me}`))) return;
      turnedOn = false;
      set(false);
    };
    ctx.onAction("STREAM_STOP", stopped);
    ctx.onAction("STREAM_CLOSE", stopped);
  },
});

const blockKeywords = definePlugin({
  id: "blockKeywords",
  name: "Block Keywords",
  description: "Messages containing words you choose never show up, as if the sender were blocked for that message.",
  category: "Chat",
  impact: "light",
  impactReason: "Checks each new message's text",
  needsReload: false,
  enabledByDefault: false,
  options: {
    keywords: { type: "list", label: "Words", description: "Words or phrases, one per line. /regex/ works too.", default: [] },
  },
  start(ctx) {
    if (!ctx.options.keywords.length) return;
    const matches = matcher(ctx.options.keywords);
    const hidden = (message: any) => !!message?.content && message.author?.id !== myId() && matches(message.content);
    // Dropped before Discord's stores see it, so it never shows or counts as unread.
    ctx.intercept((action) => {
      if (action.type === "MESSAGE_CREATE") return hidden(action.message);
      if (action.type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(action.messages)) action.messages = action.messages.filter((m: any) => !hidden(m));
    });
  },
});

export const notificationPlugins: readonly Plugin<any>[] = [relationshipNotifier, keywordNotify, watchUsers, narrator, streamerMode, blockKeywords];
