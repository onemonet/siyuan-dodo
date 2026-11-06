import type { AvRenderData, AvCellValue } from "../../shared/av/av-data-adapter";
import { adaptAttributeViewRender } from "../../shared/av/av-data-adapter";
import { resolveFieldBinding } from "../../shared/av/field-binding";
import { normalizeAvDate, normalizeAvRender } from "../../shared/av/av-normalized";
import {
  formatNativeDate, parseCalendarMinute,
  toNativeTimestamp, shiftNativeRangeEnd,
} from "./date-codec";

export type ScheduleField = "title" | "start" | "end" | "progress" | "group" | "color";
export type ScheduleMapping = Record<ScheduleField,string>;
export interface ScheduleConfig {
  fieldMapping?: Partial<ScheduleMapping>;
  /** Scale for the SiYuan numeric column. */
  progressMax?: 100 | 1;
  /** 0 = day, 30 = half hour, 15 = quarter hour. */
  timeStep?: 0 | 30 | 15;
}
export interface ScheduledRecord {
  id: string; text: string; start_date: string; end_date: string; progress: number;
  /** Source row's bound document or primary cell value, for native SiYuan navigation. */
  blockId?: string; valueId?: string;
  color?: string;
  /** Corrupt native ranges are never editable. */
  dateLocked?: boolean;
}
export interface ScheduleResult {
  data: ScheduledRecord[]; mapping: ScheduleMapping; skipped: number;
  warning: string;
}
export const SCHEDULE_FIELD_TYPES:Record<ScheduleField,readonly string[]>={
  title:["block","text"],start:["date"],end:["date"],progress:["number"],
  group:["select","mSelect"],color:["select","mSelect"],
};
export const SCHEDULE_FIELDS:Array<{key:ScheduleField;label:string;optional:boolean}>= [
  {key:"title",label:"任务名称",optional:false},
  {key:"start",label:"开始日期",optional:false},
  {key:"end",label:"结束日期",optional:true},
  {key:"progress",label:"进度",optional:true},
  {key:"group",label:"分组",optional:true},
  {key:"color",label:"颜色",optional:true},
];
const ID=/^\d{14}-[a-z0-9]{7}$/;
export const isValidAvID=(id:string)=>ID.test(id);
export function prepareScheduleMapping(raw:AvRenderData, previous:Partial<ScheduleMapping>={}):ScheduleMapping {
  const table=adaptAttributeViewRender(raw);
  const cols=raw.view?.columns||[];
  const pick=(key:ScheduleField,names:string[]):string=>{
    if(previous[key]!==undefined){
      const old=previous[key]||"";
      if(!old)return "";
      const res=resolveFieldBinding(table,old,SCHEDULE_FIELD_TYPES[key]);
      return res.status==="resolved"?res.id:old;
    }
    const list=cols.filter(c=>c.id && SCHEDULE_FIELD_TYPES[key].includes(c.type||""));
    return list.find(c=>names.includes(c.name||""))?.id
      || ((key==="title"||key==="start")?list[0]?.id:"") || "";
  };
  const start=pick("start",["开始时间","开始日期","日期","时间"]);
  return {title:pick("title",["任务名称","名称","标题"]),start,
    end:pick("end",["结束时间","结束日期","截止日期"]),
    progress:pick("progress",["进度","完成度"]),
    group:pick("group",["分组","状态","项目"]),
    color:pick("color",["颜色","状态","优先级"])};
}
export function resolvedScheduleKeys(raw:AvRenderData,mapping:Partial<ScheduleMapping>):ScheduleMapping {
  const table=adaptAttributeViewRender(raw);
  const result={} as ScheduleMapping;
  for(const field of SCHEDULE_FIELDS){
    const stored=mapping[field.key]||"";
    const resolved=resolveFieldBinding(table,stored,SCHEDULE_FIELD_TYPES[field.key]);
    result[field.key]=resolved.status==="resolved" && ID.test(resolved.id)?resolved.id:"";
  }
  return result;
}
export function avRows(raw:AvRenderData) {
  return raw.view?.rows?.length?raw.view.rows:(raw.view?.groups||[]).flatMap(g=>g.rows||[]);
}
export function avCell(row:{cells?:Array<{value?:AvCellValue}>},keyID:string):AvCellValue|undefined {
  return row.cells?.find(c=>c.value?.keyID===keyID)?.value;
}
export function formatDate(ms:number):string {
  return formatNativeDate(ms);
}
export function formatMinute(ms:number):string {
  return formatNativeDate(ms,true);
}
export const minuteMode=(config:ScheduleConfig):boolean=>
  config.timeStep===15||config.timeStep===30;
export function addMinutes(value:string,n:number):string {
  const parsed=parseWallTime(value);
  return formatMinute(parsed+n*60000);
}
export function parseWallTime(value:string):number {
  return parseCalendarMinute(value);
}
export function addDays(day:string,n:number):string {
  const d=new Date(day+"T00:00:00Z");
  if(!Number.isFinite(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error("日期格式无效");
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
const palette=["#658bd0","#59a68d","#ad88c9","#d29a54","#d67e81","#779bac","#9992ba"];
export function groupLabel(value?:AvCellValue):string {
  return (value?.select?.content||value?.mSelect?.[0]?.content||"").trim();
}
/** Prefer the original SiYuan option color when it is a safe CSS color token.
 * Never pass arbitrary AV option strings to renderer inline styles.
 */
function nativeOptionColor(value?:AvCellValue):string {
  const option=value?.select?.content ? value.select : value?.mSelect?.[0];
  const raw=(option?.color||"").trim().toLowerCase();
  const colors:Record<string,string>={
    red:"#d8757e",orange:"#d99560",yellow:"#ccab58",green:"#59a68d",
    blue:"#658bd0",purple:"#aa87cd",pink:"#cf86b0",gray:"#9099a8",grey:"#9099a8",
  };
  if(colors[raw])return colors[raw];
  if(/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw))return raw;
  return "";
}
function categoryColor(name:string):string{
  let n=0;for(const c of name)n=(n*31+c.codePointAt(0)!)>>>0;
  return palette[n%palette.length];
}
export function makeScheduleResult(raw:AvRenderData,config:ScheduleConfig):ScheduleResult {
  const mapping=prepareScheduleMapping(raw,config.fieldMapping);
  const keys=resolvedScheduleKeys(raw,mapping);
  const warnings:string[]=[];
  if(!keys.title)warnings.push("任务名称字段未绑定");
  if(!keys.start)warnings.push("开始日期字段未绑定");
  for(const k of ["end","group","progress","color"] as const){
    if(mapping[k]&&!keys[k])warnings.push(SCHEDULE_FIELDS.find(f=>f.key===k)!.label+"字段已失效");
  }
  let skipped=0;
  const data:ScheduledRecord[]=[];
  const normalizedRows=normalizeAvRender(raw).records;
  for(const [rowIndex,row] of avRows(raw).entries()){
    if(!ID.test(row.id||"")||!keys.start||!keys.title){skipped++;continue;}
    const start=avCell(row,keys.start)?.date;
    const normalizedStart=normalizeAvDate(start);
    if(!normalizedStart){skipped++;continue;}
    let end=start.content!;
    const separate=keys.end && keys.end!==keys.start;
    const endCell=separate?avCell(row,keys.end)?.date:start;
    if(separate){
      if(endCell?.isNotEmpty&&Number.isFinite(endCell.content))end=endCell.content!;
    }else if(start.hasEndDate&&start.isNotEmpty2&&Number.isFinite(start.content2))end=start.content2!;
    const titleCell=avCell(row,keys.title);
    const text=(normalizedRows[rowIndex]?.cells[keys.title]?.display ||
      titleCell?.block?.content||titleCell?.text?.content||"").trim()||"未命名任务";
    const minute=minuteMode(config);
    const endSource=separate
      ? normalizeAvDate(endCell)?.startDisplay
      : normalizedStart.endDisplay;
    // Read the SAME calendar days as the typed AV adapter, HTML SDK and
    // native SiYuan formattedContent. No UTC conversion at the view boundary.
    const startDay=minute ? normalizedStart.startDisplay.slice(0,16)
      : normalizedStart.startDisplay.slice(0,10);
    const resolvedEnd=end > start.content! ? (endSource || formatMinute(end))
      : normalizedStart.startDisplay;
    const endDay=minute?resolvedEnd.slice(0,16):resolvedEnd.slice(0,10);
    const endExclusive=minute
      ? ((endCell?.isNotTime===false && end>start.content!)
        ? endDay
        : endCell?.isNotTime===false?addMinutes(endDay,config.timeStep!):
          addDays(endDay.slice(0,10),1)+endDay.slice(10))
      : addDays(endDay,1);
    const progressCell=avCell(row,keys.progress)?.number;
    const v=progressCell?.isNotEmpty?Number(progressCell.content):0;
    const normalized=Number.isFinite(v)?v/(config.progressMax===1?1:100):0;
    const task:ScheduledRecord={id:row.id!,text,start_date:startDay,end_date:endExclusive,
      progress:Math.max(0,Math.min(1,normalized))};
    // Always use the same native row identity as map/timeline/custom SDK;
    // a different title mapping must not change where the record opens.
    const identity=normalizedRows[rowIndex];
    if(identity?.blockId)task.blockId=identity.blockId;
    if(identity?.valueId)task.valueId=identity.valueId;
    // SiYuan stores date and datetime as epoch timestamps. Day-level date
    // changes can shift their calendar days while preserving clock fractions
    // and any nested range in each mapped cell. Guard malformed time values.
    if (!Number.isFinite(end) || (start.hasEndDate && start.isNotEmpty2 &&
        (!Number.isFinite(start.content2) || start.content2! < start.content!)) ||
        (endCell?.hasEndDate && endCell.isNotEmpty2 &&
        (!Number.isFinite(endCell.content2) || endCell.content2! < (endCell.content ?? 0)))) {
      task.dateLocked=true;
    }
    const color=groupLabel(avCell(row,keys.color));
    if(color)task.color=nativeOptionColor(avCell(row,keys.color))||categoryColor(color);
    data.push(task);
  }
  if(skipped)warnings.push(skipped+" 条记录没有有效日期或条目 ID");
  return {data,mapping,skipped,warning:warnings.join("；")};
}
/** Move a native timestamp by calendar days, not by replacing its clock time.
 * SiYuan displays content/content2 in the local timezone.
 * Calendar-day displacement keeps only visible hours and minutes.
 * Native writes always normalize seconds and milliseconds to zero.
 */
function moveNativeTimestamp(day:string,old?:number):number {
  return toNativeTimestamp(day,old);
}
/** Update one native date cell without discarding its clock or nested range.
 * - A single ranged column has explicitly mapped start and end.
 * - Separate date columns map the primary content of each column; an existing
 *   nested range is shifted by exactly the same number of days, preserving
 *   its minute-level duration instead of silently truncating content2.
 */
export function makeDateValue(day:string,prior?:AvCellValue["date"],endDay?:string):AvCellValue {
  const first=moveNativeTimestamp(day,prior?.isNotEmpty?prior.content:undefined);
  const value:NonNullable<AvCellValue["date"]>={...prior,content:first,isNotEmpty:true,
    isNotTime:day.includes(" ")?false:(prior?.isNotTime??true)};
  // Formatted text describes the *old* value; let SiYuan regenerate it.
  delete value.formattedContent;
  const hadEnd=Boolean(prior?.hasEndDate&&prior?.isNotEmpty2);
  if(endDay!==undefined){
    // Explicit end binding (one column) takes priority over existing content2.
    const last=moveNativeTimestamp(endDay,hadEnd?prior?.content2:
      prior?.isNotTime===false&&prior?.isNotEmpty?prior.content:undefined);
    if(last<first)throw new Error("结束日期不能早于开始日期和原有具体时间");
    if(hadEnd || endDay!==day) {
      value.content2=last;value.isNotEmpty2=true;value.hasEndDate=true;
    } else {
      // A one-day task that was originally a single date remains single.
      delete value.content2;
      value.isNotEmpty2=false;value.hasEndDate=false;
    }
  }else if(hadEnd){
    // Another column supplies the view's end date. Preserve this cell's
    // independent embedded range and its original duration when shifting.
    if(!Number.isFinite(prior?.content2))throw new Error("原日期范围不完整");
    const previousStart=prior?.content;
    if(!Number.isFinite(previousStart))throw new Error("原日期范围起点无效");
    // Shift by displayed calendar MINUTES, never by raw milliseconds:
    // hidden seconds may differ between range endpoints in legacy data.
    value.content2=shiftNativeRangeEnd(prior!.content2!,previousStart!,first);
    value.hasEndDate=true;
    value.isNotEmpty2=true;
  }
  return {type:"date",date:value};
}
export function makeProgressValue(progress:number,max:1|100,prior?:AvCellValue["number"]):AvCellValue {
  if(!Number.isFinite(progress)||progress<0||progress>1)throw new Error("进度超出 0–100%");
  return {type:"number",number:{...prior,content:Math.round(progress*max*100)/100,isNotEmpty:true}};
}
