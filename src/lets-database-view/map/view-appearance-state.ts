/** Preserve custom names when enabling a native database view. */
export function shouldUseDefaultMapName(name: string): boolean {
  return !name.trim() || /^(表格|Table)(?:\s*\d+)?$/i.test(name.trim());
}