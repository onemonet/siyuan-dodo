import { DataValidatorService } from "./data-validator";
import { chartPalette } from "./open-color-palettes";
import { resolveFieldBinding, SIYUAN_KEY_ID } from "../../shared/av/field-binding";
import { CHART_RECORD_COUNT, effectiveChartAggregation } from "./y-axis-fields";
import {
  ChartAggregation,
  ChartBlockConfig,
  EChartsOptionLike,
  EChartsSeriesItem,
  isEmptyChartConfig,
  SupportedChartType,
  TableData,
} from "./types";

/** Open Color based palettes shared by chart blocks and native database charts. */
export const PALETTE_CONFIGS: Record<string, { label: string; colors: string[]; darkColors: string[] }> =
  Object.fromEntries(([
    ["colorful", "彩色"], ["bw", "黑白"], ["blue", "蓝色"], ["yellow", "黄色"],
    ["green", "绿色"], ["purple", "紫色"], ["teal", "蓝绿色"],
    ["orange", "橙色"], ["pink", "粉色"], ["red", "红色"],
  ] as const).map(([key, label]) => [key, {
    label, colors: chartPalette(key), darkColors: chartPalette(key, true),
  }]));
interface CartesianSpec {
  seriesType: "bar" | "line";
  useAreaStyle: boolean;
  smooth: boolean;
  stack: boolean;
  /** 条形图：值轴在 X，类别轴在 Y */
  horizontal?: boolean;
}

export class EChartsGeneratorService {
  static generateOption(
    tableData: TableData,
    chartType: SupportedChartType,
    config?: ChartBlockConfig,
    isDark = false,
  ): EChartsOptionLike {
    const hasConfig = !isEmptyChartConfig(config);
    // Native AV charts only use stored keyIDs after the one-time initializer.
    // Keep legacy heuristic charting intact for plain Markdown tables.
    if (tableData.fieldTypes?.length && tableData.columnIds?.some(Boolean) && chartType !== "radar-basic") {
      for (const [label, field] of [["X 轴", config?.x], ["Y 轴", config?.y]] as const) {
        const stored = "column" in (field || {}) ? field?.column : undefined;
        if (stored === "" || (stored && stored !== CHART_RECORD_COUNT && !SIYUAN_KEY_ID.test(stored))) {
          throw new Error(`${label}必须绑定数据库真实字段 keyID，请在设置中重新选择。`);
        }
      }
    }
    const option = this.buildBaseOption(tableData, chartType, config, hasConfig);
    return this.applyPalette(option, config, isDark);
  }

  private static buildBaseOption(
    tableData: TableData,
    chartType: SupportedChartType,
    config: ChartBlockConfig | undefined,
    hasConfig: boolean
  ): EChartsOptionLike {
    switch (chartType) {
      case "pie-basic":
        return this.buildPieOption(tableData, config, hasConfig);
      case "funnel-basic":
        return this.buildFunnelOption(tableData, config, hasConfig);
      case "scatter-basic":
        return this.buildScatterOption(tableData, config);
      case "radar-basic":
        return this.buildRadarOption(tableData);
      case "area-basic":
        return this.buildCartesianOption(
          tableData,
          { seriesType: "line", useAreaStyle: true, smooth: false, stack: false },
          config,
          hasConfig
        );
      case "area-stack":
        return this.buildCartesianOption(
          tableData,
          { seriesType: "line", useAreaStyle: true, smooth: false, stack: true },
          config,
          hasConfig
        );
      case "line-smooth":
        return this.buildCartesianOption(
          tableData,
          { seriesType: "line", useAreaStyle: false, smooth: true, stack: false },
          config,
          hasConfig
        );
      case "line-stack":
        return this.buildCartesianOption(
          tableData,
          { seriesType: "line", useAreaStyle: false, smooth: false, stack: true },
          config,
          hasConfig
        );
      case "line-basic":
        return this.buildCartesianOption(
          tableData,
          { seriesType: "line", useAreaStyle: false, smooth: false, stack: false },
          config,
          hasConfig
        );
      case "hbar-basic":
        return this.buildCartesianOption(
          tableData,
          { seriesType: "bar", useAreaStyle: false, smooth: false, stack: false, horizontal: true },
          config,
          hasConfig
        );
      case "bar-basic":
      default:
        return this.buildCartesianOption(
          tableData,
          { seriesType: "bar", useAreaStyle: false, smooth: false, stack: false },
          config,
          hasConfig
        );
    }
  }

  /** 漏斗：结构与饼图一致，默认按数值从大到小排列 */
  private static buildFunnelOption(
    tableData: TableData,
    config: ChartBlockConfig | undefined,
    _hasConfig: boolean
  ): EChartsOptionLike {
    const effectiveConfig: ChartBlockConfig = {
      ...config,
      x: { ...config?.x, sort: config?.x?.sort ?? "value-desc" },
      y: { ...config?.y },
    };
    const option = this.buildPieOption(tableData, effectiveConfig, true);
    option.series = option.series.map((item) => ({
      ...item,
      type: "funnel",
    })) as EChartsSeriesItem[];
    return option;
  }

  static stringifyOption(option: EChartsOptionLike): string {
    const serialized = JSON.stringify(option, null, 2)
      .replace(/"([^"\\]+)":/g, "$1:")
      .replace(/"([^"]+)"/g, (_, value) => `'${value.replace(/'/g, "\\'")}'`);

    return `\`\`\`echarts\n${serialized}\n\`\`\``;
  }

  private static applyPalette(
    option: EChartsOptionLike,
    config: ChartBlockConfig | undefined,
    isDark: boolean,
  ): EChartsOptionLike {
    // "auto" now deliberately uses Open Color rather than saturated ECharts defaults.
    option.color = chartPalette(config?.style?.palette, isDark);
    return option;
  }

  private static resolveColumnIndex(
    columnName: string | undefined,
    tableData: TableData,
    fallback: number
  ): number {
    if (!columnName) {
      return fallback;
    }
    if (tableData.fieldTypes?.length && tableData.columnIds?.some(Boolean) && !SIYUAN_KEY_ID.test(columnName)) {
      throw new Error("数据库图表字段只允许使用已保存的 keyID，请在设置中重新选择。");
    }
    const resolution = resolveFieldBinding(tableData, columnName);
    if (resolution.status !== "resolved") {
      throw new Error(`图表字段映射无法唯一定位：${columnName}（${resolution.status}），请在设置中重新选择。`);
    }
    return resolution.index;
  }

  private static aggregate(values: number[], agg: ChartAggregation): number {
    if (values.length === 0) {
      return 0;
    }
    switch (agg) {
      case "value":
        return values[0];
      case "avg":
        return values.reduce((acc, cur) => acc + cur, 0) / values.length;
      case "median": {
        const ordered = [...values].sort((a, b) => a - b);
        const mid = Math.floor(ordered.length / 2);
        return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
      }
      case "distinct":
        return new Set(values).size;
      case "max":
        return Math.max(...values);
      case "min":
        return Math.min(...values);
      case "sum":
      default:
        return values.reduce((acc, cur) => acc + cur, 0);
    }
  }

  /** Aggregate only the explicitly selected Y column. Empty cells do not count as zero. */
  private static aggregateCells(values: string[], agg: ChartAggregation): number {
    const nonempty = values.map(value => (value ?? "").trim()).filter(Boolean);
    if (agg === "distinct") return new Set(nonempty).size;
    if (agg === "count") return nonempty.length;
    if (agg === "checked") return nonempty.filter(value => value === "true").length;
    const numeric = nonempty.filter(value => DataValidatorService.isNumeric(value))
      .map(value => DataValidatorService.toNumber(value));
    return this.aggregate(numeric, agg);
  }

  private static buildCartesianOption(
    tableData: TableData,
    spec: CartesianSpec,
    config: ChartBlockConfig | undefined,
    hasConfig: boolean
  ): EChartsOptionLike {
    const horizontal = spec.horizontal === true;

    if (!hasConfig) {
      // 兼容旧流程：未配置任何设置时保持原有行为（每行一个类别，逐列一条系列）
      const categories = tableData.rows.map((row) => row[0]);
      const series = this.buildLegacySeries(tableData, spec);
      return this.assembleCartesianOption(categories, series, spec, {
        categoryName: tableData.headers[0] || "",
      });
    }

    const xIndex = this.resolveColumnIndex(config?.x?.column, tableData, 0);
    const selectedRecordCount = config?.y?.column === CHART_RECORD_COUNT;
    const selectedY = selectedRecordCount ? -2 : config?.y?.column
      ? this.resolveColumnIndex(config.y.column, tableData, -1) : -1;
    const agg = selectedRecordCount ? "count" : selectedY >= 0
      ? effectiveChartAggregation(config!.y!.column!, tableData.fieldTypes?.[selectedY] || "", config?.y?.agg)
      : config?.y?.agg ?? "sum";
    const sort = config?.x?.sort ?? "none";
    const ignoreZero = config?.x?.ignoreZero ?? false;
    const extraYColumns = config?.y?.columns || [];
    const multiYIndexes: number[] = [];
    if (extraYColumns.length) {
      if (selectedY < 0 || tableData.fieldTypes?.[selectedY] !== "number") {
        throw new Error("多系列 Y 轴需要以数字列作为第一列。");
      }
      const seen = new Set<number>([selectedY]);
      for (const id of extraYColumns) {
        const index = this.resolveColumnIndex(id, tableData, -1);
        if (seen.has(index)) throw new Error("Y 轴不能重复选择同一数值列。");
        if (index === xIndex) throw new Error("Y 轴不能与 X 轴选择相同字段。");
        if (tableData.fieldTypes?.[index] !== "number") throw new Error("多系列 Y 轴只支持数字列。");
        seen.add(index);
        multiYIndexes.push(index);
      }
    }
    // Multiple metrics are already separate chart series, not a second group-by dimension.
    const groupBy = multiYIndexes.length ? null : config?.y?.groupBy;
    // Missing Y mapping on existing blocks retains the legacy multi-series path.
    if (selectedY === xIndex) throw new Error("Y 轴数据列不能与 X 轴分类列相同。");

    // 按类别聚合：同名类别合并为一项
    const categoryOrder: string[] = [];
    const rowsByCategory = new Map<string, string[][]>();
    tableData.rows.forEach((row) => {
      const category = row[xIndex] ?? "";
      if (!rowsByCategory.has(category)) {
        rowsByCategory.set(category, []);
        categoryOrder.push(category);
      }
      rowsByCategory.get(category)!.push(row);
    });

    let seriesDefs: Array<{ name: string; values: number[] }> = [];
    const groupIndex = groupBy
      ? this.resolveColumnIndex(groupBy, tableData, -1)
      : -1;

    if (groupIndex >= 0 && groupIndex !== xIndex) {
      // Grouping uses exactly the selected Y field; old charts without one keep the former heuristic.
      const valueIndex = selectedY >= 0 ? selectedY : this.pickValueColumn(tableData, xIndex, groupIndex);
      if (selectedY === groupIndex) throw new Error("Y 轴数据列不能与分组列相同。");
      const groupOrder: string[] = [];
      const valuesByGroup = new Map<string, Map<string, string[]>>();
      tableData.rows.forEach((row) => {
        const group = row[groupIndex] ?? "";
        const category = row[xIndex] ?? "";
        if (!valuesByGroup.has(group)) {
          valuesByGroup.set(group, new Map());
          groupOrder.push(group);
        }
        const byCategory = valuesByGroup.get(group)!;
        if (!byCategory.has(category)) {
          byCategory.set(category, []);
        }
        byCategory.get(category)!.push(row[valueIndex] ?? "");
      });
      seriesDefs = groupOrder.map((group) => ({
        name: group,
        values: categoryOrder.map((category) =>
          selectedY >= 0
            ? this.aggregateCells(valuesByGroup.get(group)?.get(category) ?? [], agg)
            : selectedRecordCount ? (valuesByGroup.get(group)?.get(category) ?? []).length
            : this.aggregate((valuesByGroup.get(group)?.get(category) ?? []).map(value => DataValidatorService.toNumber(value)), agg)
        ),
      }));
    } else if (multiYIndexes.length) {
      for (const index of [selectedY, ...multiYIndexes]) {
        seriesDefs.push({
          name: tableData.headers[index] || `指标${index + 1}`,
          values: categoryOrder.map(category =>
            this.aggregateCells((rowsByCategory.get(category) ?? []).map(row => row[index] ?? ""), agg)
          ),
        });
      }
    } else if (selectedRecordCount) {
      seriesDefs.push({
        name: "记录数量", values: categoryOrder.map(category => (rowsByCategory.get(category) ?? []).length),
      });
    } else if (selectedY >= 0) {
      seriesDefs.push({
        name: tableData.headers[selectedY] || "指标",
        values: categoryOrder.map(category =>
          this.aggregateCells((rowsByCategory.get(category) ?? []).map(row => row[selectedY] ?? ""), agg)
        ),
      });
    } else {
      const columnCount = Math.max(
        tableData.headers.length,
        ...tableData.rows.map((row) => row.length)
      );
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        if (columnIndex === xIndex) {
          continue;
        }
        seriesDefs.push({
          name: tableData.headers[columnIndex] || `系列${columnIndex}`,
          values: categoryOrder.map((category) =>
            this.aggregate(
              (rowsByCategory.get(category) ?? []).map(
                (row) => DataValidatorService.toNumber(row[columnIndex] ?? "0")
              ),
              agg
            )
          ),
        });
      }
    }

    // 忽略零值：过滤所有系列都为 0 的类别
    let activeIndexes = categoryOrder.map((_, index) => index);
    if (ignoreZero) {
      activeIndexes = activeIndexes.filter((index) =>
        seriesDefs.some((seriesDef) => (seriesDef.values[index] ?? 0) !== 0)
      );
    }

    // 排序
    const totals = categoryOrder.map((_, index) =>
      seriesDefs.reduce((acc, seriesDef) => acc + (seriesDef.values[index] ?? 0), 0)
    );
    if (sort === "value-desc") {
      activeIndexes.sort((a, b) => totals[b] - totals[a]);
    } else if (sort === "value-asc") {
      activeIndexes.sort((a, b) => totals[a] - totals[b]);
    } else if (sort === "name") {
      activeIndexes.sort((a, b) =>
        String(categoryOrder[a]).localeCompare(String(categoryOrder[b]), "zh-Hans-CN", {
          numeric: true,
        })
      );
    }

    const categories = activeIndexes.map((index) => categoryOrder[index]);
    const series = seriesDefs.map((seriesDef) => ({
      name: seriesDef.name,
      type: spec.seriesType,
      data: activeIndexes.map((index) => seriesDef.values[index] ?? 0),
      ...(spec.useAreaStyle ? { areaStyle: {} } : {}),
      ...(spec.smooth ? { smooth: true } : {}),
      ...(spec.stack ? { stack: "total" } : {}),
    } as EChartsSeriesItem));

    // 参考线挂在第一条系列上，横跨绘图区（字符串模板，保证可被 JSON 序列化）
    const markLines = (config?.y?.markLines ?? []).filter(
      (markLine) => Number.isFinite(markLine.value)
    );
    if (markLines.length > 0 && series.length > 0) {
      series[0].markLine = {
        silent: true,
        symbol: "none",
        lineStyle: { type: "dashed" },
        label: { formatter: "{b}", position: horizontal ? "insideEndTop" : "end" },
        data: markLines.map((markLine) =>
          horizontal
            ? { xAxis: markLine.value, name: markLine.label || `${markLine.value}` }
            : { yAxis: markLine.value, name: markLine.label || `${markLine.value}` }
        ),
      };
    }

    return this.assembleCartesianOption(categories, series, spec, {
      categoryName: tableData.headers[xIndex] || "",
      valueRange: config?.y?.range ?? null,
      markLines: markLines.length > 0,
      showBarValues: config?.style?.showBarValues !== false,
    });
  }

  private static assembleCartesianOption(
    categories: string[],
    series: EChartsSeriesItem[],
    spec: CartesianSpec,
    extras: {
      categoryName: string;
      valueRange?: { min?: number | null; max?: number | null } | null;
      markLines?: boolean;
      showBarValues?: boolean;
    }
  ): EChartsOptionLike {
    const horizontal = spec.horizontal === true;
    const valueAxis: Record<string, any> = { type: "value" };
    const range = extras.valueRange;
    if (range && (Number.isFinite(range.min) || Number.isFinite(range.max))) {
      if (Number.isFinite(range.min)) {
        valueAxis.min = range.min;
      }
      if (Number.isFinite(range.max)) {
        valueAxis.max = range.max;
      }
    }
    const categoryAxis: Record<string, any> = {
      type: "category",
      data: categories,
      name: extras.categoryName || undefined,
      axisLabel: horizontal
        ? { interval: 0, width: 160, overflow: "break", lineHeight: 16, fontSize: 12 }
        : {
            // ECharts defaults to interval="auto", silently skipping X-axis labels.
            // Show every name and wrap long labels rather than hiding categories.
            interval: 0,
            hideOverlap: false,
            width: Math.min(120, Math.max(52, Math.floor(900 / Math.max(categories.length, 1)) - 12)),
            overflow: "break",
            lineHeight: 16,
            fontSize: 12,
            margin: 12,
          },
    };

    const displaySeries = spec.seriesType === "bar"
      ? series.map((item) => ({
          ...item,
          label: {
            show: extras.showBarValues !== false,
            position: horizontal ? "right" : "top",
            distance: 4,
            formatter: "{c}",
            fontSize: 11,
          },
        })) : series;

    return {
      tooltip: { trigger: "axis" },
      // Contain wrapped category labels inside the plot rather than clipping them.
      grid: {
        left: horizontal ? 32 : 48,
        right: horizontal ? 72 : 36,
        top: 60,
        bottom: horizontal ? 52 : 100,
        containLabel: true,
      },
      legend: {
        data: series.map((item) => item.name || ""),
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: displaySeries,
    };
  }

  private static buildLegacySeries(
    tableData: TableData,
    spec: CartesianSpec
  ): EChartsSeriesItem[] {
    const startColumn = 1;
    const columnCount = Math.max(
      tableData.headers.length,
      ...tableData.rows.map((row) => row.length)
    );
    const series: EChartsSeriesItem[] = [];

    for (let columnIndex = startColumn; columnIndex < columnCount; columnIndex += 1) {
      const data = tableData.rows.map((row) =>
        DataValidatorService.toNumber(row[columnIndex] ?? "0")
      );

      series.push({
        name: tableData.headers[columnIndex] || `系列${columnIndex}`,
        type: spec.seriesType,
        data,
        ...(spec.useAreaStyle ? { areaStyle: {} } : {}),
        ...(spec.smooth ? { smooth: true } : {}),
        ...(spec.stack ? { stack: "total" } : {}),
      } as EChartsSeriesItem);
    }

    return series;
  }

  private static pickValueColumn(
    tableData: TableData,
    xIndex: number,
    groupIndex: number
  ): number {
    const columnCount = Math.max(
      tableData.headers.length,
      ...tableData.rows.map((row) => row.length)
    );
    let fallback = -1;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      if (columnIndex === xIndex || columnIndex === groupIndex) {
        continue;
      }
      if (fallback < 0) {
        fallback = columnIndex;
      }
      if (tableData.numericColumns.includes(columnIndex)) {
        return columnIndex;
      }
    }
    return fallback >= 0 ? fallback : 1;
  }

  private static buildPieOption(
    tableData: TableData,
    config: ChartBlockConfig | undefined,
    hasConfig: boolean
  ): EChartsOptionLike {
    if (!hasConfig) {
      const data = tableData.rows.map((row) => ({
        name: row[0],
        value: DataValidatorService.toNumber(row[1] ?? "0"),
      }));

      return {
        tooltip: { trigger: "item" },
        legend: {
          data: data.map((item) => item.name),
        },
        series: [
          {
            name: tableData.headers[1] || "数值",
            type: "pie",
            data,
          },
        ],
      };
    }

    const xIndex = this.resolveColumnIndex(config?.x?.column, tableData, 0);
    const countRows = config?.y?.column === CHART_RECORD_COUNT;
    const valueIndex = countRows ? -2 : config?.y?.column
      ? this.resolveColumnIndex(config.y.column, tableData, -1)
      : this.pickValueColumn(tableData, xIndex, -1);
    if (valueIndex === xIndex) throw new Error("数值字段不能与分类字段相同。");
    const agg = countRows ? "count" : valueIndex >= 0 && config?.y?.column
      ? effectiveChartAggregation(config.y.column, tableData.fieldTypes?.[valueIndex] || "", config.y.agg)
      : config?.y?.agg ?? "sum";
    const sort = config?.x?.sort ?? "none";
    const ignoreZero = config?.x?.ignoreZero ?? false;

    const categoryOrder: string[] = [];
    const rowsByCategory = new Map<string, string[][]>();
    tableData.rows.forEach((row) => {
      const category = row[xIndex] ?? "";
      if (!rowsByCategory.has(category)) {
        rowsByCategory.set(category, []);
        categoryOrder.push(category);
      }
      rowsByCategory.get(category)!.push(row);
    });

    let data = categoryOrder.map((category) => ({
      name: category,
      value: countRows ? (rowsByCategory.get(category) ?? []).length
        : config?.y?.column
        ? this.aggregateCells((rowsByCategory.get(category) ?? []).map(row => row[valueIndex] ?? ""), agg)
        : this.aggregate((rowsByCategory.get(category) ?? []).map(row => DataValidatorService.toNumber(row[valueIndex] ?? "0")), agg),
    }));

    if (ignoreZero) {
      data = data.filter((item) => item.value !== 0);
    }
    if (sort === "value-desc") {
      data.sort((a, b) => b.value - a.value);
    } else if (sort === "value-asc") {
      data.sort((a, b) => a.value - b.value);
    } else if (sort === "name") {
      data.sort((a, b) =>
        String(a.name).localeCompare(String(b.name), "zh-Hans-CN", { numeric: true })
      );
    }

    return {
      tooltip: { trigger: "item" },
      legend: {
        data: data.map((item) => item.name),
      },
      series: [
        {
          name: tableData.headers[valueIndex] || "数值",
          type: "pie",
          data,
        },
      ],
    };
  }

  private static buildScatterOption(tableData: TableData, config?: ChartBlockConfig): EChartsOptionLike {
    const xIndex = this.resolveColumnIndex(config?.x?.column, tableData, 0);
    const yIndex = this.resolveColumnIndex(config?.y?.column, tableData, 1);
    if (xIndex === yIndex) throw new Error("散点图的 X 轴和 Y 轴不能选择相同字段。");
    const third = Array.from({ length: tableData.headers.length }, (_, i) => i)
      .find(i => i >= 2 && i !== xIndex && i !== yIndex);
    const grouped = new Map<string, number[][]>();

    tableData.rows.forEach((row) => {
      const groupName = (third !== undefined ? row[third] : "") || "散点";
      const point = [
        DataValidatorService.toNumber(row[xIndex] ?? "0"),
        DataValidatorService.toNumber(row[yIndex] ?? "0"),
      ];

      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
      }
      grouped.get(groupName)?.push(point);
    });

    return {
      tooltip: { trigger: "item" },
      xAxis: {
        type: "value",
        name: tableData.headers[xIndex] || "X",
      },
      yAxis: {
        type: "value",
        name: tableData.headers[yIndex] || "Y",
      },
      legend: {
        data: Array.from(grouped.keys()),
      },
      series: Array.from(grouped.entries()).map(([name, data]) => ({
        name,
        type: "scatter",
        data,
      })),
    };
  }

  private static buildRadarOption(tableData: TableData): EChartsOptionLike {
    const indicators = tableData.headers.slice(1).map((header, index) => ({
      name: header,
      max: Math.max(
        ...tableData.rows.map((row) => DataValidatorService.toNumber(row[index + 1] ?? "0"))
      ),
    }));

    return {
      tooltip: { trigger: "item" },
      legend: {
        data: tableData.rows.map((row) => row[0]),
      },
      radar: {
        indicator: indicators,
      },
      series: [
        {
          type: "radar",
          data: tableData.rows.map((row) => ({
            name: row[0],
            value: row.slice(1).map((cell) => DataValidatorService.toNumber(cell)),
          })) as any,
        },
      ],
    };
  }
}
