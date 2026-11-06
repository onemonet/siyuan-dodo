import { request } from "../../api";
import mapSvg from "../assets/lucide-map-pinned.svg?raw";

export const DODO_MAP_VIEW_NAME = "地图";
export const DODO_MAP_ICON_FILE = "dodo-lucide-map-pinned.svg";
export const DODO_MAP_FALLBACK_ICON = "1f5fa-fe0f"; // 🗺️, if custom icon upload fails

export interface NativeViewAppearance { name: string; icon: string }

const iconRequests = new Map<string, Promise<string>>();

/** Persist Lucide SVG as a SiYuan native custom-emoji path, not raw SVG in the database. */
export async function ensureNativeLucideIcon(filename: string, svg: string): Promise<string> {
  const previous = iconRequests.get(filename);
  if (previous) return previous;
  const work = (async () => {
    try {
      const probe = await fetch(`/emojis/${filename}`, { method: "HEAD" });
      if (probe.ok) return filename;
    } catch { /* Icon was not yet installed. */ }
    const form = new FormData();
    form.append("name", filename);
    form.append("file", new Blob([svg], { type: "image/svg+xml" }), filename);
    const res = await fetch("/api/system/addCustomEmoji", { method: "POST", body: form });
    if (!res.ok) throw new Error(`导入图标失败（HTTP ${res.status}）`);
    const body = await res.json() as { code: number; msg?: string; data?: { path?: string } };
    if (body.code !== 0 || !body.data?.path) throw new Error(body.msg || "思源未返回图标路径");
    return body.data.path;
  })();
  iconRequests.set(filename, work);
  try { return await work; } catch (error) { iconRequests.delete(filename); throw error; }
}

export async function ensureNativeLucideMapIcon(): Promise<string> {
  return ensureNativeLucideIcon(DODO_MAP_ICON_FILE, mapSvg);
}

/** Uses the kernel's native undoable view metadata operations, not renderAttributeView. */
export async function writeNativeViewAppearance(
  avID: string, blockID: string, viewID: string,
  previous: NativeViewAppearance, next: NativeViewAppearance,
): Promise<void> {
  const operations: Array<{ action: string; avID: string; blockID: string; id: string; data: string }> = [];
  const undo: typeof operations = [];
  const add = (action: string, before: string, after: string) => {
    if (before === after) return;
    operations.push({ action, avID, blockID, id: viewID, data: after });
    undo.unshift({ action, avID, blockID, id: viewID, data: before });
  };
  add("setAttrViewViewName", previous.name, next.name);
  add("setAttrViewViewIcon", previous.icon, next.icon);
  if (!operations.length) return;
  await request("/api/transactions", {
    reqId: Date.now(),
    transactions: [{ doOperations: operations, undoOperations: undo }],
  });
}
