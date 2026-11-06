/** Rectangle selection geometry, isolated from the DOM so it can be regression-tested. */
export interface MarqueePoint { x: number; y: number }
export interface MarqueeRect { x: number; y: number; width: number; height: number }

export function marqueeBounds(a: MarqueePoint, b: MarqueePoint): MarqueeRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function intersectsMarquee(a: MarqueeRect, b: MarqueeRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Always calculate against the pointer-down selection, never the previous frame.
 * Without this, dragging back and forth leaves behind incorrectly selected items.
 */
export function applyMarqueeChoice(
  originals: readonly string[],
  intersected: readonly string[],
  mode: "replace" | "add" | "toggle",
): string[] {
  if (mode === "replace") return [...new Set(intersected)];
  const hits = new Set(intersected);
  const originalSet = new Set(originals);
  const kept = mode === "toggle"
    ? originals.filter((name) => !hits.has(name))
    : [...originals];
  const chosen = new Set(kept);
  for (const name of intersected) {
    if (mode === "toggle" && originalSet.has(name)) continue;
    if (!chosen.has(name)) { chosen.add(name); kept.push(name); }
  }
  return kept;
}
