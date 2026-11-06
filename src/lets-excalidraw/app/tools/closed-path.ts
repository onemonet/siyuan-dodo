/** Excalidraw renders fills for closed line / freedraw elements using
 * isPathALoop(points) (native threshold: 8 scene units at render zoom 1).
 * Do not offer fill for arrows or for ordinary unclosed polylines.
 */
export function isFillableClosedPath(element: any): boolean {
  if (!element || (element.type !== "line" && element.type !== "freedraw")) return false;
  const points: unknown = element.points;
  if (!Array.isArray(points) || points.length < 4) return false;
  if (!points.every((point): point is [number, number] =>
    Array.isArray(point) && point.length >= 2 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]))) return false;
  const first = points[0], last = points[points.length - 1];
  // The native renderer treats endpoints within 8px as a closed path.
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 8) return false;
  // A degenerate two-vertex "loop" cannot enclose a fillable region.
  const unique: Array<[number, number]> = [];
  for (const point of points.slice(0, -1) as Array<[number, number]>) {
    if (!unique.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 0.01)) {
      unique.push(point);
      if (unique.length >= 3) return true;
    }
  }
  return false;
}
