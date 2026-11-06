import { openTab } from "siyuan";
import { plugin as mainPlugin } from "../../utils";

/** Shared by native database map and timeline views. */
export async function openMapItem(
    data: Record<string, unknown>,
    options: { position?: "right" } = {},
): Promise<void> {
    const validID = (value: unknown): value is string =>
      typeof value === "string" && /^\d{14}-[a-z0-9]{7}$/.test(value);

    // value.block.id 是真正绑定的文档块；value.blockID / row.id 只是数据库条目 ID。
    if (validID(data.blockId)) {
      await openTab({ app: mainPlugin.app, doc: { id: data.blockId },
        ...(options.position ? { position: options.position } : {}),
        openNewTab: true });
      return;
    }

    // 未绑定的条目没有文档块。使用思源 v3.8.7 原生的 siyuan-database-row 页签。
    if (![data.itemId, data.valueId, data.avID, data.databaseBlockID].every(validID)) {
      throw new Error("数据库条目缺少有效的标识，无法打开详情。");
    }
    const title = typeof data.title === "string" ? data.title : "数据库条目";
    const response = await fetch("/api/block/getBlockInfo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.databaseBlockID }),
    });
    if (!response.ok) throw new Error("读取来源数据库的笔记本信息失败。");
    const body = await response.json() as { code: number; msg?: string; data?: { box?: string } };
    if (body.code !== 0 || !body.data?.box) {
      throw new Error(body.msg || "来源数据库块不存在，无法打开条目详情。");
    }
    await openTab({
      app: mainPlugin.app,
      custom: {
        id: "siyuan-database-row",
        icon: "iconDatabase",
        title,
        data: {
          avID: data.avID,
          itemID: data.itemId,
          valueID: data.valueId,
          blockID: data.databaseBlockID,
          notebookId: body.data.box,
          title,
          isDetached: true,
        },
      },
      position: "right",
      openNewTab: true,
    });
}
