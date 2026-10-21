/**
 * Calm Mode (Discord's reduced motion, always on) and Passcode Lock (a lock
 * screen over xray, with your passcode stored only as a salted hash).
 */
import { pluginState, save } from "../settings";
import { setNotificationsPrivate } from "../shell/notifications";
import { promptText, showDialog } from "../ui/dialog";
import { h } from "../ui/dom";
import { fromXray, uiRoot } from "../ui/root";
import { definePlugin, type Plugin } from "./types";

const calmMode = definePlugin({
  id: "calmMode",
  name: "Calm Mode",
  description: "Turns on Discord's reduced motion everywhere: fewer animations, less redrawing, easier on a high-refresh screen.",
  category: "Appearance",
  impact: "light",
  impactReason: "Saves work",
  needsReload: false,
  enabledByDefault: false,
  start(ctx) {
    const html = document.documentElement;
    const apply = () => {
      if (!html.classList.contains("reduce-motion")) html.classList.add("reduce-motion");
      if (html.classList.contains("full-motion")) html.classList.remove("full-motion");
    };
    apply();
    // Discord sets its own motion class from your settings; keep ours.
    const observer = new MutationObserver(apply);
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    ctx.onStop(() => {
      observer.disconnect();
      html.classList.remove("reduce-motion");
      html.classList.add("full-motion");
    });
  },
});

const LOCK_ID = "passcodeLock";

interface Secret {
  salt: string;
  hash: string;
}

async function digest(salt: string, code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${code}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function secret(): Secret | null {
  const data = pluginState(LOCK_ID).data?.secret as Secret | undefined;
  return data && typeof data.salt === "string" && typeof data.hash === "string" ? data : null;
}

const passcodeLock = definePlugin({
  id: LOCK_ID,
  name: "Passcode Lock",
  description: "Locks xray behind a passcode when it starts, after you've been away, or on Ctrl+Shift+L. Set the passcode from Ctrl+K.",
  category: "Privacy",
  impact: "light",
  impactReason: "One check a minute",
  needsReload: false,
  enabledByDefault: false,
  options: {
    onStart: { type: "boolean", label: "Lock when xray starts", default: true },
    idleMinutes: { type: "number", label: "Lock after this many idle minutes", description: "0 means never.", default: 15, min: 0, max: 600 },
  },
  start(ctx) {
    let screen: HTMLElement | undefined;
    let lastActive = Date.now();

    const unlock = () => {
      screen?.remove();
      screen = undefined;
      setNotificationsPrivate(false);
    };
    const lock = () => {
      if (screen || !secret()) return;
      setNotificationsPrivate(true);
      const input = h("input", { class: "lock-input", attrs: { type: "password", placeholder: "Passcode", "aria-label": "Passcode", autocomplete: "off" } });
      const status = h("div", { class: "lock-status" });
      const tryCode = async () => {
        const saved = secret();
        if (saved && (await digest(saved.salt, input.value)) === saved.hash) {
          unlock();
          lastActive = Date.now();
        } else {
          status.textContent = "That's not it.";
          input.value = "";
          input.focus();
        }
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") void tryCode();
      });
      screen = h(
        "div",
        { class: "lock", attrs: { role: "dialog", "aria-label": "xray is locked" } },
        h("div", { class: "lock-card" }, h("div", { class: "lock-title", text: "xray is locked" }), input, status,
          h("button", { class: "btn", attrs: { type: "button" }, text: "Unlock", on: { click: () => void tryCode() } })),
      );
      uiRoot().append(screen);
      window.setTimeout(() => input.focus(), 0);
    };

    // While locked, keys only reach the lock screen.
    ctx.onKey((event) => {
      if (screen) return !fromXray(event);
      if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyL" && secret()) {
        lock();
        return true;
      }
      return false;
    });

    ctx.command("Set xray passcode", "Choose the passcode for Passcode Lock", async () => {
      const first = await promptText({ title: "New passcode", placeholder: "At least 4 characters", confirm: "Next" });
      if (first === null) return;
      if (first.length < 4) return showDialog({ title: "Too short", body: "Use at least 4 characters." });
      const again = await promptText({ title: "Type it again", confirm: "Save" });
      if (again !== first) return showDialog({ title: "They didn't match", body: "Nothing was changed. Try again from Ctrl+K." });
      const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      (pluginState(LOCK_ID).data ??= {}).secret = { salt, hash: await digest(salt, first) };
      save();
      showDialog({ title: "Passcode set", body: "Ctrl+Shift+L locks xray now." });
    });
    ctx.command("Lock xray now", "Passcode Lock", lock);

    const active = () => {
      lastActive = Date.now();
    };
    for (const type of ["mousemove", "keydown", "mousedown"] as const) {
      window.addEventListener(type, active, { capture: true, passive: true });
      ctx.onStop(() => window.removeEventListener(type, active, true));
    }
    const idle = ctx.options.idleMinutes;
    if (idle > 0) ctx.every(60_000, () => Date.now() - lastActive > idle * 60_000 && lock());
    // Only when xray itself is starting, not when you switch the plugin on or change a setting.
    if (ctx.options.onStart && document.readyState === "loading") document.addEventListener("DOMContentLoaded", lock, { once: true });
    ctx.onStop(unlock);
  },
});

export const comfortPlugins: readonly Plugin<any>[] = [calmMode, passcodeLock];
