
import { getBlockDOM, renderAttributeView } from "../../shared/av/kernel-api";
import { DatabaseViewConfigStore } from "../view-config-store";
import { adaptAttributeViewRender, type AvRenderData } from "../../shared/av/av-data-adapter";
import { resolveFieldBinding } from "../../shared/av/field-binding";
import { nativeLocationHasValue } from "./map-data";
export class MapBlockService {

  /** 生成思源兼容条目 ID；优先复用思源官方 Lute。 */
  private static newItemId(): string {
    const lute = (window as typeof window & { Lute?: { NewNodeID?: () => string } }).Lute;
    const generated = lute?.NewNodeID?.();
    if (generated && /^\d{14}-[a-z0-9]{7}$/.test(generated)) return generated;
    const date = new Date();
    const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((number, i) => String(number).padStart(i === 0 ? 4 : 2, "0")).join("");
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    return `${stamp}-${Array.from(bytes, value => alphabet[value % alphabet.length]).join("")}`;
  }

  /** 创建独立条目（不生成文档）并设置原生位置列，最终返回可打开的 AV 主键单元格 ID。 */
  static async createPoint(mapBlockId: string, point: { name: string; longitude: number; latitude: number }, viewId?: string): Promise<{
    itemId: string; valueId: string; avID: string; databaseBlockID: string; title: string;
  }> {
    const name = point.name.trim().slice(0, 256);
    const { longitude, latitude } = point;
    if (!name || !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      throw new Error("地点名称或 WGS84 经纬度无效，无法创建。");
    }
    if (viewId && !/^\d{14}-[a-z0-9]{7}$/.test(viewId)) {
      throw new Error("数据库视图 ID 无效，无法添加地点。");
    }
    if (!viewId || !/^\d{14}-[a-z0-9]{7}$/.test(viewId)) throw new Error("缺少数据库地图视图 ID。");
    const current=(await DatabaseViewConfigStore.load(mapBlockId)).views[viewId];
    if (current?.mode!=="map" || !current.configs.map) throw new Error("当前视图不是地图模式。");
    const sourceId=mapBlockId;
    const config=current.configs.map;
    if (!config.fieldMapping.coordinate) throw new Error("请先在地图设置中选择位置字段。");
    const { dom } = await getBlockDOM(sourceId);
    const avID = (dom || "").match(/data-av-id="([^"]+)"/)?.[1] || "";
    if (!/^\d{14}-[a-z0-9]{7}$/.test(avID)) throw new Error("来源块不是有效的数据库。");
    const raw = await renderAttributeView({ id: avID, blockID: sourceId, pageSize: 1, ...(viewId ? { viewID: viewId } : {}) }) as {
      view?: { columns?: Array<{ id?: string; name?: string; type?: string }> };
    };
    const sourceColumns = raw.view?.columns || [];
    const match = resolveFieldBinding({
      headers: sourceColumns.map(column => column.name || ""),
      columnIds: sourceColumns.map(column => column.id || ""),
      fieldTypes: sourceColumns.map(column => column.type || ""),
    }, config.fieldMapping.coordinate, ["location"]);
    const locationColumns = (raw.view?.columns || []).filter(column =>
      match.status === "resolved" && column.id === match.id && column.type === "location" &&
      typeof column.id === "string" && /^\d{14}-[a-z0-9]{7}$/.test(column.id),
    );
    if (locationColumns.length !== 1) {
      throw new Error("无法唯一识别位置字段，请在地图设置中重新选择坐标列。");
    }
    const locationKeyId = locationColumns[0].id as string;
    const itemId = this.newItemId();
    async function postAv<T>(path: string, payload: unknown): Promise<T> {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`思源数据库接口请求失败：${response.status}`);
      const result = await response.json() as { code: number; msg?: string; data: T };
      if (result.code !== 0) throw new Error(result.msg || "思源数据库写入失败。");
      return result.data;
    }
    await postAv("/api/av/addAttributeViewBlocks", {
      avID, blockID: sourceId, srcs: [{ id: "", itemID: itemId, content: name, isDetached: true }],
    });
    try {
      await postAv("/api/av/setAttributeViewBlockAttr", {
        avID, keyID: locationKeyId, itemID: itemId,
        value: { type: "location", location: { name, latitude, longitude, originalInput: `${longitude},${latitude}` } },
      });
    } catch (error) {
      throw new Error(`已创建条目「${name}」，但位置写入失败：${error instanceof Error ? error.message : String(error)}。请到源数据库修改该条目，不要重复创建。`);
    }
    let valueId = "";
    try {
      const details = await postAv<Array<{ avID?: string; keyValues?: Array<{ key?: { type?: string }; values?: Array<{ blockID?: string; id?: string }> }> }>>(
        "/api/av/getAttributeViewKeys", { avID, itemID: itemId, id: itemId },
      );
      valueId = details?.find(table => table.avID === avID)?.keyValues
        ?.find(column => column.key?.type === "block")?.values?.find(value => value.blockID === itemId)?.id || "";
    } catch (error) {
      throw new Error(`已创建地点「${name}」，但无法读取新条目详情：${error instanceof Error ? error.message : String(error)}。请到来源数据库查看，不要重复创建。`);
    }
    if (!/^\d{14}-[a-z0-9]{7}$/.test(valueId)) {
      throw new Error(`已创建地点「${name}」，但未能读取条目详情 ID，请从来源数据库打开。`);
    }
    return { itemId, valueId, avID, databaseBlockID: sourceId, title: name };
  }
  /** Verify the active map source, view membership, keyID and itemID before any write. */
  private static async verifyMapItemTarget(
    mapBlockId: string,
    point: { itemId: string; avID: string; databaseBlockID: string },
    viewId?: string,
  ): Promise<{ avID: string; locationKeyID: string; isBound: boolean; locationRaw: string }> {
    const idPattern = /^\d{14}-[a-z0-9]{7}$/;
    if (![mapBlockId, point.itemId, point.avID, point.databaseBlockID].every(id => idPattern.test(id))) {
      throw new Error("数据库条目或地图块 ID 无效。");
    }
    if (viewId && !idPattern.test(viewId)) throw new Error("地图视图 ID 无效。");
    if (!viewId || !idPattern.test(viewId)) throw new Error("地图视图 ID 无效。");
    const viewEntry=(await DatabaseViewConfigStore.load(mapBlockId)).views[viewId];
    if(viewEntry?.mode!=="map"||!viewEntry.configs.map) throw new Error("当前数据库视图未启用地图模式。");
    const sourceId=mapBlockId;
    const coordinateColumn=viewEntry.configs.map.fieldMapping.coordinate;
    const { dom }=await getBlockDOM(sourceId);
    const activeAvID=(dom||"").match(/data-av-id="([^"]+)"/)?.[1]||"";
    if(!idPattern.test(activeAvID)||activeAvID!==point.avID)throw new Error("数据库 ID 已改变。");
    const view=await renderAttributeView({id:activeAvID,blockID:sourceId,viewID:viewId,pageSize:100000}) as AvRenderData;
    const table={...adaptAttributeViewRender(view),avID:activeAvID};
    if (sourceId !== point.databaseBlockID) {
      throw new Error("地图绑定的来源数据库已改变，请刷新地图后再操作。");
    }
    if (table.avID !== point.avID) {
      throw new Error("数据库 ID 不匹配，请重新打开地图后再操作。");
    }
    const itemIndex = table.rowBlockIds?.indexOf(point.itemId) ?? -1;
    if (itemIndex < 0) {
      throw new Error("该地点的数据库条目已不存在，或不在当前数据库视图中。");
    }
    const location = resolveFieldBinding(table, coordinateColumn, ["location"]);
    const columnIndex = location.status === "resolved" ? location.index : -1;
    if (columnIndex < 0 || table.fieldTypes[columnIndex] !== "location") {
      throw new Error("位置字段映射已改变，请在地图设置中重新选择原生位置列。");
    }
    const locationColumns = (view.view?.columns || []).filter(column =>
      location.status === "resolved" && column.id === location.id &&
      column.type === "location" && idPattern.test(column.id || ""),
    );
    if (locationColumns.length !== 1) throw new Error("无法唯一识别位置字段，请刷新数据库映射。");
    return { avID: point.avID, locationKeyID: locationColumns[0].id as string,
      isBound: Boolean(table.rowBoundBlockIds?.[itemIndex]),
      locationRaw: String(table.rows[itemIndex]?.[columnIndex] || "") ||
        (nativeLocationHasValue((
          (view.view?.rows?.length ? view.view.rows :
            (view.view?.groups || []).flatMap(group => group.rows || []))[itemIndex]
          ?.cells?.find(cell => cell.value?.keyID === locationColumns[0].id)
          ?.value?.location)) ? "原始位置单元格已有内容" : "") };
  }
  private static async mutateMapRow(path: string, body: unknown): Promise<void> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`思源数据库请求失败：HTTP ${response.status}`);
    const result = await response.json() as { code: number; msg?: string };
    if (result.code !== 0) throw new Error(result.msg || "思源数据库更新失败。");
  }

  /** 只更新位置列的经纬度，保留位置名称、主键名称及关联文档。 */
  static async correctPoint(
    mapBlockId: string,
    point: { itemId: string; avID: string; databaseBlockID: string },
    latitude: number,
    longitude: number,
    viewId?: string,
  ): Promise<void> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error("新位置经纬度无效，矫正已取消。");
    }
    const { avID, locationKeyID } = await this.verifyMapItemTarget(mapBlockId, point, viewId);
    await this.mutateMapRow("/api/av/setAttributeViewBlockAttr", {
      avID, keyID: locationKeyID, itemID: point.itemId,
      value: { type: "location", location: {
        latitude, longitude, originalInput: `${longitude},${latitude}`,
      } },
    });
    // The caller broadcasts an in-place marker correction after write success.
    // Avoid redundant map refresh and preserve the current viewport.
  }

  /** Write an EMPTY native location cell on an EXISTING AV item, never add a new item. */
  static async locateExistingItem(
    mapBlockId: string,
    point: { itemId: string; avID: string; databaseBlockID: string },
    latitude: number, longitude: number, viewId?: string,
  ): Promise<void> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
      throw new Error("定位坐标无效，已取消写入。");
    const { avID, locationKeyID, locationRaw } =
      await this.verifyMapItemTarget(mapBlockId, point, viewId);
    if (locationRaw.trim()) throw new Error("该条目已设置位置或包含无效坐标，请刷新后确认，不会覆盖原位置。");
    await this.mutateMapRow("/api/av/setAttributeViewBlockAttr", {
      avID, keyID: locationKeyID, itemID: point.itemId,
      value: {type: "location", location: {
        latitude, longitude, originalInput: `${longitude},${latitude}`,
      }},
    });
  }

  /** 删除 AV 条目及其位置单元格；已绑定文档只解除数据库绑定，不删除文档。 */
  static async deletePoint(
    mapBlockId: string,
    point: { itemId: string; avID: string; databaseBlockID: string },
    viewId?: string,
  ): Promise<void> {
    const { avID } = await this.verifyMapItemTarget(mapBlockId, point, viewId);
    await this.mutateMapRow("/api/av/removeAttributeViewBlocks", {
      avID, srcIDs: [point.itemId],
    });
  }
}
