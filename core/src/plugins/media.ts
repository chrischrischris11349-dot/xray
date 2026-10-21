/**
 * Image plugins: a magnifier lens for images in chat, and reverse image
 * search from the right-click menu. Neither touches Discord's code; they
 * work on the <img> elements Discord already renders.
 */
import { menu } from "../api/menus";
import { h } from "../ui/dom";
import { uiRoot } from "../ui/root";
import { definePlugin, type Plugin } from "./types";

/** A message image or GIF (not an avatar, emoji or server icon). */
const MEDIA = /^https:\/\/(?:cdn\.discordapp\.com\/attachments|media\.discordapp\.net)\//;
const MIN_SIZE = 32;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where to put the zoomed image inside the lens so the point under the cursor
 * stays centered. The cursor sits at the lens's centre, `lensSize / 2` from
 * its top-left.
 */
export function lensStyle(image: Rect, cursorX: number, cursorY: number, zoomPercent: number, lensSize: number) {
  const zoom = zoomPercent / 100;
  const width = image.width * zoom;
  const height = image.height * zoom;
  const fx = clamp((cursorX - image.left) / image.width, 0, 1);
  const fy = clamp((cursorY - image.top) / image.height, 0, 1);
  return { size: [width, height] as const, position: [lensSize / 2 - fx * width, lensSize / 2 - fy * height] as const };
}

function zoomable(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof HTMLImageElement) || !MEDIA.test(target.src)) return null;
  const rect = target.getBoundingClientRect();
  return rect.width >= MIN_SIZE && rect.height >= MIN_SIZE ? target : null;
}

const imageZoom = definePlugin({
  id: "imageZoom",
  name: "Image Zoom",
  description: "Hold on an image in chat to magnify it. Scroll to zoom, Shift+scroll to resize the lens.",
  category: "Media",
  impact: "light",
  impactReason: "Only runs while you're holding on an image",
  needsReload: false,
  enabledByDefault: false,
  options: {
    zoom: { type: "number", label: "Zoom (%)", default: 250, min: 100, max: 800, step: 10 },
    lensSize: { type: "number", label: "Lens size (px)", default: 240, min: 100, max: 600, step: 20 },
  },
  start(ctx) {
    let lens: HTMLElement | undefined;
    let image: HTMLImageElement | undefined;
    let zoom = ctx.options.zoom;
    let lensSize = ctx.options.lensSize;

    const place = (x: number, y: number) => {
      if (!lens || !image) return;
      const { size, position } = lensStyle(image.getBoundingClientRect(), x, y, zoom, lensSize);
      lens.style.width = lens.style.height = `${lensSize}px`;
      lens.style.left = `${x - lensSize / 2}px`;
      lens.style.top = `${y - lensSize / 2}px`;
      lens.style.backgroundImage = `url("${(image.currentSrc || image.src).replace(/"/g, "%22")}")`;
      lens.style.backgroundSize = `${size[0]}px ${size[1]}px`;
      lens.style.backgroundPosition = `${position[0]}px ${position[1]}px`;
    };
    const move = (event: MouseEvent) => place(event.clientX, event.clientY);
    const wheel = (event: WheelEvent) => {
      if (!lens) return;
      event.preventDefault();
      if (event.shiftKey) lensSize = clamp(lensSize - Math.sign(event.deltaY) * 20, 100, 600);
      else zoom = clamp(zoom - Math.sign(event.deltaY) * 20, 100, 800);
      place(event.clientX, event.clientY);
    };
    const close = () => {
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("wheel", wheel, true);
      window.removeEventListener("mouseup", close, true);
      lens?.remove();
      lens = image = undefined;
    };
    const open = (event: MouseEvent) => {
      const found = zoomable(event.target);
      if (!found || event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      image = found;
      lens = h("div", { class: "zoom-lens", attrs: { "aria-hidden": "true" } });
      uiRoot().append(lens);
      place(event.clientX, event.clientY);
      window.addEventListener("mousemove", move, true);
      window.addEventListener("wheel", wheel, { capture: true, passive: false });
      window.addEventListener("mouseup", close, true);
    };
    window.addEventListener("mousedown", open, true);
    ctx.onStop(() => {
      close();
      window.removeEventListener("mousedown", open, true);
    });
  },
});

type Engine = "google" | "bing" | "yandex" | "tineye" | "saucenao";

const ENGINES: Record<Engine, { label: string; url: (image: string) => string }> = {
  google: { label: "Google Lens", url: (i) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(i)}` },
  bing: { label: "Bing", url: (i) => `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encodeURIComponent(i)}` },
  yandex: { label: "Yandex", url: (i) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(i)}` },
  tineye: { label: "TinEye", url: (i) => `https://www.tineye.com/search?url=${encodeURIComponent(i)}` },
  saucenao: { label: "SauceNAO", url: (i) => `https://saucenao.com/search.php?url=${encodeURIComponent(i)}` },
};
const ENGINE_ORDER: readonly Engine[] = ["google", "bing", "yandex", "tineye", "saucenao"];

/** The search URL(s) to open for an image: one engine, or all of them. */
export function searchUrls(engine: Engine | "all", image: string): string[] {
  return engine === "all" ? ENGINE_ORDER.map((id) => ENGINES[id].url(image)) : [ENGINES[engine].url(image)];
}

/** The original file behind a resized media-proxy address. */
export function originalImage(src: string): string {
  try {
    const url = new URL(src);
    for (const param of ["width", "height", "format", "quality"]) url.searchParams.delete(param);
    return url.toString();
  } catch {
    return src;
  }
}

const reverseImageSearch = definePlugin({
  id: "reverseImageSearch",
  name: "Reverse Image Search",
  description: "Right-click an image in chat to search for where it's from.",
  category: "Media",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  options: {
    engine: {
      type: "select",
      label: "Search with",
      default: "google",
      choices: [...ENGINE_ORDER.map((id) => ({ value: id, label: ENGINES[id].label })), { value: "all", label: "Every engine" }],
    },
  },
  start(ctx) {
    ctx.menu("message", (items, { element }) => {
      const img = element instanceof HTMLImageElement ? element : element?.closest('[class*="imageWrapper_"]')?.querySelector("img");
      if (!img || !MEDIA.test(img.src)) return;
      const image = originalImage(img.currentSrc || img.src);
      items.push(
        menu.item({
          id: "reverse-image-search",
          label: "Search image",
          action: () => {
            for (const url of searchUrls(ctx.options.engine as Engine | "all", image)) window.open(url, "_blank", "noopener,noreferrer");
          },
        }),
      );
    });
  },
});

export const mediaPlugins: readonly Plugin<any>[] = [imageZoom, reverseImageSearch];
