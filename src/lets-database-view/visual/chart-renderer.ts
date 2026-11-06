import { databaseViewHost } from "../core/view-host";
import { renderAttributeView } from "../../shared/av/kernel-api";
import { adaptAttributeViewRender, type AvRenderData } from "../../shared/av/av-data-adapter";
import { EChartsGeneratorService } from "../../lets-custom-block/chart/echarts-generator";
import { chartPalette } from "../../lets-custom-block/chart/open-color-palettes";
import type { TableData } from "../../lets-custom-block/chart/types";
import type { VisualRenderBridge } from "./visual-render-bridge";

export async function renderChartView(av: HTMLElement, bridge: VisualRenderBridge): Promise<void> {
    const mounted = bridge.mounted().get(av);
    if (!bridge.enabled('chart') || !mounted || mounted.kind !== "chart" || !mounted.frame.isConnected) return;
    const target = mounted.frame.contentWindow;
    if (!target) return;
    const isCurrent = databaseViewHost.beginRead(mounted.frame);
    const send = (option: unknown, error?: string, darkColors?: string[]) => {
      if (isCurrent() && bridge.mounted().get(av) === mounted) target.postMessage({
        type: "dodoVisualChartOption", option, error, darkColors,
      }, location.origin);
    };
    try {
      const config = (await bridge.read(av.dataset.nodeId || ""))[mounted.viewId]?.chart || { type: "bar-basic" };
      const data = adaptAttributeViewRender(await renderAttributeView({
        id: av.dataset.avId || "", blockID: av.dataset.nodeId || "", viewID: mounted.viewId,
        pageSize: 100000, query: bridge.search(av),
      }) as AvRenderData);
      const table: TableData = {
        headers: data.headers, rows: data.rows, hasHeader: true,
        numericColumns: data.numericColumns, columnIds: data.columnIds,
        columnNames: data.columnNames, fieldTypes: data.fieldTypes,
      };
      if (!table.rows.length) { send(null, "当前视图没有可用记录"); return; }
      send(EChartsGeneratorService.generateOption(table, config.type || "bar-basic", config),
        undefined, chartPalette(config.style?.palette, true));
    } catch (error) { send(null, error instanceof Error ? error.message : String(error)); }
  
}
