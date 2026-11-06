import { openTab } from "siyuan";
import { postJson } from "../../shared/av/kernel-api";
import { plugin } from "../../utils";
import type { CustomAppReference, CustomAppReferenceScan } from "./app-management";

const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;

export interface DatabaseBlockLabel {
  title: string;
  path: string;
}

/** Labels are presentation only; a missing/closed notebook must not disable
 * the reference guard or hide a known database block ID. */
export async function loadAppReferenceLabels(
  scan: CustomAppReferenceScan,
): Promise<Record<string, DatabaseBlockLabel>> {
  const ids = [...new Set(Object.values(scan.byApp).flat()
    .map(ref => ref.blockId).filter(id => BLOCK_ID.test(id)))];
  const labels: Record<string, DatabaseBlockLabel> = Object.create(null);
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index,index+50);
    const stmt = `SELECT id, content, hpath FROM blocks WHERE id IN (${batch.map(id => "'"+id+"'").join(",")})`;
    const rows = await postJson<Array<{id:string;content?:string;hpath?:string}>>(
      "/api/query/sql",{stmt});
    if (!Array.isArray(rows)) throw new Error("思源未返回有效的数据库块名称");
    for (const row of rows) {
      if (!BLOCK_ID.test(row.id) || !batch.includes(row.id)) continue;
      const title = typeof row.content === "string" ? row.content.trim() : "";
      const path = typeof row.hpath === "string" ? row.hpath : "";
      labels[row.id] = {
        // SiYuan's AV block content can contain markup instead of a name.
        title: title && title.length < 100 && !/[<>\r\n]/.test(title)
          ? title : "数据库块 · "+row.id.slice(-7),
        path,
      };
    }
  }
  return labels;
}

export async function openAppDatabaseBlock(ref: CustomAppReference): Promise<void> {
  if (!BLOCK_ID.test(ref.blockId)) throw new Error("数据库块 ID 无效，无法定位");
  await openTab({app:plugin.app,doc:{id:ref.blockId},openNewTab:true});
}
