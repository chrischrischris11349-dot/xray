/**
 * The right-click entries Discord's desktop app gets from Electron and its
 * web app lacks: copy or open a link, copy or open an image, copy what you've
 * selected, and copy a custom emoji's code. They read the element you
 * right-clicked (see api/menus.ts), so they appear only when they apply.
 */
import { menu } from "../api/menus";
import { copyText } from "../ui/dialog";
import { definePlugin, type Plugin } from "./types";
import {openExternalLink} from '../ui/linkSafety';

const EMOJI = /^https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(webp|png|gif|jpg)/;

/** Copies an image to the clipboard as PNG, which is what every app accepts. */
async function copyImage(src: string): Promise<void> {
  const response = await fetch(src);
  const blob = await response.blob();
  if (blob.type === "image/png") {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": await canvas.convertToBlob({ type: "image/png" }) })]);
}

const webContextMenus = definePlugin({
  id: "webContextMenus",
  name: "Copy & Open",
  description: "Right-click a link or image in chat to copy or open it, or copy the text you've selected, like the desktop app.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { element }) => {
      const entries: any[] = [];
      const selection = window.getSelection()?.toString() ?? "";
      if (selection.trim()) entries.push(menu.item({ id: "copy-selection", label: "Copy selection", action: () => copyText(selection) }));
      const link = element?.closest<HTMLAnchorElement>("a[href^='http']");
      if (link) {
        const href = link.href;
        entries.push(
          menu.item({ id: "copy-link", label: "Copy link", action: () => copyText(href) }),
          menu.item({ id: "open-link", label: "Inspect and open link", action: () => void openExternalLink(href,link.innerText||link.textContent||'') }),
        );
      }
      const img = element instanceof HTMLImageElement ? element : null;
      if (img && /^https:/.test(img.currentSrc || img.src) && !EMOJI.test(img.src) && !img.closest("a[href^='http']")) {
        const src = img.currentSrc || img.src;
        entries.push(
          menu.item({ id: "copy-image", label: "Copy image", action: () => void copyImage(src).catch(() => copyText(src)) }),
          menu.item({ id: "open-image", label: "Open image", action: () => window.open(src, "_blank", "noopener,noreferrer") }),
        );
      }
      if (entries.length) items.unshift(menu.group(...entries));
    });
  },
});

const copyEmoji = definePlugin({
  id: "copyEmojiMarkdown",
  name: "Copy Emoji",
  description: "Right-click a custom emoji in a message to copy its code (<:name:id>) or open the image.",
  category: "Utility",
  impact: "light",
  impactReason: "Only runs from the menu",
  needsReload: false,
  enabledByDefault: true,
  start(ctx) {
    ctx.menu("message", (items, { element }) => {
      const img = element instanceof HTMLImageElement ? element : null;
      const match = img && EMOJI.exec(img.src);
      if (!img || !match) return;
      const name = (img.alt || img.getAttribute("aria-label") || "emoji").replace(/:/g, "").trim() || "emoji";
      const animated = match[2] === "gif" || /[?&]animated=true/.test(img.src);
      const code = `<${animated ? "a" : ""}:${name}:${match[1]}>`;
      const url = `https://cdn.discordapp.com/emojis/${match[1]}.${animated ? "gif" : "png"}?size=512`;
      items.push(
        menu.group(
          menu.item({ id: "copy-emoji-code", label: "Copy emoji code", subtext: code, action: () => copyText(code) }),
          menu.item({ id: "open-emoji", label: "Open emoji", action: () => window.open(url, "_blank", "noopener,noreferrer") }),
        ),
      );
    });
  },
});

export const webMenuPlugins: readonly Plugin<any>[] = [webContextMenus, copyEmoji];
