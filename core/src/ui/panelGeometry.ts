export interface PanelGeometry { x: number; y: number; width: number; height: number }
export function clampPanel(value: Partial<PanelGeometry>, viewportWidth: number, viewportHeight: number): PanelGeometry {
  const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const maxWidth = Math.max(1, viewportWidth - 16), maxHeight = Math.max(1, viewportHeight - 60);
  const width = Math.min(maxWidth, Math.max(Math.min(340, maxWidth), finite(value.width, 420)));
  const height = Math.min(maxHeight, Math.max(Math.min(240, maxHeight), finite(value.height, 760)));
  return { width, height,
    x: Math.min(Math.max(8, viewportWidth - width - 8), Math.max(8, finite(value.x, viewportWidth - width - 16))),
    y: Math.min(Math.max(52, viewportHeight - height - 8), Math.max(52, finite(value.y, 52))) };
}
