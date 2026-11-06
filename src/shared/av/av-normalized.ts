/**
 * Canonical typed SiYuan AV records. All built-in database views and the Dodo
 * HTML SDK use this model; individual views retain their own renderers,
 * interactions, binding and pagination policies.
 *
 * Calendar dates are WALL dates, not UTC instants. Native formattedContent is
 * authoritative when available; otherwise use local calendar fields from
 * content/content2 (the same fields used by SiYuan's native date editor).
 * Never use toISOString() to construct a calendar date.
 */
import type { AvCellValue, AvRenderData, AvRenderRow } from "./av-data-adapter";

export const AV_NODE_ID = /^\d{14}-[a-z0-9]{7}$/;

export interface NormalizedAvDate {
  /** Original native millisecond timestamp(s), unchanged for safe writes. */
  start: number;
  end: number | null;
  allDay: boolean;
  startDisplay: string;
  endDisplay: string | null;
}

export interface NormalizedAvField {
  id: string;
  name: string;
  type: string;
  icon?: string;
}

export interface NormalizedAvCell {
  fieldId: string;
  type: string;
  /** Nullable JSON-compatible value for SDK consumers (not presentation HTML). */
  value: unknown;
  /** Text for labels, filtering and custom HTML. */
  display: string;
  /** Markdown images for legacy timeline flattening; otherwise display. */
  tableDisplay: string;
  details: unknown;
  date?: NormalizedAvDate;
  source?: AvCellValue;
}

export interface NormalizedAvRecord {
  itemId: string;
  blockId: string;
  valueId: string;
  cells: Record<string, NormalizedAvCell>;
}

export interface NormalizedAvData {
  fields: NormalizedAvField[];
  records: NormalizedAvRecord[];
  maxUpdatedAt: number;
}

function pad(value: number): string { return String(value).padStart(2, "0"); }

export function formatAvWallTime(epochMs: number, includeTime = false): string {
  const time = new Date(epochMs);
  if (!Number.isFinite(time.getTime())) throw new Error("无效的思源日期时间戳");
  const date = `${time.getFullYear()}-${pad(time.getMonth()+1)}-${pad(time.getDate())}`;
  return includeTime
    ? `${date} ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`
    : date;
}

/** Match native-rendered calendar strings without converting to a timezone. */
function renderedDateParts(text: string): string[] {
  const dates: string[] = [];
  const pattern = /(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})(?:日)?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/g;
  for (const match of text.matchAll(pattern)) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const probe = new Date(year,month-1,day);
    if (probe.getFullYear()!==year || probe.getMonth()!==month-1 || probe.getDate()!==day) continue;
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]||0);
    dates.push(match[4]!==undefined && hour<24 && minute<60 && second<60
      ? `${date} ${pad(hour)}:${pad(minute)}:${pad(second)}` : date);
  }
  return dates;
}

export function normalizeAvDate(date?: AvCellValue["date"] | null): NormalizedAvDate | null {
  if (!date || date.isNotEmpty === false || !Number.isFinite(date.content)) return null;
  const start = date.content as number;
  const end = date.hasEndDate === true && date.isNotEmpty2 !== false &&
    Number.isFinite(date.content2) ? date.content2 as number : null;
  const allDay = date.isNotTime !== false;
  const native = renderedDateParts(date.formattedContent || "");
  const format = (epochMs: number) => formatAvWallTime(epochMs,!allDay);
  const display = (nativeText: string | undefined, epochMs: number): string => {
    if (!nativeText) return format(epochMs);
    if (allDay) return nativeText.slice(0,10);
    // Preserve native display date even if formattedContent omits its clock.
    return nativeText.length>10 ? nativeText : nativeText+" "+format(epochMs).slice(11);
  };
  return {
    start, end, allDay,
    startDisplay: display(native[0],start),
    endDisplay: end !== null ? display(native[1],end) : null,
  };
}

function nestedType(v: AvCellValue): string {
  for (const type of ["block","text","number","date","checkbox","relation",
    "rollup","url","email","phone","location","mAsset","mSelect","select",
    "created","updated","template","lineNumber"] as const) if (v[type]) return type;
  return v.type || "text";
}

function displayObject(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayObject).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string" && obj.name) return obj.name;
    if (typeof obj.path === "string" && obj.path) return obj.path;
    return Object.values(obj).map(displayObject).filter(Boolean).join(", ");
  }
  return "";
}

export function normalizeAvCell(
  fieldId: string, type: string, source?: AvCellValue, depth = 0,
): NormalizedAvCell {
  const base = (value: unknown, display: string, details: unknown = null,
    tableDisplay = display, date?: NormalizedAvDate): NormalizedAvCell =>
    ({fieldId,type,value,display,tableDisplay,details,date,source});
  if (!source || depth > 4) return base(null,"");
  switch (type) {
    case "block": return base(source.block?.content || "",source.block?.content || "");
    case "text": return base(source.text?.content || "",source.text?.content || "");
    case "number": {
      const num = source.number;
      if (!num || num.isNotEmpty === false || !Number.isFinite(num.content)) return base(null,"",num || null);
      const display = num.formattedContent?.trim() || String(num.content);
      return base(num.content,display,num);
    }
    case "date": {
      const date = normalizeAvDate(source.date);
      if (!date) return base(null,"",source.date || null);
      const display = source.date?.formattedContent?.trim() ||
        (date.startDisplay + (date.endDisplay ? " ~ " + date.endDisplay : ""));
      return base({start:date.start,end:date.end,allDay:date.allDay},
        display,source.date || null,date.startDisplay,date);
    }
    case "checkbox": {
      const value = source.checkbox?.checked === true;
      return base(value,String(value),source.checkbox || null);
    }
    case "select": {
      const value = source.select?.content || source.mSelect?.[0]?.content || "";
      return base(value,value,source.select?.content ? source.select : source.mSelect?.[0] || null);
    }
    case "mSelect": {
      const choices = (source.mSelect || []).filter(choice=>!!choice?.content);
      const value = choices.map(choice=>choice.content || "");
      return base(value,value.join(", "),choices);
    }
    case "mAsset": {
      const assets = (source.mAsset || []).filter(asset=>!!asset?.content);
      const value = assets.map(asset=>({name:asset.name||"",path:asset.content||"",type:asset.type||""}));
      const first=assets[0];
      return base(value,value.map(asset=>asset.name||asset.path).join(", "),value,
        first ? `![${first.name || ""}](${first.content})` : "");
    }
    case "location": {
      const loc=source.location;
      const valid = !!loc && (Boolean(loc.name || loc.originalInput) ||
        typeof loc.latitude === "number" || typeof loc.longitude === "number");
      if (!valid) return base(null,"",loc || null);
      const coords = typeof loc?.longitude === "number" &&
        typeof loc?.latitude === "number" && Number.isFinite(loc.longitude) &&
        Number.isFinite(loc.latitude) && Math.abs(loc.longitude)<=180 && Math.abs(loc.latitude)<=90
        ? `${loc.longitude},${loc.latitude}` : "";
      const info={...loc!};
      return base(info,loc!.name || coords || loc!.originalInput || "",info,coords);
    }
    case "url": case "email": case "phone": {
      const value = source[type]?.content || "";
      return base(value,value,source[type] || null);
    }
    case "created": case "updated": {
      const info=source[type];
      const value=info?.content ?? null;
      return base(value,info?.formattedContent?.trim() || displayObject(value),info || null);
    }
    case "lineNumber": {
      const value=source.lineNumber?.content ?? null;
      return base(value,displayObject(value),source.lineNumber || null);
    }
    case "template": {
      const value=source.template?.content || "";
      return base(value,value,source.template || null);
    }
    case "relation": {
      const ids=[...(source.relation?.blockIDs || [])];
      const nested=(source.relation?.contents || []).map(item =>
        normalizeAvCell("",item.type || nestedType(item),item,depth+1));
      const content=nested.map(v=>v.display).filter(Boolean).join(", ");
      return base(ids,content || ids.join(", "),{
        blockIDs:ids,contents:(source.relation?.contents || []).map((item,index)=>({
          type:item.type || nestedType(item),blockId:item.block?.id || item.blockID || "",
          value:nested[index].value,
        })),
      });
    }
    case "rollup": {
      const nested=(source.rollup?.contents || []).map(item =>
        normalizeAvCell("",item.type || nestedType(item),item,depth+1));
      const value=nested.map(cell=>cell.value).filter(x=>x!==null&&x!=="");
      return base(value,nested.map(cell=>cell.display).filter(Boolean).join(", "),
        nested.map((cell,index)=>({type:source.rollup?.contents?.[index]?.type||nestedType(source.rollup!.contents![index]),value:cell.value})));
    }
    default: return normalizeAvCell(fieldId,"text",source,depth+1);
  }
}

/** Single canonical place for field/key identity and native row identity. */
export function normalizeAvRender(data: AvRenderData): NormalizedAvData {
  const fields: NormalizedAvField[] = (data.view?.columns || [])
    .filter(field=>!!field.id).map(field=>({
      id:field.id!,name:(field.name || "").trim() || "未命名字段",
      type:field.type || "text",icon:field.icon,
    }));
  const rows: AvRenderRow[] = data.view?.rows?.length ? data.view.rows :
    (data.view?.groups || []).flatMap(group=>group.rows || []);
  const primary = fields.find(field=>field.type==="block");
  let maxUpdatedAt=0;
  const records = rows.map(row=>{
    const sources=new Map<string,AvCellValue>();
    for(const entry of row.cells || []) {
      const cell=entry?.value;
      if (cell?.keyID) {
        sources.set(cell.keyID,cell);
        maxUpdatedAt=Math.max(maxUpdatedAt,cell.updatedAt || 0);
      }
    }
    const main=primary ? sources.get(primary.id) : undefined;
    const itemId=row.id || main?.blockID || "";
    const blockId=main?.isDetached === true ? "" : main?.block?.id || "";
    const valueId=main?.id || "";
    return {
      itemId:AV_NODE_ID.test(itemId)?itemId:"",
      blockId:AV_NODE_ID.test(blockId)?blockId:"",
      valueId:AV_NODE_ID.test(valueId)?valueId:"",
      cells:Object.fromEntries(fields.map(field=>[field.id,
        normalizeAvCell(field.id,field.type,sources.get(field.id))])),
    };
  });
  return {fields,records,maxUpdatedAt};
}
