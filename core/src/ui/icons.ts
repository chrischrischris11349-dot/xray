/**
 * xray's icons: Lucide (https://lucide.dev, ISC license), bundled as SVG text
 * at build time. Discord's page only allows images from Discord's own hosts,
 * so icons can't load from an outside service at runtime; bundling them keeps
 * the clean, consistent set without that.
 */
import chevronRight from "lucide-static/icons/chevron-right.svg";
import copy from "lucide-static/icons/copy.svg";
import glasses from "lucide-static/icons/glasses.svg";
import headphoneOff from "lucide-static/icons/headphone-off.svg";
import headphones from "lucide-static/icons/headphones.svg";
import micOff from "lucide-static/icons/mic-off.svg";
import mic from "lucide-static/icons/mic.svg";
import minus from "lucide-static/icons/minus.svg";
import search from "lucide-static/icons/search.svg";
import settings from "lucide-static/icons/settings.svg";
import square from "lucide-static/icons/square.svg";
import videoOff from "lucide-static/icons/video-off.svg";
import video from "lucide-static/icons/video.svg";
import x from "lucide-static/icons/x.svg";

const SOURCES = {
  chevronRight, copy, glasses, headphoneOff, headphones, mic, micOff, minus, search, settings, square, video, videoOff, x,
};

export type IconName = keyof typeof SOURCES;

const cache = new Map<string, string>();

/**
 * An icon as markup for `trustedHtml`/`innerHTML`. The source is a constant
 * bundled file, never anything from Discord or a user.
 */
export function icon(name: IconName, size = 18, stroke = 1.75): string {
  const key = `${name}:${size}:${stroke}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = SOURCES[name]
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s+class="[^"]*"/, "")
      .replace(/width="24"/, `width="${size}"`)
      .replace(/height="24"/, `height="${size}"`)
      .replace(/stroke-width="2"/, `stroke-width="${stroke}"`)
      .replace("<svg", '<svg aria-hidden="true"')
      .trim();
    cache.set(key, svg);
  }
  return svg;
}
