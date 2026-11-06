import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {
  const { EChartsGeneratorService: generator } = await server.ssrLoadModule("/src/lets-custom-block/chart/echarts-generator.ts");
  const { adaptAttributeViewRender } = await server.ssrLoadModule("/src/shared/av/av-data-adapter.ts");
  const { CHART_RECORD_COUNT, chartYKind, effectiveChartAggregation, chartAggregationIsFixed,
    defaultChartAggregation, chartFieldTypeLabel } = await server.ssrLoadModule("/src/lets-custom-block/chart/y-axis-fields.ts");
  const ids = ["20261018100000-aaaaaaa", "20261018100000-bbbbbbb", "20261018100000-ccccccc", "20261018100000-ddddddd"];
  const table = {
    headers: ["名称", "指标", "指标2", "类别"], columnIds: ids, columnNames: ["名称", "指标", "指标2", "类别"],
    fieldTypes: ["block", "number", "number", "select"], numericColumns: [1, 2], hasHeader: true,
    rows: [
      ["A", "10", "100", "一组"],
      ["A", "20", "200", "一组"],
      ["A", "20", "300", "二组"],
      ["B", "5", "400", "一组"],
      ["B", "", "500", "二组"],
    ],
  };
  const getOption = (agg, column=ids[1], type="bar-basic", groupBy) => generator.generateOption(table, type, {
    x: { column: ids[0] }, y: { column, agg, ...(groupBy ? { groupBy } : {}) },
  });
  const expected = [
    ["value", [10, 5]], ["sum", [50, 5]], ["avg", [50/3, 5]],
    ["min", [10, 5]], ["max", [20, 5]], ["median", [20, 5]],
    ["distinct", [2, 1]],
  ];
  for (const [agg, output] of expected) {
    const chart = getOption(agg);
    assert.equal(chart.series.length, 1, `Y axis ${agg} should emit just the selected column`);
    assert.equal(chart.series[0].name, "指标");
    chart.series[0].data.forEach((value, i) => assert.ok(Math.abs(value - output[i]) < 1e-8, `${agg} item ${i}: ${value}`));
    const pie = getOption(agg, ids[1], "pie-basic");
    assert.deepEqual(pie.series[0].data.map(row => row.value).map(v => Number(v.toFixed(6))), output.map(v => Number(v.toFixed(6))), `Pie ${agg}`);
  }
  assert.deepEqual(getOption("sum", ids[2]).series[0].data, [600, 900],
    "Must use the explicitly selected second numeric field, not the first numeric field");
  assert.deepEqual(getOption("distinct", ids[3]).series[0].data, [3, 2],
    "Notion-style nonnumeric fields use fixed count even when an old saved config says distinct");
  // Multiple numeric Y columns should become parallel independent series on Cartesian charts.
  for (const type of ["bar-basic", "hbar-basic", "line-basic", "line-smooth", "line-stack", "area-basic", "area-stack"]) {
    const config = { x: { column: ids[0] }, y: { column: ids[1], columns: [ids[2]], agg: "sum" } };
    const option = generator.generateOption(table, type, config);
    assert.deepEqual(option.series.map(item => item.name), ["指标", "指标2"], `Series names for ${type}`);
    assert.deepEqual(option.series.map(item => item.data), [[50, 5], [600, 900]], `Per-column sums for ${type}`);
    assert.deepEqual(option.legend.data, ["指标", "指标2"], `Legend for ${type}`);
  }
  const multiMedian = generator.generateOption(table, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[2]], agg: "median" },
  });
  assert.deepEqual(multiMedian.series.map(item => item.data), [[20, 5], [200, 450]],
    "Every selected column uses the shared median aggregation independently");
  const multiAvg = generator.generateOption(table, "line-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[2]], agg: "avg", groupBy: ids[3] },
  });
  assert.deepEqual(multiAvg.series.map(item => item.data), [[50/3, 5], [200, 450]],
    "When multiple Y metrics are selected, chart uses those series rather than groupBy");
  const pieSingle = generator.generateOption(table, "pie-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[2]], agg: "sum" },
  });
  assert.equal(pieSingle.series.length, 1, "Pie continues to use the primary Y only");
  assert.deepEqual(pieSingle.series[0].data.map(item => item.value), [50, 5]);
  const scatterSingle = generator.generateOption(table, "scatter-basic", {
    x: { column: ids[2] }, y: { column: ids[1], columns: [ids[2]], agg: "value" },
  });
  assert.equal(scatterSingle.yAxis.name, "指标", "Scatter ignores additional Y metrics");
  assert.throws(() => generator.generateOption(table, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[1]], agg: "sum" },
  }), /重复选择/);
  assert.throws(() => generator.generateOption(table, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[0]], agg: "sum" },
  }), /不能与 X 轴/);
  assert.throws(() => generator.generateOption(table, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[3]], agg: "sum" },
  }), /只支持数字列/);
  assert.throws(() => generator.generateOption(table, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: ["20261018100000-zzzzzzz"], agg: "sum" },
  }), /无法唯一定位/, "Stale second keyID must not silently bind to a replacement");
  const oldSingle = getOption("sum");
  assert.deepEqual(oldSingle.series.map(item => item.name), ["指标"], "Existing single-series charts unchanged");

  // Bars must print each series' value by default; labels are configurable per chart.
  const bar = generator.generateOption(table, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[2]], agg: "sum" },
  });
  assert.ok(bar.series.every(item => item.label?.show && item.label?.position === "top"
    && item.label?.formatter === "{c}"), "Every vertical bar series shows actual values on top");
  const horizontal = generator.generateOption(table, "hbar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[2]], agg: "sum" },
  });
  assert.ok(horizontal.series.every(item => item.label?.show && item.label?.position === "right"),
    "Horizontal bars show values at bar ends");
  const hidden = generator.generateOption(table, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], columns: [ids[2]], agg: "sum" },
    style: { showBarValues: false },
  });
  assert.ok(hidden.series.every(item => item.label?.show === false), "Saved toggle hides all bar labels");
  const oldBar = generator.generateOption(table, "bar-basic");
  assert.ok(oldBar.series.every(item => item.label?.show), "Legacy chart without a config shows bar values too");
  const line = generator.generateOption(table, "line-basic", {
    x: { column: ids[0] }, y: { column: ids[1], agg: "sum" },
  });
  assert.ok(line.series.every(item => item.label === undefined), "Line series labels remain unchanged");
  const names = ["杭州西湖", "黄山北站（交通）", "景德镇陶阳里历史文化街区", "婺源篁岭", "长名字分类更多测试", "其它分类", "又一个分类", "最后的分类"];
  const many = { ...table, rows: names.map((name, i) => [name, String(i + 1), String(i * 2), "一组"]) };
  const manyOption = generator.generateOption(many, "bar-basic", {
    x: { column: ids[0] }, y: { column: ids[1], agg: "sum" },
  });
  assert.deepEqual(manyOption.xAxis.data, names, "All category names remain in chart data");
  assert.equal(manyOption.xAxis.axisLabel.interval, 0, "Do not skip alternate X labels automatically");
  assert.equal(manyOption.xAxis.axisLabel.overflow, "break", "Long category names should wrap");
  assert.ok(manyOption.xAxis.axisLabel.width >= 52, "Wrapped text needs a measured width");
  assert.equal(manyOption.grid.containLabel, true, "Reserve space for wrapped category labels");
  assert.equal(horizontal.yAxis.axisLabel.interval, 0, "Horizontal category labels must not skip entries");

  const grouped = getOption("sum", ids[1], "bar-basic", ids[3]);
  assert.deepEqual(grouped.series.map(item => [item.name, item.data]), [["一组", [30, 5]], ["二组", [20, 0]]]);
  const groupedMedian = getOption("median", ids[1], "bar-basic", ids[3]);
  assert.deepEqual(groupedMedian.series.map(item => [item.name, item.data]), [["一组", [15, 5]], ["二组", [20, 0]]]);
  assert.throws(() => getOption("sum", "20261018100000-zzzzzzz"), /无法唯一定位/,
    "Deleted column keyIDs must never bind by guessing another column");
  assert.throws(() => getOption("sum", ids[0]), /不能与 X 轴/,
    "Y column must differ from the category field");
  const scatter = generator.generateOption(table, "scatter-basic", {
    x: { column: ids[2] }, y: { column: ids[1], agg: "value" },
  });
  assert.equal(scatter.xAxis.name, "指标2");
  assert.equal(scatter.yAxis.name, "指标");
  const sortPoints = points => points.map(pair => [...pair]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(sortPoints(scatter.series.flatMap(series => series.data)), sortPoints([
    [100, 10], [200, 20], [300, 20], [400, 5], [500, 0],
  ]));
  // A multi-select cell with two tags counts as ONE nonempty record, never two tags.
  const extendedIds = [...ids, "20261018100000-eeeeeee", "20261018100000-fffffff", "20261018100000-ggggggg"];
  const records = {
    headers: ["分组", "数值", "多选", "勾选", "状态", "日期", "备注"],
    columnIds: extendedIds, columnNames: ["分组", "数值", "多选", "勾选", "状态", "日期", "备注"],
    fieldTypes: ["block", "number", "mSelect", "checkbox", "select", "date", "text"],
    hasHeader: true, numericColumns: [1],
    rows: [
      ["A", "10", "开发, 测试", "true", "进行中", "2026-10-01", "已处理"],
      ["A", "20", "开发", "false", "已完成", "2026-10-02", ""],
      ["A", "", "", "true", "", "", ""],
      ["B", "8", "设计", "false", "进行中", "2026-10-02", "备注"],
      ["B", "", "", "true", "", "", ""],
    ],
  };
  const metric = (column, agg, type="bar-basic", groupBy) => generator.generateOption(records, type, {
    x: { column: extendedIds[0] }, y: { column, agg, ...(groupBy ? { groupBy } : {}) },
  });
  assert.deepEqual(metric(CHART_RECORD_COUNT, "count").series[0].data, [3, 2], "Count every filtered row");
  assert.deepEqual(metric(extendedIds[2], "count").series[0].data, [2, 1], "Multi-select: count nonempty records");
  assert.deepEqual(metric(extendedIds[3], "checked").series[0].data, [2, 1], "Checkbox: count only checked records");
  assert.deepEqual(metric(extendedIds[4], "count").series[0].data, [2, 1], "Single select: count nonempty records");
  assert.deepEqual(metric(extendedIds[5], "count").series[0].data, [2, 1], "Date: count nonempty records");
  assert.deepEqual(metric(extendedIds[6], "count").series[0].data, [1, 1], "Text: count nonempty records");
  assert.deepEqual(metric(extendedIds[1], "count").series[0].data, [2, 1], "Numeric field count: nonempty numbers only");
  assert.deepEqual(metric(CHART_RECORD_COUNT, "count", "pie-basic").series[0].data.map(v => v.value), [3, 2]);
  assert.deepEqual(metric(extendedIds[2], "count", "pie-basic").series[0].data.map(v => v.value), [2, 1]);
  const groups = metric(CHART_RECORD_COUNT, "count", "bar-basic", extendedIds[4]);
  assert.deepEqual(groups.series.map(v => [v.name, v.data]), [
    ["进行中", [1, 1]], ["已完成", [1, 0]], ["", [1, 1]],
  ], "Record-count Y supports grouped records too");
  assert.equal(effectiveChartAggregation(extendedIds[2], "mSelect", "distinct"), "count", "Old multi-select distinct is normalized to count");
  assert.equal(effectiveChartAggregation(extendedIds[3], "checkbox", "count"), "checked");
  assert.equal(effectiveChartAggregation(CHART_RECORD_COUNT, "", "sum"), "count");
  assert.equal(defaultChartAggregation(chartYKind(extendedIds[1], "number")), "value");
  assert.equal(chartAggregationIsFixed(chartYKind(extendedIds[2], "mSelect")), true);
  assert.equal(chartAggregationIsFixed(chartYKind(extendedIds[1], "number")), false);
  assert.equal(chartFieldTypeLabel("mSelect"), "多选");
  assert.equal(chartFieldTypeLabel("checkbox"), "复选框");

  // Real SiYuan AV select values are stored as an mSelect array even when
  // the column metadata says type="select". Previously these became empty X labels.
  const categoryID = "20261018111111-aaaaaaa";
  const numberID = "20261018111111-bbbbbbb";
  const makeRow = (label, number, legacySelect = false) => ({
    cells: [
      { value: { keyID: categoryID, type: "select", ...(legacySelect
        ? { select: { content: label } } : { mSelect: [{ content: label, color: "blue" }] }) } },
      { value: { keyID: numberID, type: "number", number: { content: number, isNotEmpty: true } } },
    ],
  });
  const adapted = adaptAttributeViewRender({ view: {
    columns: [{ id: categoryID, name: "分类", type: "select" }, { id: numberID, name: "指标", type: "number" }],
    rows: [makeRow("工作", 10), makeRow("生活", 20), makeRow("工作", 30), makeRow("学习", 40, true)],
  } });
  assert.deepEqual(adapted.rows.map(row => row[0]), ["工作", "生活", "工作", "学习"],
    "AV single-select must use real mSelect[0].content and legacy select.content");
  const adaptedTable = { headers: adapted.headers, rows: adapted.rows, columnIds: adapted.columnIds,
    columnNames: adapted.columnNames, fieldTypes: adapted.fieldTypes, numericColumns: adapted.numericColumns, hasHeader: true };
  const byCategory = generator.generateOption(adaptedTable, "bar-basic", {
    x: { column: categoryID }, y: { column: numberID, agg: "sum" },
  });
  assert.deepEqual(byCategory.xAxis.data, ["工作", "生活", "学习"],
    "X select categories must split by option, never collapse into a single blank category");
  assert.deepEqual(byCategory.series[0].data, [40, 20, 40]);

  const legacy = generator.generateOption(table, "bar-basic", { x: { column: ids[0] }, y: { agg: "sum" } });
  assert.ok(legacy.series.length > 1, "Existing charts with no y.column retain old multi-series fallback");
  console.log("PASS: multi-numeric Y series, 7 aggregations, grouped/pie/scatter boundaries, stable keyIDs and legacy charts");
} finally {
  await server.close();
}
