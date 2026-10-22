/**
 * xray plugins that Equicord also has. When Equicord runs inside xray (see
 * equicord/README.md), its version takes over: the xray one isn't listed or
 * started, so the two never double up. If you had the xray one switched on,
 * the Equicord one is switched on once, so your choices carry over.
 *
 * Only true twins are listed. Same-named but different features stay xray's
 * (xray's Declutter hides Nitro and the shop; Equicord's removes avatar
 * decorations), and so do features xray routes through its Rust side because
 * Discord's page can't reach the service itself (Translate).
 */
import { pluginState, save } from "../settings";
import type { Plugin } from "./types";

/** xray plugin id → Equicord plugin name. */
const TWINS: Record<string, string> = {
  messageLogger: "MessageLogger",
  cleanLinks: "ClearURLs",
  silentTyping: "SilentTyping",
  noReplyMention: "NoReplyMention",
  silentMessages: "SilentMessageToggle",
  messageClickActions: "MessageClickActions",
  viewRaw: "ViewRaw",
  hideMessages: "HideMessages",
  jumpToFirst: "JumpTo",
  revealSpoilers: "RevealAllSpoilers",
  messagePeek: "MessagePeek",
  unsuppressEmbeds: "UnsuppressEmbeds",
  webContextMenus: "WebContextMenus",
  copyEmojiMarkdown: "CopyEmojiMarkdown",
  unitConverter: "UnitConverter",
  decodeBase64: "DecodeBase64",
  messageColors: "MessageColors",
  pinIcon: "PinIcon",
  hideServers: "HideServers",
  markdownTables: "MarkdownTables",
  toneIndicators: "ToneIndicators",
  contentWarning: "ContentWarning",
  stickerBlocker: "StickerBlocker",
  mediaPlaybackSpeed: "MediaPlaybackSpeed",
  scheduledMessages: "ScheduledMessages",
  findReply: "FindReply",
  silenceUsers: "SilenceUsers",
  repeatMessages: "RepeatMessages",
  quoter: "Quoter",
  unreadCountBadge: "UnreadCountBadge",
  channelBadges: "ChannelBadges",
  textReplace: "TextReplace",
  signature: "Signature",
  sendTimestamps: "SendTimestamps",
  splitLongMessages: "SplitLargeMessages",
  unindent: "Unindent",
  normalizeMessageLinks: "NormalizeMessageLinks",
  reverseText: "TalkInReverse",
  ington: "Ingtoninator",
  relationshipNotifier: "RelationshipNotifier",
  keywordNotify: "KeywordNotify",
  watchUsers: "MessageNotifier",
  vcNarrator: "VcNarrator",
  streamerModeOnStream: "StreamerModeOn",
  blockKeywords: "BlockKeywords",
  blurNsfw: "BlurNSFW",
  noBlockedMessages: "NoBlockedMessages",
  imageFilename: "ImageFilename",
  pictureInPicture: "PictureInPicture",
  callTimer: "CallTimer",
  keyboardSounds: "KeyboardSounds",
  noTypingAnimation: "NoTypingAnimation",
  characterCounter: "CharacterCounter",
  noPendingCount: "NoPendingCount",
  alwaysTrust: "AlwaysTrust",
  notificationVolume: "NotificationVolume",
  customFont: "FontLoader",
  imageQuality: "FixImagesQuality",
  replyTimestamp: "ReplyTimestamp",
  typingIndicator: "TypingIndicator",
  showMeYourName: "ShowMeYourName",
  platformIndicators: "PlatformIndicators",
  userVoiceShow: "UserVoiceShow",
  ircColors: "IrcColors",
  showRolesInChat: "ShowRolesInChat",
  moreUserTags: "MoreUserTags",
  imageZoom: "ImageZoom",
  reverseImageSearch: "ReverseImageSearch",
  copyFileContents: "CopyFileContents",
  voiceDownload: "VoiceDownload",
  timezones: "Timezones",
  cancelFriendRequest: "CancelFriendRequest",
  serverInfo: "ServerInfo",
  permissionsViewer: "PermissionsViewer",
  memberCount: "MemberCount",
  readAllServers: "ReadAllNotificationsButton",
  newGuildSettings: "NewGuildSettings",
  keepCurrentChannel: "KeepCurrentChannel",
  recentDmSwitcher: "RecentDMSwitcher",
  noF1: "NoF1",
  customIdle: "CustomIdle",
  consoleJanitor: "ConsoleJanitor",
  anonymousUploads: "AnonymiseFileNames",
  // Equicord splits these into CopyUserURLs, CopyUserMention and ViewIcons; the picker's Recommended has all three.
  userLinks: "CopyUserURLs",
  // Your own userplugins built into the same bundle (equicord/userplugins.json).
  abbreviations: "Abbreviation",
  noCaps: "NoCaps",
};

/** Equicord's plugin manager and settings, when Equicord loaded before xray. */
function equicord(): { plugins: Record<string, unknown>; settings: Record<string, { enabled?: boolean }> } | undefined {
  const vencord = (window as any).Vencord;
  const plugins = vencord?.Plugins?.plugins;
  const settings = vencord?.Settings?.plugins;
  return plugins && settings ? { plugins, settings } : undefined;
}

/** The Equicord plugin that replaces this xray one, if Equicord is here and has it. */
export function equicordTwin(plugin: Plugin): string | undefined {
  const name = TWINS[plugin.id];
  return name && equicord()?.plugins[name] ? name : undefined;
}

/**
 * Switches on the Equicord twin of every xray plugin you had on, once per
 * plugin. Equicord reads its settings at startup, so this shows after a reload.
 * Returns how many it switched on.
 */
export function carryOverToEquicord(all: readonly Plugin[], wasEnabled: (plugin: Plugin) => boolean): number {
  const eq = equicord();
  if (!eq) return 0;
  let carried = 0;
  for (const plugin of all) {
    const twin = equicordTwin(plugin);
    const state = pluginState(plugin.id);
    if (!twin || state.handedToEquicord) continue;
    state.handedToEquicord = true;
    if (wasEnabled(plugin) && !eq.settings[twin]?.enabled) {
      (eq.settings[twin] ??= {}).enabled = true;
      carried++;
    }
  }
  save();
  return carried;
}
