/**
 * The xray panel: a floating glass panel over Discord. It lives in a closed
 * shadow root, so Discord's CSS can't reach it and Discord's scripts can't
 * poke at it. Ctrl+Shift+X opens and closes it; so does the tray menu.
 */
import { combineImpact, type OverallImpact } from "../plugins/impact";
import { fakeVoice } from "../plugins/fakeDeafen";
import { isEnabled, onPluginsChanged, pendingReload, plugins, setEnabled } from "../plugins/manager";
import type { Impact, Plugin } from "../plugins/types";
import { markWelcomeSeen, seenWelcome } from "../settings";
import { webpackStats } from "../webpack";
import { h } from "./dom";
import { css } from "./styles";

const LOGO = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#f2f3f5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#0b0b0d" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const CLOSE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const WELCOME_MS = 6000;

const RATING: Record<Impact, { label: string; color: string; level: number }> = {
  light: { label: "Light", color: "var(--ok)", level: 1 },
  moderate: { label: "Moderate", color: "var(--warn)", level: 2 },
  heavy: { label: "Heavy", color: "var(--bad)", level: 3 },
};

let root: ShadowRoot | undefined;
let panel: HTMLElement | undefined;

export function mountUi(): void {
  if (root) return;
  const host = document.createElement("xray-root");
  root = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];
  document.documentElement.append(host);

  window.addEventListener("keydown", onKey, true);
  onPluginsChanged(render);
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
}

export function closePanel(): void {
  panel?.remove();
  panel = undefined;
}

function onKey(event: KeyboardEvent): void {
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyX") {
    event.preventDefault();
    event.stopPropagation();
    if (panel) closePanel();
    else openPanel();
  } else if (event.key === "Escape" && panel) {
    closePanel();
  }
}

function render(): void {
  if (!panel) return;
  const enabled = plugins.filter(isEnabled);
  const pending = pendingReload();
  const parts = [
    header(),
    fakeVoice.available ? fakeDeafenCard() : null,
    h("div", { class: "section" }, h("span", { class: "label", text: `Plugins · ${enabled.length} on` }), impactSummary(combineImpact(enabled))),
    h("div", { class: "list" }, ...plugins.map(pluginRow)),
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

function pluginRow(plugin: Plugin): HTMLElement {
  const on = isEnabled(plugin);
  const rating = RATING[plugin.impact];
  const dot = h("span", { class: "dot" });
  dot.style.background = rating.color;
  const ratingEl = h("span", { class: "rating" }, dot, rating.label);
  ratingEl.style.color = rating.color;
  return h(
    "div",
    { class: "row" },
    h(
      "div",
      { class: "row-text" },
      h("div", { class: "row-name" }, plugin.name, h("span", { class: "tag", text: plugin.category })),
      h("div", { class: "row-desc", text: plugin.description }),
      h(
        "div",
        { class: "row-meta" },
        ratingEl,
        h("span", { text: `${plugin.impactReason} · ${plugin.needsReload ? "needs a reload" : "applies instantly"}` }),
      ),
    ),
    toggle(on, plugin.name, () => setEnabled(plugin, !on)),
  );
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
