/** AV column/key identities shared by map, chart and timeline blocks.
 * Select controls show the current label; stored values are stable keyIDs.
 * Legacy name bindings migrate only if they unambiguously identify one field.
 */
export interface FieldColumn {
  id: string;
  label: string;
  name: string;
  type: string;
}
export interface FieldTable {
  headers: string[];
  columnIds?: string[];
  columnNames?: string[];
  fieldTypes?: string[];
}
export type FieldResolution =
  | { status: "resolved"; index: number; id: string; migrated: boolean }
  | { status: "missing" | "ambiguous" | "invalid-type"; index: -1; id: ""; migrated: false };

export const SIYUAN_KEY_ID = /^\d{14}-[a-z0-9]{7}(?::end)?$/;

export function fieldColumns(table: FieldTable, acceptedTypes?: readonly string[]): FieldColumn[] {
  return table.headers.flatMap((label, index) => {
    const id = table.columnIds?.[index] || "";
    const type = table.fieldTypes?.[index] || "";
    if (acceptedTypes?.length && !acceptedTypes.includes(type)) return [];
    return [{ id, label, name: table.columnNames?.[index] || label, type }];
  });
}

/** An ID that has disappeared must never silently rebind to a same-named replacement. */
export function resolveFieldBinding(
  table: FieldTable,
  stored: string,
  acceptedTypes?: readonly string[],
): FieldResolution {
  if (!stored) return { status: "missing", index: -1, id: "", migrated: false };
  const hasIds = Boolean(table.columnIds?.some(Boolean));
  const allowed = (index: number) => !acceptedTypes?.length || acceptedTypes.includes(table.fieldTypes?.[index] || "");
  if (hasIds && SIYUAN_KEY_ID.test(stored)) {
    const index = table.columnIds!.indexOf(stored);
    if (index < 0) return { status: "missing", index: -1, id: "", migrated: false };
    if (!allowed(index)) return { status: "invalid-type", index: -1, id: "", migrated: false };
    return { status: "resolved", index, id: stored, migrated: false };
  }
  // Legacy database fields must be unique by ORIGINAL name, not the adapter's
  // deduplicated display headers (e.g. 位置 and 位置·2).
  const names = hasIds ? (table.columnNames || table.headers) : table.headers;
  let matches = names.map((value, index) => value === stored ? index : -1).filter(index => index >= 0);
  if (!matches.length && hasIds) {
    matches = table.headers.map((value, index) => value === stored ? index : -1).filter(index => index >= 0);
  }
  if (matches.length > 1) return { status: "ambiguous", index: -1, id: "", migrated: false };
  if (!matches.length) return { status: "missing", index: -1, id: "", migrated: false };
  const index = matches[0];
  if (!allowed(index)) return { status: "invalid-type", index: -1, id: "", migrated: false };
  return { status: "resolved", index, id: hasIds ? (table.columnIds![index] || "") : stored,
    migrated: hasIds && Boolean(table.columnIds![index]) };
}

export function fieldSelectOptions(table: FieldTable, acceptedTypes?: readonly string[]): Array<{ value: string; label: string }> {
  return fieldColumns(table, acceptedTypes).map(column => ({ value: column.id || column.label, label: column.label }));
}

/** Never automatically select a duplicate-name field. Return warnings for the UI. */
export function migrateFieldMapping<T extends object>(
  mapping: T,
  table: FieldTable,
  acceptedByKey: Partial<Record<keyof T, readonly string[]>> = {},
): { mapping: T; changed: boolean; unresolved: string[] } {
  const next = { ...mapping } as Record<string, unknown>;
  const unresolved: string[] = [];
  let changed = false;
  for (const [key, raw] of Object.entries(mapping)) {
    if (typeof raw !== "string" || !raw) continue;
    const resolution = resolveFieldBinding(table, raw, acceptedByKey[key as keyof T]);
    if (resolution.status !== "resolved") {
      unresolved.push(`${key}: ${raw} (${resolution.status})`);
      continue;
    }
    if (resolution.migrated) { next[key] = resolution.id; changed = true; }
  }
  return { mapping: next as T, changed, unresolved };
}
