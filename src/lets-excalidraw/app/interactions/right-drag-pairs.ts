/** Preserve the legacy right-drag one-to-many / many-to-one semantics.
 * The selection is captured at drag start, before the canvas can clear it.
 */
export type ConnectionPair = { start: any; end: any };

const CONNECTABLE_TYPES = new Set(["rectangle","ellipse","diamond","text","image"]);
export const isConnectableForRightDrag = (element:any) => Boolean(element && !element.isDeleted &&
  (CONNECTABLE_TYPES.has(element.type) ||
    (element.type === "embeddable" && /^siyuan:\/\/blocks\/\d{14}-[a-z0-9]{7}$/i.test(element.link || "")))
);

/** Bound text belongs to its containing shape, not a second connection node. */
export function canonicalConnectElement(element:any, elements:readonly any[]):any {
  if (element?.type !== "text" || !element.containerId) return element;
  return elements.find(item => item.id === element.containerId && isConnectableForRightDrag(item)) || element;
}

export function connectionPairsForSelection(start:any, end:any,
  selectedIds:ReadonlySet<string>, elements:readonly any[]):ConnectionPair[] {
  const from=canonicalConnectElement(start,elements);
  const to=canonicalConnectElement(end,elements);
  if (!isConnectableForRightDrag(from) || !isConnectableForRightDrag(to) || from.id === to.id) return [];
  const selected: any[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    if (!selectedIds.has(element.id)) continue;
    const canonical=canonicalConnectElement(element,elements);
    if (!isConnectableForRightDrag(canonical) || seen.has(canonical.id)) continue;
    seen.add(canonical.id);
    selected.push(canonical);
  }
  if (selected.length > 1) {
    const fromSelected=seen.has(from.id),toSelected=seen.has(to.id);
    // Group -> external target: many-to-one. External source -> group:
    // one-to-many. If both endpoints belong to the same selection,
    // preserve normal one-to-one instead of connecting every pair.
    if (fromSelected && !toSelected) return selected.filter(item => item.id !== to.id)
      .map(item => ({start:item,end:to}));
    if (!fromSelected && toSelected) return selected.filter(item => item.id !== from.id)
      .map(item => ({start:from,end:item}));
  }
  return [{start:from,end:to}];
}
