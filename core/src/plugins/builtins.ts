import { appearancePlugins } from "./appearance";
import { chatActionPlugins } from "./chatActions";
import { chatTextPlugins } from "./chatText";
import cleanLinks from "./cleanLinks";
import fakeDeafen from "./fakeDeafen";
import messageLogger from "./messageLogger";
import { notificationPlugins } from "./notifications";
import { serverPlugins } from "./servers";
import type { Plugin } from "./types";
import { utilityPlugins } from "./utility";

/** Every plugin that ships with xray, in the order the panel lists them. */
export const builtins: readonly Plugin<any>[] = [
  fakeDeafen,
  messageLogger,
  cleanLinks,
  ...chatActionPlugins,
  ...chatTextPlugins,
  ...notificationPlugins,
  ...appearancePlugins,
  ...serverPlugins,
  ...utilityPlugins,
];
