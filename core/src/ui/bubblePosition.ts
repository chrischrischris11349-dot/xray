export function clampBubble(x: number, y: number, width: number, height: number, size = 56): { x: number; y: number } {
  return { x: Math.min(Math.max(8, width - size - 8), Math.max(8, Number.isFinite(x) ? x : width - size - 20)),
    y: Math.min(Math.max(52, height - size - 8), Math.max(52, Number.isFinite(y) ? y : height - size - 92)) };
}
