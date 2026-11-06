import type { AvRenderData } from "../../shared/av/av-data-adapter";
import { renderAttributeView, postJson } from "../../shared/av/kernel-api";
import {
  addDays, isValidAvID, makeDateValue, parseWallTime,
  resolvedScheduleKeys, type ScheduleMapping,
} from "../core/schedule-model";

export interface NewCalendarItem {
  title: string;
  start: string;
  /** FullCalendar-exclusive end, both for date-only and local minute times. */
  end: string;
  allDay: boolean;
}
export interface CalendarWriteContext {
  avID: string;
  blockId: string;
  viewID: string;
}

type Read = (args: { id: string; blockID: string; viewID: string; pageSize: number }) =>
  Promise<AvRenderData>;
type Write = (path: string, payload: unknown) => Promise<void>;

const read: Read = async args => await renderAttributeView(args) as AvRenderData;
async function write(path: string, payload: unknown): Promise<void> {
  await postJson(path, payload);
}

/** A date-only end is exclusive in FullCalendar but inclusive in SiYuan.
 * Detached SiYuan rows require the native block primary-key value too.
 * Insert all fields in one kernel transaction to avoid orphan/empty rows.
 */
export function makeCalendarCreatePayload(
  raw: AvRenderData, mapping: Partial<ScheduleMapping>, item: NewCalendarItem,
): { avID?: never; blocksValues: Array<Array<Record<string, unknown>>> } {
  const title = item.title?.trim();
  if (!title || title.length > 500) throw new Error("请输入 1–500 字的日程名称");
  if (typeof item.allDay !== "boolean" ||
      typeof item.start !== "string" || typeof item.end !== "string")
    throw new Error("日程日期格式无效");
  if (item.allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.start) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.end))
      throw new Error("全天日程必须使用日期");
    // validate calendar day, including leap days
    if (addDays(item.start, 0) !== item.start ||
        addDays(item.end, 0) !== item.end)
      throw new Error("日期不存在，请检查年月日");
  } else {
    parseWallTime(item.start);
    parseWallTime(item.end);
  }
  if (item.start >= item.end)
    throw new Error("结束时间必须晚于开始时间");

  const keys = resolvedScheduleKeys(raw, mapping);
  const columns = raw.view?.columns || [];
  const primary = columns.find(col => col.type === "block" && isValidAvID(col.id || ""));
  if (!primary?.id) throw new Error("数据库缺少可写的主键列");
  if (!keys.title || !keys.start)
    throw new Error("请先在日历设置中绑定有效的名称和日期字段");
  if (mapping.end && !keys.end)
    throw new Error("结束日期字段已失效，请重新绑定");
  // SiYuan's create-detached API requires the primary block field, even if
  // the visual calendar title is mapped to a separate text column.
  const values: Array<Record<string, unknown>> = [
    { keyID: primary.id, block: { content: title } },
  ];
  if (keys.title !== primary.id) {
    const selected = columns.find(col => col.id === keys.title);
    if (selected?.type !== "text") throw new Error("名称字段不支持新建");
    values.push({ keyID: keys.title, text: { content: title } });
  }

  const nativeEnd = item.allDay ? addDays(item.end, -1) : item.end;
  const separate = Boolean(keys.end && keys.end !== keys.start);
  const startValue = makeDateValue(item.start, undefined, separate ? undefined : nativeEnd);
  values.push({ keyID: keys.start, date: startValue.date });
  if (separate) {
    const endValue = makeDateValue(nativeEnd);
    values.push({ keyID: keys.end, date: endValue.date });
  }
  return { blocksValues: [values] };
}

export async function createCalendarItem(
  context: CalendarWriteContext, mapping: Partial<ScheduleMapping>,
  item: NewCalendarItem, reader: Read = read, writer: Write = write,
): Promise<void> {
  if (![context.avID, context.blockId, context.viewID].every(isValidAvID))
    throw new Error("数据库 ID 无效");
  const raw = await reader({
    id: context.avID, blockID: context.blockId, viewID: context.viewID, pageSize: 1,
  });
  const payload = makeCalendarCreatePayload(raw, mapping, item);
  await writer("/api/av/appendAttributeViewDetachedBlocksWithValues", {
    avID: context.avID, ...payload,
  });
}
