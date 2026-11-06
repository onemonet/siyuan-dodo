import { loadTabler, displayName, svgDataUrl } from "./tabler-icon-data";

export type LibraryId = "tabler" | "lucide" | "iconpark" | "phosphor" | "carbon" | "dicebear";
export type Glyph = { body?: string; svg?: string; width?: number; height?: number; viewBox?: string };
export type IconCatalog = { icons: Record<string, Glyph>; width?: number; height?: number };
export const libraries: { id: LibraryId; label: string; detail: string }[] = [
  { id: "tabler", label: "Tabler Icons", detail: "描边与填充图标" },
  { id: "lucide", label: "Lucide", detail: "清晰统一的开源线性图标 · ISC" },
  { id: "iconpark", label: "IconPark", detail: "描边、填充、双色图标" },
  { id: "phosphor", label: "Phosphor Icons", detail: "多种线条粗细" },
  { id: "carbon", label: "Carbon Pictograms", detail: "IBM 场景化图形符号" },
  { id: "dicebear", label: "DiceBear 头像", detail: "Open Peeps · CC0" },
];
const loaders: Record<LibraryId, () => Promise<IconCatalog>> = {
  tabler: () => loadTabler() as Promise<IconCatalog>,
  lucide: async () => {
    const source = (await import("@iconify-json/lucide/icons.json")).default;
    const icons: IconCatalog["icons"] = { ...source.icons };
    // Iconify stores renamed Lucide icons as aliases. Resolve chains
    // rather than dropping older names out of user-visible searches.
    const aliases = (source as typeof source & {
      aliases?: Record<string, { parent: string }>;
    }).aliases || {};
    const resolve = (name: string, visited = new Set<string>()): IconCatalog["icons"][string] | undefined => {
      if (visited.has(name)) return;
      if (icons[name]) return icons[name];
      const alias = aliases[name];
      if (!alias) return;
      visited.add(name);
      return resolve(alias.parent, visited);
    };
    for (const name of Object.keys(aliases)) {
      const icon = resolve(name);
      if (icon) icons[name] = icon;
    }
    return { width: source.width || 24, height: source.height || 24, icons };
  },
  iconpark: async () => {
    const [outline, solid, twotone] = await Promise.all([
      import("@iconify-json/icon-park-outline/icons.json"),
      import("@iconify-json/icon-park-solid/icons.json"),
      import("@iconify-json/icon-park-twotone/icons.json"),
    ]);
    return { width: 48, height: 48, icons: {
      ...outline.default.icons,
      ...Object.fromEntries(Object.entries(solid.default.icons).map(([name,glyph]) => [`${name}-filled`,glyph])),
      ...Object.fromEntries(Object.entries(twotone.default.icons).map(([name,glyph]) => [`${name}-twotone`,glyph])),
    } };
  },
  phosphor: async () => (await import("@iconify-json/ph/icons.json")).default as IconCatalog,
  carbon: async () => (await import("./carbon-pictograms.json")).default as IconCatalog,
  dicebear: async () => {
    const avatar = await import("./icon-avatar-generator");
    return avatar.makeAvatarCatalog("open-peeps");
  },
};
const caches = new Map<LibraryId, Promise<IconCatalog>>();
export const loadLibrary = (id: LibraryId): Promise<IconCatalog> => {
  if (!caches.has(id)) caches.set(id, loaders[id]().catch(error => { caches.delete(id); throw error; }));
  return caches.get(id)!;
};
export const glyphName = displayName;
export function styleOf(id: LibraryId, name: string): string {
  if (id === "dicebear") return "avatar";
  if (id === "carbon") return "all";
  if (id === "iconpark") return name.endsWith("-twotone") ? "twotone" : name.endsWith("-filled") ? "filled" : "outline";
  if (id === "tabler") return name.endsWith("-filled") ? "filled" : "outline";
  if (name.endsWith("-fill")) return "filled";
  if (name.endsWith("-duotone")) return "twotone";
  if (name.endsWith("-thin")) return "thin";
  if (name.endsWith("-light")) return "light";
  if (name.endsWith("-bold")) return "bold";
  return "outline";
}
const colorPattern = /^#[0-9a-f]{6}$/i;
export function librarySvg(id: LibraryId, catalog: IconCatalog, name: string, color: string, strokeWidth = 2): string {
  const glyph = catalog.icons[name];
  if (!glyph) throw new Error("图标或头像不存在，请重新选择。");
  if (!colorPattern.test(color)) throw new Error("无效的图标颜色。");
  if (id === "dicebear") return glyph.svg || "";
  const width = glyph.width || catalog.width || 24, height = glyph.height || catalog.height || 24;
  const viewBox = glyph.viewBox || `0 0 ${width} ${height}`;
  const weight = Math.min(4, Math.max(0.5, strokeWidth));
  let body = (glyph.body || "").replace(/currentColor/g, color);
  if (id === "tabler" || id === "lucide") body = body.replace(/stroke-width="[0-9.]+"/g, `stroke-width="${weight}"`);
  else if (id === "iconpark" && styleOf(id,name) === "outline") body = body.replace(/stroke-width="4"/g, `stroke-width="${weight * 2}"`);
  // Carbon pictograms are monocolor paths without explicit fills.
  if (id === "carbon") body = `<g fill="${color}">${body}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`;
}
export const previewSrc = (id: LibraryId, catalog: IconCatalog, name: string, color: string, strokeWidth = 2) =>
  svgDataUrl(librarySvg(id,catalog,name,color,strokeWidth));
