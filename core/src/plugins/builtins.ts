import cleanLinks from "./cleanLinks";
import fakeDeafen from "./fakeDeafen";
import type { Plugin } from "./types";

/** Every plugin that ships with xray, in the order the panel lists them. */
export const builtins: readonly Plugin[] = [fakeDeafen, cleanLinks];
