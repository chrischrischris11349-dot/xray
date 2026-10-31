/**
 * xray's own window frame. The Tauri window is undecorated (no OS title bar),
 * so xray draws the title bar itself: a drag region across the top and
 * minimize / maximize / close buttons at the top-right, styled to match the
 * theme. They call Tauri's core window commands (granted in
 * capabilities/main.json), so Discord's page never gets general window power,
 * only these.
 *
 * Close goes through Discord's normal close, which xray's Rust side turns
 * into hide-to-tray.
 */
import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { icon } from "./icons";
import { uiRoot } from "./root";
import { addStyle, watchElements } from "../api/dom";

const MIN = icon("minus", 16, 1.5);
const MAX = icon("square", 13, 1.6);
const RESTORE = icon("copy", 13, 1.6);
const X = icon("x", 16, 1.5);

function call(command: string): void {
  invoke(`plugin:window|${command}`).catch(() => {
    // Not running in the xray app (e.g. a browser): the OS frame handles it.
  });
}

const TOP_BAR = '[class*="base_"] > [class^="bar_"]';
const TOP_BAR_HEIGHT = 46;
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function mountFrame(): void {
  const root = uiRoot();
  addStyle(`${TOP_BAR} { box-sizing:border-box!important; padding-inline-end:168px!important; align-items:center!important; }
    html[data-xray-vbar]:not([data-xray-presentation]) ${TOP_BAR} { padding-inline-end:288px!important; }
    html[data-xray-fd-active]:not([data-xray-presentation]) ${TOP_BAR} { padding-inline-end:368px!important; }
    ${TOP_BAR} > [class*="trailing_"] { position:relative!important; inset:auto!important; transform:none!important; align-self:center!important; display:flex!important; align-items:center!important; }`);
  let barObserver: ResizeObserver | undefined;
  let measuredHeight = TOP_BAR_HEIGHT;
  watchElements(TOP_BAR, bar => {
    barObserver?.disconnect();
    const measure = () => {
      const height = document.documentElement.hasAttribute('data-xray-account-tabs')?TOP_BAR_HEIGHT:bar.getBoundingClientRect().height;
      if (height >= 24 && height <= 80) { measuredHeight = height; (root.host as HTMLElement).style.setProperty("--xr-titlebar-height", `${height}px`); }
    };
    barObserver = new ResizeObserver(measure); barObserver.observe(bar); measure();
  });

  // Dragging: a press on an empty part of Discord's top bar moves the window.
  // No overlay, so Discord's own top-bar icons (inbox, help) keep their
  // clicks wherever they sit. xray's own controls live in its shadow root,
  // so their events reach here retargeted to the host, outside the bar.
  const onBar = (event: MouseEvent) => {
    if (event.button !== 0 || event.clientY > measuredHeight || !(event.target instanceof Element)) return false;
    const bar = document.querySelector(TOP_BAR);
    // Before the app mounts (loading, login) the whole top edge drags.
    if (bar ? !bar.contains(event.target) : event.target !== document.documentElement && event.target !== document.body && !event.target.closest("#app-mount")) return false;
    return !event.target.closest(INTERACTIVE);
  };
  window.addEventListener("mousedown", (event) => onBar(event) && call("start_dragging"), true);
  window.addEventListener("dblclick", (event) => onBar(event) && call("toggle_maximize"), true);

  const maxBtn = h("button", {
    class: "win-btn",
    attrs: { type: "button", "aria-label": "Maximize", title: "Maximize" },
    trustedHtml: MAX,
    on: { click: () => call("toggle_maximize") },
  });
  const buttons = h(
    "div",
    { class: "win-btns" },
    h("button", { class: "win-btn", attrs: { type: "button", "aria-label": "Minimize", title: "Minimize" }, trustedHtml: MIN, on: { click: () => call("minimize") } }),
    maxBtn,
    h("button", { class: "win-btn close", attrs: { type: "button", "aria-label": "Close", title: "Close to tray" }, trustedHtml: X, on: { click: () => call("close") } }),
  );
  // Swap the maximize icon for a restore icon while the window is maximized.
  const syncMax = async () => {
    try {
      const maxed = await invoke("plugin:window|is_maximized");
      maxBtn.innerHTML = maxed ? RESTORE : MAX;
      maxBtn.title = maxBtn.ariaLabel = maxed ? "Restore" : "Maximize";
    } catch {
      // not in the app
    }
  };
  maxBtn.addEventListener("click", () => window.setTimeout(syncMax, 100));
  window.addEventListener("resize", () => window.setTimeout(syncMax, 100));
  void syncMax();

  root.append(buttons);
}
