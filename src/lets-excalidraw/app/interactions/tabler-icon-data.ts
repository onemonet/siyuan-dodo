/** Load the MIT-licensed Tabler SVG catalog only after the user opens it. */
export type TablerGlyph = { body: string; width?: number; height?: number };
export type TablerCatalog = { icons: Record<string, TablerGlyph>; width?: number; height?: number };
let cached: Promise<TablerCatalog> | null = null;
export const loadTabler = (): Promise<TablerCatalog> =>
  cached ??= import("@iconify-json/tabler/icons.json").then(module => module.default as TablerCatalog);
export const displayName = (name: string) => name.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
export const isFilled = (name: string) => name.endsWith("-filled");
const colorPattern = /^#[0-9a-f]{6}$/i;
export function tablerSvg(catalog: TablerCatalog, name: string, color: string, strokeWidth = 2): string {
  const entry = catalog.icons[name];
  if (!entry) throw new Error("图标不存在，请重新选择。");
  if (!colorPattern.test(color)) throw new Error("无效的图标颜色。");
  const width = entry.width || catalog.width || 24, height = entry.height || catalog.height || 24;
  const weight = Math.min(4, Math.max(0.5, strokeWidth));
  // Static package data, not untrusted user SVG. Replacing currentColor also
  // makes standalone and SVG/PNG exports independent of CSS/theme state.
  const body = entry.body.replace(/currentColor/g, color)
    .replace(/stroke-width="[0-9.]+"/g, `stroke-width="${weight}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
export function svgDataUrl(svg: string): string {
  const utf8 = new TextEncoder().encode(svg);
  let data = "";
  for (const byte of utf8) data += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(data)}`;
}
