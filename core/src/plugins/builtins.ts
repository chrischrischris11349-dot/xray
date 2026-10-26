import { appearancePlugins } from "./appearance";
import { chatActionPlugins } from "./chatActions";
import { chatTextPlugins } from "./chatText";
import { channelListPlugins } from "./channelList";
import cleanLinks from "./cleanLinks";
import { comfortPlugins } from "./comfort";
import { decorationPlugins } from "./decorations";
import fakeDeafen from "./fakeDeafen";
import { lookPlugins } from "./look";
import localMessageEdit from "./localMessageEdit";
import messageModeration from "./messageModeration";
import messageLogger from "./messageLogger";
import { mediaPlugins } from "./media";
import { messagingPlugins } from "./messaging";
import { notificationPlugins } from "./notifications";
import { peoplePlugins } from "./people";
import { polishPlugins } from "./polish";
import { serverPlugins } from "./servers";
import translate from "./translate";
import { readingPlugins } from "./reading";
import { toolPlugins } from "./tools";
import type { Plugin } from "./types";
import voiceBar from "./voiceBar";
import voiceRecordingMenu from "./voiceRecordingMenu";
import screenShare from "./screenShare";
import { webMenuPlugins } from "./webMenus";
import { utilityPlugins } from "./utility";
import { personalBuild } from "../personalBuild";
import personalLocalEdit from "./personalLocalEdit";

/** Every plugin that ships with xray, in the order the panel lists them. */
export const builtins: readonly Plugin<any>[] = [
  ...(personalBuild?[fakeDeafen,personalLocalEdit,localMessageEdit]:[]),
  messageLogger,
  messageModeration,
  cleanLinks,
  translate,
  ...chatActionPlugins,
  voiceBar,
  voiceRecordingMenu,
  screenShare,
  ...webMenuPlugins,
  ...toolPlugins,
  ...readingPlugins,
  ...messagingPlugins,
  ...channelListPlugins,
  ...comfortPlugins,
  ...chatTextPlugins,
  ...notificationPlugins,
  ...appearancePlugins,
  ...polishPlugins,
  ...lookPlugins,
  ...decorationPlugins,
  ...mediaPlugins,
  ...peoplePlugins,
  ...serverPlugins,
  ...utilityPlugins,
];
