import { showMessage } from "siyuan";
import { MapBlockService } from "./map-block-service";
import { DatabaseMapViews } from "./map-view-service";
import { openMapItem } from "./open-map-item";
import { getMapGlobalSettings } from "../global-settings";
import { databaseViewWrites } from "../core/view-write-coordinator";

/** Per-view message adapter; the module entry does not know map mutation
 * protocols or native coordinate validation details. */
export function createMapMessageHandler(mapViews: DatabaseMapViews): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (event.origin !== window.location.origin ||
        !event.data || typeof event.data !== "object") return;
    const source = event.source as Window | null;
    if (!source) return;
    const data = event.data;
    const context = mapViews.getFrameContext(source);
    if (!context) return;
    if (data.type === "dodoMapRequestSettings") {
      source.postMessage({ type: "dodoMapGlobalSettings", requestId: data.requestId,
        settings: getMapGlobalSettings() }, window.location.origin);
    } else if (data.type === "dodoMapAddModeState") {
      mapViews.setAddModeForFrame(source, data.enabled === true);
    } else if (data.type === "dodoMapOpenItem") {
      void openMapItem(data).catch((error) => {
        console.warn("[Dodo 数据库视图] 打开条目失败", error);
        showMessage(error instanceof Error ? error.message : "打开数据库条目失败。", 5000, "error");
      });
    } else if (data.type === "dodoMapMutatePoint") {
      // Native database maps share the standalone marker context menu, but
      // operations must be validated against the selected table view.
      const { requestId, action, point, longitude, latitude } = data;
      if (typeof requestId !== "string" || requestId.length > 120 ||
          (action !== "correct" && action !== "delete")) return;
      if (databaseViewWrites.isPending(context.blockId)) {
        source.postMessage({
          type: "dodoMapMutatePointResult", requestId, action, success: false,
          error: "当前地图正在处理其他操作，请稍后重试。",
        }, window.location.origin);
        return;
      }
      void (async () => {
        let correctionStarted = false;
        try {
          const idPattern = /^\d{14}-[a-z0-9]{7}$/;
          if (!point || typeof point !== "object" ||
              ![point.itemId, point.avID, point.databaseBlockID].every(
                id => typeof id === "string" && idPattern.test(id))) {
            throw new Error("地图操作参数不完整或数据库条目 ID 无效。");
          }
          if (point.databaseBlockID !== context.blockId) {
            throw new Error("地点不属于当前数据库，已取消操作。");
          }
          await databaseViewWrites.run({
            blockId: context.blockId, viewId: context.viewId,
            kind: "map", action, itemId: point.itemId,
          }, async () => {
            if (action === "correct") {
              mapViews.beginPointCorrection(context.blockId, context.viewId);
              correctionStarted = true;
              await MapBlockService.correctPoint(context.blockId, point, latitude, longitude, context.viewId);
            } else {
              await MapBlockService.deletePoint(context.blockId, point, context.viewId);
            }
          });
          source.postMessage({
            type: "dodoMapMutatePointResult", requestId, action, success: true,
            ...(action === "correct" ? { itemId: point.itemId, latitude, longitude } : {}),
          }, window.location.origin);
          if (action === "correct") {
            mapViews.broadcastPointCorrection(context.blockId, point.itemId,
              latitude, longitude, source);
          } else {
            mapViews.refreshFrames(); // Remove deleted points from all views.
          }
        } catch (error) {
          source.postMessage({
            type: "dodoMapMutatePointResult", requestId, action, success: false,
            error: error instanceof Error ? error.message : "地图地点操作失败。",
          }, window.location.origin);
        } finally {
          if (correctionStarted) mapViews.finishPointCorrection(context.blockId, context.viewId);
        }
      })();
    } else if (data.type === "dodoMapLocateExisting") {
      const {requestId, point, longitude, latitude} = data;
      if (typeof requestId !== "string" || requestId.length > 120) return;
      const reply = (success: boolean, error?: string) => source.postMessage({
        type: "dodoMapLocateExistingResult", requestId, success, ...(error ? {error} : {}),
      }, window.location.origin);
      if (databaseViewWrites.isPending(context.blockId)) {
        reply(false, "当前数据库正在执行其他写入，请稍后重试。");
        return;
      }
      void (async () => {
        try {
          const idPattern = /^\d{14}-[a-z0-9]{7}$/;
          if (!point || typeof point !== "object" ||
              ![point.itemId, point.avID, point.databaseBlockID].every(
                id => typeof id === "string" && idPattern.test(id)) ||
              point.databaseBlockID !== context.blockId)
            throw new Error("定位目标不是当前数据库的有效条目。");
          if (typeof longitude !== "number" || typeof latitude !== "number" ||
              !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
              Math.abs(longitude) > 180 || Math.abs(latitude) > 90)
            throw new Error("定位坐标无效。");
          await databaseViewWrites.run({
            blockId: context.blockId, viewId: context.viewId,
            kind: "map", action: "locate-existing", itemId: point.itemId,
          }, () => MapBlockService.locateExistingItem(
            context.blockId, point, latitude, longitude, context.viewId));
          reply(true);
          mapViews.refreshFrames(); // New point belongs in the marker layer.
        } catch (error) {
          reply(false, error instanceof Error ? error.message : "添加位置失败。");
        }
      })();
    } else if (data.type === "dodoMapCreatePoint") {
      const requestId = data.requestId;
      if (databaseViewWrites.isPending(context.blockId)) {
        source.postMessage({ type: "dodoMapCreatePointResult", requestId, success: false,
          error: "当前数据库正在处理其他操作，请稍后重试。" }, window.location.origin);
        return;
      }
      void (async () => {
        let created = false;
        try {
          const { name, longitude, latitude } = data;
          if (typeof name !== "string" || typeof longitude !== "number" || typeof latitude !== "number") {
            throw new Error("地点名称或坐标格式不正确。");
          }
          const point = await databaseViewWrites.run({
            blockId: context.blockId, viewId: context.viewId, kind: "map", action: "create",
          }, () => mapViews.createPointForFrame(source, { name, longitude, latitude }));
          created = true;
          source.postMessage({ type: "dodoMapCreatePointResult", requestId, success: true }, window.location.origin);
          await openMapItem(point);
        } catch (error) {
          const message = error instanceof Error ? error.message : "创建地点失败。";
          source.postMessage({ type: "dodoMapCreatePointResult", requestId, success: false, error: message }, window.location.origin);
          if (created || message.startsWith("已创建")) {
            source.postMessage({ type: "dodoMapSetAddMode", enabled: false }, window.location.origin);
            showMessage(created ? `地点已创建，但打开详情失败：${message}` : message, 6500, "error");
          }
        }
      })();
    }
  };
}
