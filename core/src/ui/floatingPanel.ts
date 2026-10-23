import { pluginState, save } from "../settings";
import { onKey } from "./root";
import { clampPanel, type PanelGeometry } from "./panelGeometry";

/** Stable panel listeners survive renders that replace the header and controls. */
export function makeFloatingPanel(panel: HTMLElement, options: { key?: string; header?: string; initial?: Partial<PanelGeometry> } = {}): () => void {
  const key = options.key ?? "settingsPanel", header = options.header ?? ".head";
  let geometry = clampPanel(pluginState(key).data ?? options.initial ?? {}, innerWidth, innerHeight);
  let drag: { pointer: number; x: number; y: number; start: PanelGeometry; resize: boolean } | undefined;
  let frame = 0, next: Partial<PanelGeometry> | undefined;
  const flushFrame = () => { cancelAnimationFrame(frame); frame = 0; if (next) { const value = next; next = undefined; apply(value); } };
  const queue = (value: Partial<PanelGeometry>) => { next = value; if (!frame) frame = requestAnimationFrame(flushFrame); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const persist = () => {
    clearTimeout(timer); pending = false;
    pluginState(key).data = { ...geometry }; save();
  };
  const schedule = () => { pending = true; clearTimeout(timer); timer = setTimeout(persist, 250); };
  const apply = (next: Partial<PanelGeometry>) => {
    geometry = clampPanel(next, innerWidth, innerHeight);
    if (drag && !drag.resize) {
      // Moving a fixed-size glass surface needs a compositor translation, not a
      // layout of the conversation on every pointer sample.
      panel.style.transform = `translate3d(${geometry.x-drag.start.x}px,${geometry.y-drag.start.y}px,0)`;
      return;
    }
    panel.style.transform = "";
    Object.assign(panel.style, { left: `${geometry.x}px`, top: `${geometry.y}px`, right: "auto", width: `${geometry.width}px`, height: `${geometry.height}px` });
  };
  apply(geometry);
  const down = (event: PointerEvent) => {
    const target = event.target as Element;
    const resize = !!target.closest(".panel-resize");
    if (event.button !== 0 || (!resize && (!target.closest(header) || target.closest("button,input,select,a,[role=switch]")))) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: { ...geometry }, resize };
    panel.style.animation = "none";
    panel.setPointerCapture(event.pointerId); panel.classList.add("dragging"); event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    queue(drag.resize ? { ...drag.start, width: drag.start.width + dx, height: drag.start.height + dy } : { ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
  };
  const up = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    flushFrame(); drag = undefined; apply(geometry); panel.classList.remove("dragging");
    if (panel.hasPointerCapture(event.pointerId)) panel.releasePointerCapture(event.pointerId);
    persist();
  };
  const resize = () => { flushFrame(); apply(geometry); schedule(); };
  const observer = new ResizeObserver(() => {
    // offset sizes are border-box, matching CSS box-sizing and stored geometry.
    const width = panel.offsetWidth, height = panel.offsetHeight;
    // Presentation mode hides the panel without changing its saved geometry.
    if (!width || !height) return;
    if (Math.abs(width - geometry.width) < 1 && Math.abs(height - geometry.height) < 1) return;
    apply({ ...geometry, width, height }); schedule();
  });
  observer.observe(panel);
  panel.addEventListener("pointerdown", down); panel.addEventListener("pointermove", move);
  panel.addEventListener("pointerup", up); panel.addEventListener("pointercancel", up);
  panel.addEventListener("lostpointercapture", up); window.addEventListener("resize", resize);
  const removeKey = onKey(event => {
    const target = event.composedPath()[0];
    if (!event.altKey || event.ctrlKey || event.metaKey || !(target instanceof HTMLElement) || !target.matches(`${header},.panel-resize`) || !panel.contains(target)) return false;
    const dx = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
    const dy = event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0;
    if (!dx && !dy) return false;
    apply(event.shiftKey || target.matches(".panel-resize") ? { ...geometry, width: geometry.width + dx, height: geometry.height + dy } : { ...geometry, x: geometry.x + dx, y: geometry.y + dy });
    schedule(); return true;
  });
  return () => {
    flushFrame(); if (pending || drag) persist();
    clearTimeout(timer); observer.disconnect(); removeKey();
    window.removeEventListener("resize", resize);
    panel.removeEventListener("pointerdown", down); panel.removeEventListener("pointermove", move);
    panel.removeEventListener("pointerup", up); panel.removeEventListener("pointercancel", up); panel.removeEventListener("lostpointercapture", up);
  };
}
