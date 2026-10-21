# Plugins

xray rebuilds the plugin catalogs of Vencord, Equicord and Nightcord as its own code (their code is GPL and xray's source is private, so nothing is copied). This file tracks the merged catalog: 483 names after removing duplicates.

- **Built:** 115 catalog plugins, covered by xray plugins (some xray plugins cover several).
- **Planned:** 317.
- **Left out on purpose:** 30 (spam, account tokens, acting on other people, tracking people, faking conversations, cheating).
- **Not applicable:** 21 (the other mods' own internals and duplicates).

## Built

| Catalog plugin | In xray |
|---|---|
| Abbreviation | Abbreviations |
| AlwaysTrust | Always Trust Links |
| AnonymiseFileNames | Anonymous Uploads |
| BlockKeywords | Block Keywords |
| BlurNSFW | Blur NSFW |
| CallTimer | Call Timer |
| CharacterCounter | Character Counter |
| ClearURLs | Clean Links |
| ClientTheme | Accent Color |
| CollapsibleUI | Focus Mode (partly) |
| CommandPalette | Search (Ctrl+K) |
| ConsoleJanitor | Quiet Console |
| ContentWarning | Content Warnings |
| CopyEmojiMarkdown | Copy Emoji |
| CopyFileContents | Copy File Contents |
| CopyProfileId | Copy ID |
| CopyUserMention | Copy User Links |
| CopyUserURLs | Copy User Links |
| CustomIdle | Idle Timer |
| CustomUserColors | Name Colors (partly) |
| Declutter | Declutter |
| DecodeBase64 | Decode Base64 |
| DownloadAllAttachments | Open All Attachments |
| EventLogs | Message Logger (partly) |
| ExportMessages | Save Message |
| FakeVoice | Fake Deafen |
| FindReply | Find Replies |
| FixImagesQuality | Sharper Images |
| FontLoader | Custom Font (installed fonts) |
| FrequentQuickSwitcher | Search (Ctrl+K) |
| FriendshipRanks | Friends Since (partly) |
| GoogleThat | Search the Web |
| HideChatButtons | Declutter (partly) |
| HideMessages | Hide Messages |
| HideServers | Hide Servers |
| ImageFilename | Image File Names |
| ImageZoom | Image Zoom |
| Ingtoninator | Ingtoninator |
| IrcColors | Name Colors |
| JumpTo | Jump to First Message |
| KeepCurrentChannel | Reopen Last Channel |
| KeyboardSounds | Keyboard Sounds |
| KeywordNotify | Keyword Alerts |
| MarkdownTables | Markdown Tables |
| MediaPlaybackSpeed | Playback Speed |
| MemberCount | Member Count |
| MessageClickActions | Double-Click Messages |
| MessageColors | Color Swatches |
| MessageLogger | Message Logger |
| MessageNotifier | Message Alerts |
| MessagePeek | Message Peek |
| MessageTranslate | Translate (partly) |
| MoreUserTags | Owner & Webhook Tags |
| NewGuildSettings | Quiet New Servers |
| NoBlockedMessages | No Blocked Messages |
| NoCaps | No Caps Lock |
| NoF1 | No F1 Help |
| NoNitroUpsell | Declutter (partly) |
| NoPendingCount | No Pending Counts |
| NoReplyMention | No Reply Ping |
| NoTrack | Block Tracking |
| NoTypingAnimation | Still Typing Dots |
| NormalizeMessageLinks | Normal Message Links |
| NotificationVolume | Notification Volume |
| PermissionsViewer | Permissions Viewer |
| PictureInPicture | Picture in Picture |
| PinIcon | Pin Marks |
| PlatformIndicators | Device Indicators |
| PlatformSpoofer | Device Badge |
| PolishWording | Auto Capitalize (partly) |
| QuickMessages | Saved Replies |
| QuickReply | Reply Keys |
| QuickThemeSwitcher | Theme Key |
| Quoter | Quote Image |
| ReadAllNotificationsButton | Read All |
| RecentDMSwitcher | Recent DM Switcher |
| RelationshipNotifier | Removal Alerts |
| RepeatMessages | Send Again |
| ReplyTimestamp | Reply Timestamps |
| RevealAllSpoilers | Reveal Spoilers |
| ReverseImageSearch | Reverse Image Search |
| ScheduledMessages | Scheduled Messages |
| SendTimestamps | Timestamps |
| ServerInfo | Server Info |
| ServerListIndicators | Friends Online |
| ServerSearch | Search (Ctrl+K) |
| ShowMeYourName | Show Usernames |
| ShowRolesInChat | Roles in Chat |
| Signature | Signature |
| SilenceUsers | Silence People |
| SilentDelete | Silent Edit & Delete |
| SilentEdit | Silent Edit & Delete |
| SilentMessageToggle | Silent Messages |
| SilentTyping | Silent Typing |
| SplitLargeMessages | Split Long Messages |
| StickerBlocker | Hide Stickers |
| StreamerModeOn | Streamer Mode When Sharing |
| StreamerModeOnStream | Streamer Mode When Sharing |
| TalkInReverse | Talk in Reverse |
| TextReplace | Text Replace |
| Timezones | Timezones |
| ToneIndicators | Tone Tags |
| Translate | Translate |
| TypingIndicator | Typing in Channel List |
| UncompressedImages | Sharper Images |
| Unindent | Unindent Code |
| UnitConverter | Unit Converter |
| UnsuppressEmbeds | Show Link Previews |
| UserVoiceShow | In Voice Badge |
| VcNarrator | Voice Narrator |
| ViewIcons | View Banners + Copy User Links |
| ViewRaw | View Raw |
| VoiceDownload | Save Voice Messages |
| WebContextMenus | Copy & Open |
| WriteUpperCase | Auto Capitalize |

## Left out on purpose

| Catalog plugin | Why |
|---|---|
| Avatar history (asked for, not in a catalog) | records other people's past profiles |
| breach.vip lookup (asked for, not in a catalog) | looks up other people's leaked data |
| AntiDeleteMessage | evades moderation |
| AntiMoveDeco | evades moderation |
| AntiNickname | evades moderation |
| AtSomeone | random pings |
| AutoCallRecorder | records calls without consent |
| AutoClaim | automation racing others |
| AutoDeco | acts against other users |
| AutoMute | acts against other users |
| AutoReply | automated replies as you |
| AutoResponder | automated replies as you |
| DMBomb | spam |
| FakeDM | fakes conversations |
| FakeFriends | fakes friends |
| FakeSwitcher | impersonation |
| FloodPanel | spam |
| FollowMe | moves other users |
| GhostClient | extra accounts |
| GhostInstaller | extra accounts |
| LastSeen | tracks other users |
| LoginWithQR | account login |
| MassDM | spam |
| MultiInstance | extra accounts |
| MutualScanner | scrapes servers |
| PrevNames | tracks other users |
| SaveThem | tracks other users |
| Surveillance | tracks other users |
| TokenImporter | account tokens |
| TriviaAI | game cheating |
| UniversalMention | pings people who can't see the channel |
| WordBomb | game cheating |

## Planned

Roughly in the order they'll be built: most-used first.

- AlwaysAnimate (vencord)
- AlwaysExpandRoles (vencord)
- AutoDNDWhilePlaying (vencord)
- BetterGifAltText (vencord)
- BetterGifPicker (vencord)
- BetterRoleDot (vencord)
- BetterUploadButton (vencord)
- ColorSighted (vencord)
- ConsoleShortcuts (vencord)
- CrashHandler (vencord)
- CustomCommands (vencord)
- DisableCallIdle (vencord)
- DontRoundMyTimestamps (vencord)
- F8Break (vencord)
- FixCodeblockGap (vencord)
- FavoriteEmojiFirst (vencord)
- ForceOwnerCrown (vencord)
- FixYoutubeEmbeds (vencord)
- FriendInvites (vencord)
- GifPaste (vencord)
- iLoveSpam (vencord)
- ImageLink (vencord)
- ImplicitRelationships (vencord)
- LoadingQuotes (vencord)
- MoreQuickReactions (vencord)
- NoDevtoolsWarning (vencord)
- NoMaskedUrlPaste (vencord)
- NoMosaic (vencord)
- NoOnboardingDelay (vencord)
- NoProfileThemes (vencord)
- NoServerEmojis (vencord)
- NoSystemBadge (vencord)
- NoUnblockToJump (vencord)
- OnePingPerDM (vencord)
- oneko (vencord)
- OpenInApp (vencord)
- PermissionFreeWill (vencord)
- petpet (vencord)
- PlainFolderIcon (vencord)
- ReactErrorDecoder (vencord)
- SecretRingToneEnabler (vencord)
- ShowAllMessageButtons (vencord)
- ShowHiddenThings (vencord)
- SpotifyCrack (vencord)
- SpotifyShareCommands (vencord)
- StickerPaste (vencord)
- SuperReactionTweaks (vencord)
- ThemeAttributes (vencord)
- UnlockedAvatarZoom (vencord)
- UserMessagesPronouns (vencord)
- ValidReply (vencord)
- VoiceChatDoubleClick (vencord)
- VolumeBooster (vencord)
- WebKeybinds (vencord)
- WebScreenShareFixes (vencord)
- YoutubeAdblock (vencord)
- AccountPanelServerProfile (vencord)
- AddAttachments (vencord)
- WebRichPresence (arRPC) (vencord)
- BetterFolders (vencord)
- BetterRoleContext (vencord)
- BetterSessions (vencord)
- BetterSettings (vencord)
- BiggerStreamPreview (vencord)
- CopyStickerLinks (vencord)
- CustomRPC (vencord)
- Dearrow (vencord)
- Decor (vencord)
- DirectFileDownload (vencord)
- Experiments (vencord)
- ExpressionCloner (vencord)
- FakeProfileThemes (vencord)
- FakeNitro (vencord)
- FixSpotifyEmbeds (vencord)
- FullSearchContext (vencord)
- FullUserInChatbox (vencord)
- GameActivityToggle (vencord)
- GifProviderSwitcher (vencord)
- GreetStickerPicker (vencord)
- HideMedia (vencord)
- IgnoreActivities (vencord)
- MentionAvatars (vencord)
- MessageLatency (vencord)
- MessageLinkEmbeds (vencord)
- MusicRichPresence (vencord)
- MutualGroupDMs (vencord)
- OverrideForumDefaults (vencord)
- PauseInvitesForever (vencord)
- PinDMs (vencord)
- PreviewMessage (vencord)
- QuickMention (vencord)
- ReplaceGoogleSearch (vencord)
- ReviewDB (vencord)
- RoleColorEverywhere (vencord)
- ShikiCodeblocks (vencord)
- ShowConnections (vencord)
- ShowHiddenChannels (vencord)
- ShowTimeoutDuration (vencord)
- SortFriendRequests (vencord)
- SpotifyControls (vencord)
- StartupTimings (vencord)
- TypingTweaks (vencord)
- USRBG (vencord)
- ValidUser (vencord)
- VoiceMessages (vencord)
- WebPWA (vencord)
- WebScreenShare (vencord)
- WhoReacted (vencord)
- XSOverlay (vencord)
- AlwaysExpandProfiles (equicord)
- Animalese (equicord)
- AutoJumpToMessage (equicord)
- AutoZipper (equicord)
- BetterCommands (equicord)
- BetterPlusReacts (equicord)
- BlockKrisp (equicord)
- BypassPinPrompt (equicord)
- CleanerChannelGroups (equicord)
- CopyStatusUrls (equicord)
- Equissant (equicord)
- InviteDefaults (equicord)
- MessageBurst (equicord)
- MiddleClickTweaks (equicord)
- MoreCommands (equicord)
- Moyai (equicord)
- NoPushToTalk (equicord)
- NoRPC (equicord)
- NoRoleHeaders (equicord)
- PartyMode (equicord)
- ReplyPingControl (equicord)
- SedEnhanced (equicord)
- ShowResourceChannels (equicord)
- StatusWhileActive (equicord)
- StopAutoUnread (equicord)
- StreamingCodecDisabler (equicord)
- Title (equicord)
- ToggleVideoBind (equicord)
- UnlimitedAccounts (equicord)
- VoiceJoinMessages (equicord)
- AdvancedPermissions (equicord)
- AltKrispSwitch (equicord)
- BannersEverywhere (equicord)
- BetterAudioPlayer (equicord)
- BetterActivities (equicord)
- BetterBanReasons (equicord)
- BetterBlockedUsers (equicord)
- BetterForwards (equicord)
- BetterImageEditor (equicord)
- BetterInvites (equicord)
- ChannelBadges (equicord)
- BypassStatus (equicord)
- ClientSideBlock (equicord)
- ClipUpload (equicord)
- ChannelTabs (equicord)
- ClipsEnhancements (equicord)
- ClickableRoles (equicord)
- CursorBuddy (equicord)
- CopyProfileColors (equicord)
- CustomFolderIcons (equicord)
- CustomSounds (equicord)
- CustomStatusTimeouts (equicord)
- CustomTimestamps (equicord)
- DisableCameras (equicord)
- DiscordDevBanner (equicord)
- Dragify (equicord)
- DragFavoriteEmotes (equicord)
- EquiTweaks (equicord)
- ElementHighlighter (equicord)
- ExitSounds (equicord)
- FastDeleteChannels (equicord)
- FileUpload (equicord)
- FavoriteAnything (equicord)
- FixFileExtensions (equicord)
- FollowVoiceUser (equicord)
- FriendCodes (equicord)
- FriendTags (equicord)
- FullVCPFP (equicord)
- Ghosted (equicord)
- GifMaker (equicord)
- GifCollections (equicord)
- GitHubRepos (equicord)
- GlobalBadges (equicord)
- GuildPickerDumper (equicord)
- HomeTyping (equicord)
- HopOn (equicord)
- Husk (equicord)
- IRememberYou (equicord)
- IdleAutoRestart (equicord)
- IconViewer (equicord)
- IgnoreCalls (equicord)
- InRole (equicord)
- InstantScreenshare (equicord)
- InvisibleChat (equicord)
- KeyboardNavigation (equicord)
- LimitlessScreenshare (equicord)
- LastActive (equicord)
- MessageFetchTimer (equicord)
- MessageLinkTooltip (equicord)
- MessageLoggerEnhanced (equicord)
- MicLoopbackTester (equicord)
- MoreStickers (equicord)
- NeverPausePreviews (equicord)
- MusicControls (equicord)
- NotificationTitle (equicord)
- OrbolayBridge (equicord)
- CancelFriendRequest (equicord)
- PingNotifications (equicord)
- ProfileSets (equicord)
- Questify (equicord)
- RandomVoice (equicord)
- ReactionTimestamps (equicord)
- RemixRevived (equicord)
- RichPresence (equicord)
- RichMagnetLinks (equicord)
- RPCEditor (equicord)
- SaveFavoriteGIFs (equicord)
- ScreenRecorder (equicord)
- SearchFix (equicord)
- SekaiStickers (equicord)
- ShowBadgesInChat (equicord)
- ShowMessageEmbeds (equicord)
- ShowSongName (equicord)
- SidebarChat (equicord)
- Snowfall (equicord)
- SongLink (equicord)
- SongSpotlight (equicord)
- StatusPresets (equicord)
- SteamStatusSync (equicord)
- Streaks (equicord)
- TidalEmbeds (equicord)
- ToastNotifications (equicord)
- UnreadCountBadge (equicord)
- UrlHighlighter (equicord)
- UserPFP (equicord)
- VoiceButtons (equicord)
- VoiceChannelLog (equicord)
- VCPanelSettings (equicord)
- VoiceChatUtilities (equicord)
- VoiceMessageTranscriber (equicord)
- VoiceMessagesInBackground (equicord)
- VoiceRejoin (equicord)
- VoiceStats (equicord)
- WhitelistedEmojis (equicord)
- WaitForSlot (equicord)
- WhosWatching (equicord)
- WigglyText (equicord)
- ZipPreview (equicord)
- CleanChannelName (equicord)
- AudioLimiter (nightcord)
- AutoAFK (nightcord)
- AutoUnmute (nightcord)
- ValidSearch (nightcord)
- AutoCorrect (nightcord)
- AutoJoin (nightcord)
- Backpack (nightcord)
- BigFileUpload (nightcord)
- BulkFriendRemove (nightcord)
- ChannelWallpaper (nightcord)
- ClearGroups (nightcord)
- ClearDMs (nightcord)
- ClientDiagnostics (nightcord)
- CloseGroup (nightcord)
- DoubleEmoji (nightcord)
- CustomStream (nightcord)
- DynamicIslande (nightcord)
- EncryptedMessage (nightcord)
- CustomProfile (nightcord)
- EnhancedScreenshare (nightcord)
- EnhancedRandomVoice (nightcord)
- ExportDM (nightcord)
- FastPFP (nightcord)
- FakePerm (nightcord)
- FastDiscord (nightcord)
- FastPing (nightcord)
- FollowUser (nightcord)
- GifConvertor (nightcord)
- HypeSquadChanger (nightcord)
- LeaveAllServers (nightcord)
- LiveWallpaper (nightcord)
- LockGroup (nightcord)
- MacOsButtons (nightcord)
- MessageCleaner (nightcord)
- SecureDNS (nightcord)
- MuteAllServers (nightcord)
- NightcordAI (nightcord)
- NoDMWhileStreaming (nightcord)
- UI Optimisations (nightcord)
- PasscodeLock (nightcord)
- PreviewHTML (nightcord)
- QuickDM (nightcord)
- ProfileDrawing (nightcord)
- PrivateBrowser (nightcord)
- PreviewWebsite (nightcord)
- QxChat (nightcord)
- RealtimeTimestamps (nightcord)
- SaveProfile (nightcord)
- SavedMessages (nightcord)
- SaveVideos (nightcord)
- SaveGroups (nightcord)
- ScreenFreeze (nightcord)
- SelfDestruct (nightcord)
- SecureBookmarks (nightcord)
- ServerCloner (nightcord)
- ServerFolderIcons (nightcord)
- SharePerms (nightcord)
- ShowID (nightcord)
- SmartPingFilters (nightcord)
- SnipeAttachments (nightcord)
- SmoothType (nightcord)
- StatusCycler (nightcord)
- StreamProof (nightcord)
- SoundCordPlayer (nightcord)
- TotpManager (nightcord)
- VoiceChannelSearch (nightcord)
- VoiceDictation (nightcord)
- VoiceIsolator (nightcord)
- youtubePlayer (nightcord)

## Not applicable

ConcatenatedComponentExtractor, ConcatenatedModules, DevCompanion, DisableDeepLinks, EquibopStreamFixes, EquicordHelper, EquicordToolbox, FixDiscordCss, ILoveSpam, NewPluginsManager, NoMiddleClickPaste, PetPet, Settings, SortFriends, SupportHelper, ThemeLibrary, Translate+, UserpluginInstaller, VencordToolbox, WebRichPresence, WebpackTarball
