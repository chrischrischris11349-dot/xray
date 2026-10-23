import { h } from "./dom";
import { onKey, uiRoot } from "./root";

export interface MiniAction { label: string; disabled?: boolean; danger?: boolean; run(): void | Promise<void> }
let dismiss: (() => void) | undefined;
export function closeMiniMenu(): void { dismiss?.(); }
export const miniMenuOpen = () => !!dismiss;
/** The mini-chat lives outside React, so use a keyboard-accessible shadow-root menu. */
export function miniMenu(event: MouseEvent, actions: MiniAction[], fail: (error: unknown) => void): void {
  event.preventDefault(); event.stopPropagation(); closeMiniMenu();
  const restore = event.currentTarget as HTMLElement | null;
  const menu = h("div", { class: "qr-context", attrs: { role: "menu", "aria-label": "Message actions" } });
  const buttons = actions.map(action => h("button", { class: action.danger ? "danger" : "", attrs: { type: "button", role: "menuitem" }, text: action.label,
    on: { click: () => { closeMiniMenu(); Promise.resolve().then(action.run).catch(fail); } } }));
  buttons.forEach((button, i) => { button.disabled = !!actions[i].disabled; menu.append(button); });
  uiRoot().append(menu);
  const rect = menu.getBoundingClientRect();
  const anchor = restore?.getBoundingClientRect();
  const x = event.clientX || anchor?.left || 8, y = event.clientY || anchor?.bottom || 52;
  Object.assign(menu.style, { left: `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`, top: `${Math.max(52, Math.min(y, innerHeight - rect.height - 8))}px` });
  const available = buttons.filter(button => !button.disabled);
  const focus = (offset: number) => { const i = available.findIndex(button => button === (menu.getRootNode() as ShadowRoot).activeElement); available[(i + offset + available.length) % available.length]?.focus(); };
  const stop = onKey(e => {
    if (e.key === "Escape" || e.key === "Tab") { closeMiniMenu(); return e.key === "Escape"; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { focus(e.key === "ArrowDown" ? 1 : -1); return true; }
    if (e.key === "Home" || e.key === "End") { available[e.key === "Home" ? 0 : available.length - 1]?.focus(); return true; }
    return false;
  });
  const outside = (e: Event) => { if (!e.composedPath().includes(menu)) closeMiniMenu(); };
  window.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", closeMiniMenu);
  dismiss = () => { dismiss = undefined; stop(); window.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", closeMiniMenu); menu.remove(); if (restore?.isConnected) restore.focus(); };
  available[0]?.focus();
}
