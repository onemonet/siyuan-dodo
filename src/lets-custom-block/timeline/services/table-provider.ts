import { TimelineBlockConfig, TimelineTableData } from "../types";
import {
  adaptAttributeViewRender,
  AvRenderData,
} from "../../../shared/av/av-data-adapter";
import { getAttributeViewName, getBlockKramdown, renderAttributeView } from "../../../shared/av/kernel-api";
import { TimelineTableParserService } from "./table-parser";

/** renderAttributeView 单次取全量行的 pageSize（内核对超值会自行规整） */
const AV_FETCH_PAGE_SIZE = 100000;

export class TimelineTableProvider {
  static async load(
    blockId: string,
    config: TimelineBlockConfig
  ): Promise<TimelineTableData> {
    if (config.sourceType === "database" && config.sourceAvID) {
      return this.loadFromDatabase(config);
    }

    const sourceBlockId = config.sourceBlockId || blockId;
    const blockData = await getBlockKramdown(sourceBlockId);

    if (!blockData?.kramdown) {
      throw new Error("\u65e0\u6cd5\u52a0\u8f7d\u65f6\u95f4\u7ebf\u6e90\u5757\u3002");
    }

    return TimelineTableParserService.parseTableKramdown(blockData.kramdown);
  }

  /**
   * 数据库来源：按视图渲染后拍平为表格数据。
   * 视图过滤/排序在渲染结果中已生效；date 字段带结束值时
   * 适配器会追加「<字段名>·结束」虚拟列供结束时间映射。
   */
  private static async loadFromDatabase(
    config: TimelineBlockConfig
  ): Promise<TimelineTableData> {
    const payload = {
      id: config.sourceAvID as string,
      blockID: config.sourceBlockId,
      viewID: config.sourceViewID || undefined,
      query: config.sourceQuery || "",
      pageSize: AV_FETCH_PAGE_SIZE,
    };

    // An explicit missing view is an error; never substitute another view.
    const data: AvRenderData = await renderAttributeView(payload);

    // AV rendering does not always include the database-level name; read the
    // authoritative source from getAttributeView.av.name on every refresh.
    let sourceName = data.name?.trim() || "";
    try {
      sourceName = (await getAttributeViewName(payload.id)) || sourceName;
    } catch (error) {
      console.warn("[timeline-preview] Unable to query database name; using render fallback", error);
    }

    const adapted = adaptAttributeViewRender(data);
    if (adapted.rows.length === 0) {
      throw new Error("\u6e90\u6570\u636e\u5e93\u6ca1\u6709\u53ef\u7528\u7684\u884c\u3002");
    }

    return {
      // SiYuan renderAttributeView exposes the actual database name at top-level.
      // Do not use data.view?.name: that is the native view/tab title.
      sourceName: sourceName || undefined,
      headers: adapted.headers,
      columnIds: adapted.columnIds,
      columnNames: adapted.columnNames,
      fieldTypes: adapted.fieldTypes,
      rows: adapted.rows,
      rowBlockIds: adapted.rowBlockIds,
      rowBoundBlockIds: adapted.rowBoundBlockIds,
      rowValueIds: adapted.rowValueIds,
      hasHeader: true,
    };
  }
}
