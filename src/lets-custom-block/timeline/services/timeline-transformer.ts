import {
  TimelineBlockConfig,
  TimelineDateParts,
  TimelineEventData,
  TimelineMedia,
  TimelineRenderableData,
  TimelineTableData,
} from "../types";
import {
  ResolvedTimelineColumns,
  resolveTimelineColumns,
} from "./field-mapping";

interface ParsedDateValue {
  date: Date;
  parts: TimelineDateParts;
  display: string;
}

export class TimelineTransformerService {
  static transform(
    tableData: TimelineTableData,
    config: TimelineBlockConfig
  ): TimelineRenderableData {
    const rowCount = tableData.rows.length;
    if (rowCount === 0) {
      throw new Error("\u6e90\u8868\u683c\u4e3a\u7a7a\u3002");
    }

    const columnCount = Math.max(
      tableData.headers.length,
      ...tableData.rows.map((row) => row.length),
      0
    );

    if (columnCount < 2) {
      throw new Error("\u6e90\u8868\u683c\u81f3\u5c11\u9700\u8981\u4e24\u5217\u3002");
    }

    const columns = resolveTimelineColumns(
      tableData.headers,
      config.fieldMapping,
      columnCount,
      tableData.columnIds,
      tableData.columnNames,
      tableData.fieldTypes
    );

    if (columns.title === null && tableData.fieldTypes?.length) {
      throw new Error("时间线缺少必填的标题字段：请选择文本或主键列。");
    }
    if (columns.startDate === null) {
      throw new Error("时间线缺少必填的开始时间：请选择日期列。");
    }

    const events = tableData.rows
      .map((row, index) =>
        this.createEvent(row, index, columns, config.sourceBlockId || "timeline", tableData, config)
      )
      .filter((event): event is TimelineEventData => event !== null)
      .sort((left, right) => this.compareEvents(left, right));

    if (events.length === 0) {
      throw new Error("\u6e90\u8868\u683c\u4e2d\u6ca1\u6709\u627e\u5230\u6709\u6548\u7684\u65e5\u671f\u503c\u3002");
    }

    // Database timelines always follow their source database name. Manual titles
    // are only applicable to standalone Markdown table timelines.
    const title = config.sourceType === "database"
      ? tableData.sourceName?.trim() || "时间线"
      : config.title?.trim() || "时间线";

    return {
      title: {
        text: {
          headline: this.escapeHtml(title),
          text: `\u5171\u663e\u793a ${events.length} \u6761\u6765\u81ea\u8868\u683c\u7684\u4e8b\u4ef6\u3002`,
        },
      },
      events,
    };
  }

  private static createEvent(
    row: string[],
    rowIndex: number,
    columns: ResolvedTimelineColumns,
    sourceBlockId: string,
    tableData: TimelineTableData,
    config: TimelineBlockConfig,
  ): TimelineEventData | null {
    const startValue = this.readCell(row, columns.startDate);
    const startDate = this.parseDateValue(startValue);
    if (!startDate) {
      return null;
    }

    const headline = this.readCell(row, columns.title) || `\u4e8b\u4ef6 ${rowIndex + 1}`;
    const description = this.readCell(row, columns.description);
    // A SiYuan date cell can contain both content (start) and content2 (end).
    // When both mappings reference the same real date keyID, read its adapted
    // virtual end cell; never reuse the start value as the event's end date.
    // Different database columns and Markdown tables keep their old behavior.
    const sameDatabaseDateColumn = config.sourceType === "database" &&
      columns.endDate !== null && columns.startDate === columns.endDate;
    const endColumnID = sameDatabaseDateColumn
      ? `${tableData.columnIds?.[columns.startDate as number] || ""}:end` : "";
    const endIndex = sameDatabaseDateColumn
      ? tableData.columnIds?.indexOf(endColumnID) ?? -1 : -1;
    const endValue = sameDatabaseDateColumn
      ? (endIndex >= 0 ? this.readCell(row, endIndex) : "")
      : this.readCell(row, columns.endDate);
    const endDate = this.parseDateValue(endValue);

    const event: TimelineEventData = {
      unique_id: `${sourceBlockId}-${rowIndex}`,
      start_date: startDate.parts,
      display_date: startDate.display,
      text: {
        headline: this.escapeHtml(headline),
      },
    };

    // Rows are mapped before date filtering and chronological sorting. Keep the
    // actual AV item/value/document IDs on each event, never match by title/index.
    const validId = (id?: string) => typeof id === "string" && /^\d{14}-[a-z0-9]{7}$/.test(id);
    if (config.sourceType === "database" && validId(config.sourceAvID) && validId(config.sourceBlockId)) {
      const blockId = tableData.rowBoundBlockIds?.[rowIndex] || "";
      const itemId = tableData.rowBlockIds?.[rowIndex] || "";
      const valueId = tableData.rowValueIds?.[rowIndex] || "";
      if (validId(blockId) || (validId(itemId) && validId(valueId))) {
        event.record = {
          blockId: validId(blockId) ? blockId : "",
          itemId: validId(itemId) ? itemId : "",
          valueId: validId(valueId) ? valueId : "",
          avID: config.sourceAvID as string,
          databaseBlockID: config.sourceBlockId,
          title: headline,
        };
      }
    }

    if (description) {
      event.text.text = this.toHtmlParagraphs(description);
    }

    if (endDate) {
      event.end_date = endDate.parts;
      event.display_date = `${startDate.display} - ${endDate.display}`;
    }

    // 手动指定的显示日期优先于自动拼接的开始/结束日期
    const displayDate = this.readCell(row, columns.displayDate);
    if (displayDate) {
      event.display_date = this.escapeHtml(displayDate);
    }

    const group = this.readCell(row, columns.group);
    if (group) {
      event.group = group;
    }

    const media = this.parseMediaValue(this.readCell(row, columns.media));
    if (media) {
      const caption = this.readCell(row, columns.mediaCaption);
      if (caption) media.caption = this.escapeHtml(caption);
      // Image media already uses its own URL as the preview thumbnail.
      event.media = media;
    }

    const backgroundColor = this.readCell(row, columns.backgroundColor);
    const backgroundImage = this.extractMediaUrl(this.readCell(row, columns.backgroundImage));
    if (backgroundColor || backgroundImage) {
      event.background = {
        ...(backgroundColor ? { color: backgroundColor } : {}),
        ...(backgroundImage ? { url: backgroundImage } : {}),
      };
    }

    return event;
  }

  /**
   * 媒体单元格解析：Markdown 图片、<img> 标签或纯资源路径/URL；
   * 多图时取第一张，Markdown alt 作为媒体说明。
   */
  private static parseMediaValue(value: string): TimelineMedia | undefined {
    const text = value.trim();
    if (!text) {
      return undefined;
    }

    const markdownImage = text.match(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/);
    if (markdownImage) {
      return this.toMedia(markdownImage[2], markdownImage[1].trim());
    }

    const htmlImage = text.match(/<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/i);
    if (htmlImage) {
      const alt = text.match(/\salt=["']([^"']*)["']/i);
      return this.toMedia(htmlImage[1], alt?.[1]?.trim() || "");
    }

    return this.toMedia(text.replace(/^<|>$/g, "").trim(), "");
  }

  /** Accept an AV asset cell (Markdown) or a literal media URL, without using raw markup. */
  private static extractMediaUrl(value: string): string {
    if (!value.trim()) return "";
    return this.parseMediaValue(value)?.url || "";
  }

  private static toMedia(url: string, caption: string): TimelineMedia | undefined {
    const cleaned = url.trim();
    if (!cleaned) {
      return undefined;
    }
    // iframe 文档位于 /plugins/.../iframe/ 下，思源资源路径需锚定到站点根
    const resolved = cleaned.startsWith("assets/") ? `/${cleaned}` : cleaned;

    const media: TimelineMedia = { url: resolved };
    if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/i.test(resolved)) {
      media.thumbnail = resolved;
      media.thumb = resolved;
    }
    if (caption) {
      // TimelineJS3 以 innerHTML 渲染媒体说明
      media.caption = this.escapeHtml(caption);
    }
    return media;
  }

  private static parseDateValue(value: string): ParsedDateValue | null {
    if (!value) {
      return null;
    }

    const normalized = this.normalizeDateInput(value);
    if (!normalized) {
      return null;
    }

    const yearOnly = normalized.match(/^(\d{4})$/);
    if (yearOnly) {
      const year = Number(yearOnly[1]);
      return {
        date: new Date(year, 0, 1),
        parts: { year },
        display: value.trim(),
      };
    }

    const yearMonthOnly = normalized.match(/^(\d{4})-(\d{1,2})$/);
    if (yearMonthOnly) {
      const year = Number(yearMonthOnly[1]);
      const month = Number(yearMonthOnly[2]);
      return {
        date: new Date(year, month - 1, 1),
        parts: { year, month },
        display: value.trim(),
      };
    }

    // Date-only ISO strings are interpreted as UTC by JavaScript (unlike
    // "YYYY-MM-DD HH:mm:ss"). Parse native AV calendar fields as wall dates
    // so the same row does not shift a day in negative UTC offsets.
    const calendar = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    let parsedDate: Date;
    if (calendar) {
      const [year,month,day,hour,minute,second] =
        [Number(calendar[1]),Number(calendar[2]),Number(calendar[3]),
          Number(calendar[4]||0),Number(calendar[5]||0),Number(calendar[6]||0)];
      parsedDate = new Date(year, month-1, day, hour, minute, second);
      if (parsedDate.getFullYear()!==year || parsedDate.getMonth()!==month-1 ||
          parsedDate.getDate()!==day || parsedDate.getHours()!==hour ||
          parsedDate.getMinutes()!==minute || parsedDate.getSeconds()!==second) return null;
    } else {
      parsedDate = new Date(normalized);
    }
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    const parts: TimelineDateParts = {
      year: parsedDate.getFullYear(),
      month: parsedDate.getMonth() + 1,
      day: parsedDate.getDate(),
    };

    if (normalized.includes(":")) {
      parts.hour = parsedDate.getHours();
      parts.minute = parsedDate.getMinutes();
      parts.second = parsedDate.getSeconds();
    }

    return {
      date: parsedDate,
      parts,
      display: value.trim(),
    };
  }

  private static normalizeDateInput(value: string): string {
    return value
      .trim()
      .replace(/\u00A0/g, " ")
      .replace(/[年月]/g, "-")
      .replace(/日/g, "")
      .replace(/\//g, "-")
      .replace(/\./g, "-")
      .replace(/T/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*/g, "-")
      .trim();
  }

  private static compareEvents(left: TimelineEventData, right: TimelineEventData): number {
    return this.toSortableTimestamp(left.start_date) - this.toSortableTimestamp(right.start_date);
  }

  private static toSortableTimestamp(parts: TimelineDateParts): number {
    return new Date(
      parts.year,
      (parts.month || 1) - 1,
      parts.day || 1,
      parts.hour || 0,
      parts.minute || 0,
      parts.second || 0
    ).getTime();
  }

  private static readCell(row: string[], index: number | null): string {
    if (index === null || index < 0 || index >= row.length) {
      return "";
    }
    return row[index]?.trim() || "";
  }

  private static escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private static toHtmlParagraphs(value: string): string {
    return this.escapeHtml(value).replace(/\r?\n/g, "<br>");
  }
}
