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

const MIN = icon("minus", 16, 1.5);
const MAX = icon("square", 13, 1.6);
const RESTORE = icon("copy", 13, 1.6);
const X = icon("x", 16, 1.5);

function call(command: string): void {
  invoke(`plugin:window|${command}`).catch(() => {
    // Not running in the xray app (e.g. a browser): the OS frame handles it.
  });
}

export function mountFrame(): void {
  const root = uiRoot();

  // The draggable strip. It sits below xray's own top-bar controls (launcher,
  // search) and below Discord's right-hand icons, so only the empty top
  // drags the window. Discord's own title text under it is not interactive.
  const drag = h("div", { class: "xray-drag", attrs: { "aria-hidden": "true" } });
  drag.addEventListener("mousedown", (event) => {
    if (event.button === 0) call("start_dragging");
  });
  drag.addEventListener("dblclick", () => call("toggle_maximize"));

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

  root.append(drag, buttons);
}
