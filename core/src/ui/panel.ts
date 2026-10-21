/**
 * The xray panel: a floating glass panel over Discord. It lives in a closed
 * shadow root, so Discord's CSS can't reach it and Discord's scripts can't
 * poke at it. Ctrl+Shift+X opens and closes it; so does the tray menu.
 */
import { combineImpact, type OverallImpact } from "../plugins/impact";
import { fakeVoice } from "../plugins/fakeDeafen";
import { isEnabled, onPluginsChanged, pendingReload, plugins } from "../plugins/manager";
import type { Impact } from "../plugins/types";
import { loggingEnabled, markWelcomeSeen, seenWelcome, setLoggingEnabled, setThemeEnabled, themeEnabled } from "../settings";
import { setThemeActive } from "../theme";
import { type Binding, getHotkeys, HOTKEY_ACTIONS, type HotkeyAction, type Hotkeys, setHotkeys } from "../shell/hotkeys";
import { webpackStats } from "../webpack";
import { h } from "./dom";
import { type Feature, features, isFeatureOn, onFeaturesChanged, setFeature } from "./features";
import { pluginSection } from "./pluginList";
import { onKey, onKeyUp, uiRoot } from "./root";

const LOGO = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#f2f3f5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#0b0b0d" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const CLOSE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const WELCOME_MS = 6000;

const RATING: Record<Impact, { label: string; color: string; level: number }> = {
  light: { label: "Light", color: "var(--ok)", level: 1 },
  moderate: { label: "Moderate", color: "var(--warn)", level: 2 },
  heavy: { label: "Heavy", color: "var(--bad)", level: 3 },
};

const HOTKEY_HINTS: Partial<Record<HotkeyAction, string>> = {
  pushToTalk: "Set Discord's Input Mode to Push to Talk. This key works in every app, so ignore Discord's “Limited” note.",
  toggleFakeDeafen: "Plays a short chime, so you can tell in-game.",
};
const MODIFIER_NAMES: Record<number, string> = { 16: "Shift", 17: "Ctrl", 18: "Alt" };
/** Browser mouse button → Windows virtual-key code and name. Left and right click can't be hotkeys. */
const MOUSE_BUTTONS: Record<number, { key: number; name: string }> = {
  1: { key: 0x04, name: "Middle click" },
  3: { key: 0x05, name: "Mouse 4" },
  4: { key: 0x06, name: "Mouse 5" },
};
const KEY_NAMES: Record<string, string> = {
  Space: "Space", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", CapsLock: "Caps Lock", Enter: "Enter", Tab: "Tab",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", PageUp: "Page Up", PageDown: "Page Down",
  ScrollLock: "Scroll Lock", PrintScreen: "Print Screen", NumLock: "Num Lock", ContextMenu: "Menu",
};

let root: ShadowRoot | undefined;
let panel: HTMLElement | undefined;
/** Saved bindings, loaded from the Rust side when the panel opens. */
let hotkeys: Hotkeys | null = null;
let hotkeyError = "";
/** The action waiting for its new key, while you're setting one. */
let capturing: HotkeyAction | null = null;
/** A modifier pressed on its own while capturing; it becomes the binding if released with nothing else. */
let pendingModifier: number | null = null;
/** Mouse 4 and 5 also mean back and forward; the click that sets one mustn't navigate. */
let swallowMouseUp = false;

export function mountUi(): void {
  if (root) return;
  root = uiRoot();
  onKey(handleKey);
  onKeyUp(handleKeyUp);
  window.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("mouseup", onMouseUp, true);
  onPluginsChanged(render);
  onFeaturesChanged(render);
  fakeVoice.subscribe(render);
  if (!seenWelcome()) showWelcome();
}

export function isPanelOpen(): boolean {
  return panel !== undefined;
}

export function openPanel(): void {
  if (!root || panel) return;
  panel = h("div", { class: "panel", attrs: { role: "dialog", "aria-label": "xray" } });
  root.append(panel);
  render();
  getHotkeys()
    .then((saved) => {
      hotkeys = saved;
      render();
    })
    .catch(() => {
      hotkeyError = "Hotkeys only work in the xray app.";
      render();
    });
}

export function closePanel(): void {
  panel?.remove();
  panel = undefined;
  capturing = null;
  pendingModifier = null;
}

/** Returns true when the key was the panel's (see the keyboard router in root.ts). */
function handleKey(event: KeyboardEvent): boolean {
  if (capturing) {
    captureKey(event);
    return true;
  }
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyX") {
    if (panel) closePanel();
    else openPanel();
    return true;
  }
  if (event.key === "Escape" && panel) {
    closePanel();
    return true;
  }
  return false;
}

/** While capturing, every key goes to xray, not Discord. */
function swallow(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function captureKey(event: KeyboardEvent): void {
  swallow(event);
  if (event.repeat) return;
  if (event.key === "Escape") {
    capturing = pendingModifier = null;
    render();
  } else if (event.key === "Backspace" || event.key === "Delete") {
    assign(capturing!, null);
  } else if (MODIFIER_NAMES[event.keyCode]) {
    pendingModifier = event.keyCode;
  } else {
    const modifiers = [event.ctrlKey && "Ctrl", event.shiftKey && "Shift", event.altKey && "Alt"].filter(Boolean);
    assign(capturing!, {
      key: event.keyCode,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      label: [...modifiers, keyName(event)].join("+"),
    });
  }
}

function handleKeyUp(event: KeyboardEvent): boolean {
  if (!capturing) return false;
  if (pendingModifier === event.keyCode) {
    assign(capturing, { key: event.keyCode, ctrl: false, shift: false, alt: false, label: MODIFIER_NAMES[event.keyCode] });
  }
  return true;
}

function onMouseDown(event: MouseEvent): void {
  const button = MOUSE_BUTTONS[event.button];
  if (!capturing || !button) return;
  swallow(event);
  swallowMouseUp = true;
  const modifiers = [event.ctrlKey && "Ctrl", event.shiftKey && "Shift", event.altKey && "Alt"].filter(Boolean);
  assign(capturing, {
    key: button.key,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    label: [...modifiers, button.name].join("+"),
  });
}

function onMouseUp(event: MouseEvent): void {
  if (!swallowMouseUp) return;
  swallowMouseUp = false;
  swallow(event);
}

function keyName(event: KeyboardEvent): string {
  const { code, key } = event;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return KEY_NAMES[code] ?? (key.length === 1 ? key.toUpperCase() : key || code);
}

function sameBinding(a: Binding | null, b: Binding): boolean {
  return !!a && a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt;
}

/** Saves a new binding (or clears one). A key can only do one thing, so it's taken off any other action. */
function assign(action: HotkeyAction, binding: Binding | null): void {
  capturing = pendingModifier = null;
  if (!hotkeys) return;
  const previous = hotkeys;
  const next: Hotkeys = { ...hotkeys, [action]: binding };
  if (binding) {
    for (const { id } of HOTKEY_ACTIONS) if (id !== action && sameBinding(next[id], binding)) next[id] = null;
  }
  hotkeys = next;
  hotkeyError = "";
  render();
  setHotkeys(next).catch((err) => {
    hotkeys = previous;
    hotkeyError = String(err);
    render();
  });
}

function render(): void {
  if (!panel) return;
  const enabled = plugins.filter(isEnabled);
  const pending = pendingReload();
  const parts = [
    header(),
    fakeVoice.available ? fakeDeafenCard() : null,
    themeCard(),
    loggingCard(),
    features().length ? h("div", { class: "section" }, h("span", { class: "label", text: "Features" })) : null,
    features().length ? h("div", { class: "list" }, ...features().map(featureRow)) : null,
    h("div", { class: "section" }, h("span", { class: "label", text: "Hotkeys · work in games" })),
    hotkeyList(),
    h("div", {
      class: "note",
      text: "Mouse buttons make xray watch the mouse too, which costs a little CPU. Games running as administrator hide their keys from xray.",
    }),
    hotkeyError ? h("div", { class: "note error", text: hotkeyError }) : null,
    h("div", { class: "section" }, h("span", { class: "label", text: `Plugins · ${enabled.length} on` }), impactSummary(combineImpact(enabled))),
    pluginSection(),
    pending.length ? reloadBar(pending.length) : null,
    h(
      "div",
      { class: "foot" },
      h("span", { class: "label", text: "Ctrl+Shift+X" }),
      h("span", { class: "label", text: `${webpackStats().loaded.toLocaleString("en-US")} modules` }),
    ),
  ];
  panel.replaceChildren(...parts.filter((part) => part !== null));
}

function header(): HTMLElement {
  return h(
    "div",
    { class: "head" },
    h("span", { class: "logo", trustedHtml: LOGO }),
    h("span", { class: "title", text: "xray" }),
    h("span", { class: "label", text: `v${__XRAY_VERSION__}` }),
    h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Close" }, trustedHtml: CLOSE, on: { click: closePanel } }),
  );
}

function fakeDeafenCard(): HTMLElement {
  const on = fakeVoice.active;
  const sub = on
    ? fakeVoice.inVoice
      ? "Others see you deafened. You still hear everyone."
      : "Takes effect as soon as you join voice."
    : "Look deafened to everyone while you keep listening.";
  return h(
    "div",
    { class: on ? "card on" : "card" },
    h("div", { class: "card-text" }, h("div", { class: "card-title", text: "Fake deafen" }), h("div", { class: "card-sub", text: sub })),
    toggle(on, "Fake deafen", () => fakeVoice.set(!on)),
  );
}

function featureRow(feature: Feature): HTMLElement {
  const on = isFeatureOn(feature);
  return h(
    "div",
    { class: "row" },
    h("div", { class: "row-text" }, h("div", { class: "row-name", text: feature.name }), h("div", { class: "row-desc", text: feature.description })),
    toggle(on, feature.name, () => setFeature(feature, !on)),
  );
}

/** Logs go nowhere until a server is set in shell.json (see server/README.md), so this switch is safe to leave on. */
function loggingCard(): HTMLElement {
  const on = loggingEnabled();
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "card-text" },
      h("div", { class: "card-title", text: "Send logs to my server" }),
      h("div", { class: "card-sub", text: on ? "xray's errors and your voice and plugin events. Kept 15 days." : "Off. Needs your server's address in shell.json." }),
    ),
    toggle(on, "Send logs to my server", () => {
      setLoggingEnabled(!on);
      render();
    }),
  );
}

function themeCard(): HTMLElement {
  const on = themeEnabled();
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "card-text" },
      h("div", { class: "card-title", text: "Obsidian theme" }),
      h("div", { class: "card-sub", text: on ? "xray's dark glass look." : "Off: Discord's own look." }),
    ),
    toggle(on, "Obsidian theme", () => {
      setThemeEnabled(!on);
      setThemeActive(!on);
      render();
    }),
  );
}

function hotkeyList(): HTMLElement {
  if (!hotkeys) return h("div", { class: "list" }, h("div", { class: "row" }, h("span", { class: "row-desc", text: hotkeyError ? "Unavailable" : "Loading…" })));
  const saved = hotkeys;
  return h(
    "div",
    { class: "list" },
    ...HOTKEY_ACTIONS.map(({ id, name }) => {
      const binding = saved[id];
      const waiting = capturing === id;
      const hint = HOTKEY_HINTS[id];
      const chip = h("button", {
        class: waiting ? "chip capturing" : binding ? "chip" : "chip empty",
        attrs: { type: "button", "aria-label": `Set the ${name} hotkey` },
        text: waiting ? "Press a key…" : binding ? binding.label : "Not set",
        on: {
          click: () => {
            capturing = waiting ? null : id;
            pendingModifier = null;
            render();
          },
        },
      });
      const clear = binding && !waiting
        ? h("button", { class: "icon-btn small", attrs: { type: "button", "aria-label": `Clear the ${name} hotkey` }, trustedHtml: CLOSE, on: { click: () => assign(id, null) } })
        : null;
      return h(
        "div",
        { class: "row" },
        h("div", { class: "row-text" }, h("div", { class: "row-name", text: name }), hint ? h("div", { class: "row-desc", text: hint }) : null),
        chip,
        clear,
      );
    }),
  );
}

function impactSummary(overall: OverallImpact): HTMLElement {
  if (overall === "none") return h("span", { class: "impact", text: "Nothing on" });
  const rating = RATING[overall];
  const meter = h("span", { class: "meter", attrs: { "aria-hidden": "true" } });
  for (let level = 1; level <= 3; level++) {
    const bar = h("span");
    if (level <= rating.level) bar.style.background = rating.color;
    meter.append(bar);
  }
  const label = h("span", { text: `Impact: ${rating.label}` });
  label.style.color = rating.color;
  return h("span", { class: "impact" }, label, meter);
}

function toggle(on: boolean, label: string, onClick: () => void): HTMLElement {
  return h(
    "button",
    { class: "switch", attrs: { type: "button", role: "switch", "aria-checked": String(on), "aria-label": label }, on: { click: onClick } },
    h("span"),
  );
}

function reloadBar(count: number): HTMLElement {
  return h(
    "div",
    { class: "reload", attrs: { role: "status" } },
    h("span", { text: count === 1 ? "1 change applies after a reload." : `${count} changes apply after a reload.` }),
    h("button", { class: "btn", attrs: { type: "button" }, text: "Reload now", on: { click: () => location.reload() } }),
  );
}

function showWelcome(): void {
  const toast = h(
    "div",
    { class: "toast", attrs: { role: "status" } },
    h("span", { class: "logo", trustedHtml: LOGO }),
    h("span", { text: "xray is running." }),
    h("span", { class: "kbd", text: "Ctrl+Shift+X" }),
    h("span", { text: "opens the panel" }),
  );
  root!.append(toast);
  markWelcomeSeen();
  setTimeout(() => toast.remove(), WELCOME_MS);
}
