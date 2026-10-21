import { appearancePlugins } from "./appearance";
import { chatActionPlugins } from "./chatActions";
import { chatTextPlugins } from "./chatText";
import cleanLinks from "./cleanLinks";
import { decorationPlugins } from "./decorations";
import fakeDeafen from "./fakeDeafen";
import { lookPlugins } from "./look";
import messageLogger from "./messageLogger";
import { mediaPlugins } from "./media";
import { notificationPlugins } from "./notifications";
import { peoplePlugins } from "./people";
import { polishPlugins } from "./polish";
import { serverPlugins } from "./servers";
import translate from "./translate";
import { readingPlugins } from "./reading";
import { toolPlugins } from "./tools";
import type { Plugin } from "./types";
import { webMenuPlugins } from "./webMenus";
import { utilityPlugins } from "./utility";

/** Every plugin that ships with xray, in the order the panel lists them. */
export const builtins: readonly Plugin<any>[] = [
  fakeDeafen,
  messageLogger,
  cleanLinks,
  translate,
  ...chatActionPlugins,
  ...webMenuPlugins,
  ...toolPlugins,
  ...readingPlugins,
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
