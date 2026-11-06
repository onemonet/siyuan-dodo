import { renderAttributeView, postJson } from "../../shared/av/kernel-api";
import type { AvRenderData, AvCellValue } from "../../shared/av/av-data-adapter";
import { canonicalNativeMinute } from "./date-codec";
import {
  isValidAvID, resolvedScheduleKeys, avRows, avCell,
  makeScheduleResult, makeDateValue, makeProgressValue,
  addDays, minuteMode, parseWallTime,
  type ScheduleConfig,
} from "./schedule-model";

export interface ScheduleChange {
  id: string;
  kind: "dates" | "progress";
  before: {start_date:string;end_date:string;progress:number};
  after: {start_date:string;end_date:string;progress:number};
}
type Post=(path:string, body:unknown)=>Promise<void>;
async function post(path:string,body:unknown):Promise<void>{
  await postJson(path, body);
}
function cloneValue(value?:AvCellValue):AvCellValue{
  if(!value)throw new Error("无法验证当前数据库单元格，已停止写入");
  // Only the SiYuan cell type/value belong in a setAttributeViewBlockAttr
  // payload. Do not replay read-only renderer metadata (id, keyID, blockID).
  if(value.type==="date" && value.date)
    return {type:"date",date:JSON.parse(JSON.stringify(value.date))};
  if(value.type==="number" && value.number)
    return {type:"number",number:JSON.parse(JSON.stringify(value.number))};
  throw new Error("数据库单元格类型发生变化，已停止写入");
}
/** Validate postMessage payloads independently from TypeScript types. The
 * bridge can receive runtime Date objects from Frappe: reject them rather
 * than producing misleading "database changed" errors or writing bad dates.
 */
function assertScheduleWireDay(value:unknown,field:string,step:0|15|30):void{
  if(typeof value!=="string")throw new Error(field+"必须是标准日期字符串");
  if(step){
    const stamp=parseWallTime(value);
    if(!Number.isFinite(stamp))throw new Error(field+"不是有效时间");
    return;
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(field+"不是 YYYY-MM-DD 日期字符串（甘特日期协议异常）");
  const millis=Date.parse(value+"T00:00:00Z");
  if(!Number.isFinite(millis) || new Date(millis).toISOString().slice(0,10)!==value)
    throw new Error(field+"不是有效日期");
}
export function assertScheduleChangeWire(change:ScheduleChange,step:0|15|30=0):void{
  if(!change || !["dates","progress"].includes(change.kind) ||
    !change.before || !change.after)throw new Error("甘特保存请求结构无效");
  for(const [label,snapshot] of [["原值",change.before],["新值",change.after]] as const){
    assertScheduleWireDay(snapshot.start_date,label+"开始日期",step);
    assertScheduleWireDay(snapshot.end_date,label+"结束日期",step);
    if(snapshot.start_date>=snapshot.end_date)
      throw new Error(label+"结束日期不能早于或等于开始日期");
    if(typeof snapshot.progress!=="number" || !Number.isFinite(snapshot.progress) ||
      snapshot.progress<0 || snapshot.progress>1)
      throw new Error(label+"进度不是有效的 0–1 数值");
  }
}

/** All task content stays inside native SiYuan AV cells. Native view configuration
 * is persisted separately by DatabaseViewConfigStore, never as task JSON.
 */
export async function saveScheduleChange(
  context:{avID:string;blockId:string;viewID:string},
  config:ScheduleConfig, change:ScheduleChange, writer:Post=post,
):Promise<void> {
  if(![context.avID,context.blockId,context.viewID,change.id].every(isValidAvID))
    throw new Error("数据库或条目 ID 无效");
  assertScheduleChangeWire(change,minuteMode(config)?config.timeStep as 15|30:0);
  const raw=await renderAttributeView({
    id:context.avID,blockID:context.blockId,viewID:context.viewID,pageSize:100000,
  }) as AvRenderData;
  const keys=resolvedScheduleKeys(raw,config.fieldMapping||{});
  const row=avRows(raw).find(r=>r.id===change.id);
  if(!row)throw new Error("此条目已不在当前数据库视图，不能继续保存");
  const present=makeScheduleResult(raw,config).data.find(t=>t.id===change.id);
  if(!present)throw new Error("不是可编辑的数据库任务");
  if(change.kind==="dates" && present.dateLocked)
    throw new Error("原生日期值异常或区间顺序无效，请在思源表格检查后再编辑");
  // Check only the native cell(s) this operation is about to overwrite.
  // Previously this compared the complete rendered task (start/end/progress)
  // for EVERY edit. An unrelated progress refresh would spuriously reject a
  // date drag, and an unrelated date refresh would reject a progress drag.
  // Keep real conflict detection for all fields that WILL be written.
  const dateStarted=change.after.start_date!==change.before.start_date;
  const dateEnded=change.after.end_date!==change.before.end_date;
  const sameDateField=!keys.end||keys.end===keys.start;
  if(change.kind==="dates"){
    if((sameDateField || dateStarted) &&
       present.start_date!==change.before.start_date)
      throw new Error("开始日期已在思源数据库中变化（原："+change.before.start_date+
        "，现："+present.start_date+"），请在刷新后重新拖动");
    if((sameDateField || dateEnded) &&
       present.end_date!==change.before.end_date)
      throw new Error("结束日期已在思源数据库中变化（原："+change.before.end_date+
        "，现："+present.end_date+"），请在刷新后重新拖动");
  }else if(Math.abs(present.progress-change.before.progress)>0.00001){
    throw new Error("进度已在思源数据库中变化（原："+Math.round(change.before.progress*100)+
      "%，现："+Math.round(present.progress*100)+"%），请在刷新后重新修改");
  }
  const writes:Array<{keyID:string;value:AvCellValue;original:AvCellValue}>=[];
  if(change.kind==="dates"){
    if(!keys.start)throw new Error("没有绑定有效的开始日期列");
    if(config.fieldMapping?.end && !keys.end)
      throw new Error("结束日期字段 ID 已失效，请重新选择字段");
    if(change.after.start_date===change.before.start_date &&
       change.after.end_date===change.before.end_date)return;
    const minute=minuteMode(config);
    // Date-only ranges have inclusive calendar ends in SiYuan, but minute
    // ranges use the actual timestamp as an exclusive DHTMLX end.
    const nativeEnd=minute
      ? change.after.end_date
      : addDays(change.after.end_date,-1);
    if((dateStarted||dateEnded) &&
       change.after.start_date>=change.after.end_date)
      throw new Error("新的开始时间不能晚于或等于结束时间");
    const start=avCell(row,keys.start);
    if(keys.end&&keys.end!==keys.start){
      const finish=avCell(row,keys.end);
      // Only touch the mapped field whose displayed date actually changed.
      // Each cell's inner date range (if any) moves together without losing
      // its independent duration or datetime precision.
      if(change.after.start_date!==change.before.start_date){
        writes.push({keyID:keys.start,
          value:makeDateValue(change.after.start_date,start?.date),
          original:cloneValue(start)});
      }
      if(change.after.end_date!==change.before.end_date){
        writes.push({keyID:keys.end,
          value:makeDateValue(nativeEnd,finish?.date),
          original:cloneValue(finish)});
      }
      // Compare the final native timestamps, including retained clock times
      // and the latest value of an endpoint this operation does not write.
      const first=writes.find(w=>w.keyID===keys.start)?.value.date||start?.date;
      const last=writes.find(w=>w.keyID===keys.end)?.value.date||finish?.date;
      if(first?.isNotEmpty && last?.isNotEmpty &&
         canonicalNativeMinute(last.content!)<canonicalNativeMinute(first.content!))
        throw new Error("结束日期不能早于开始日期和原有具体时间");
    }else{
      writes.push({keyID:keys.start,
        value:makeDateValue(change.after.start_date,start?.date,nativeEnd),
        original:cloneValue(start)});
    }
  }else{
    if(!keys.progress)throw new Error("未绑定进度数字字段");
    if(Math.abs(change.before.progress-change.after.progress)<0.00001)return;
    const cell=avCell(row,keys.progress);
    writes.push({keyID:keys.progress,
      value:makeProgressValue(change.after.progress,config.progressMax===1?1:100,cell?.number),
      original:cloneValue(cell)});
  }
  // Render result validates the cell types, but repeated validation before every
  // mutation ensures a removed/recreated same-name key never receives a write.
  const columns=new Map((raw.view?.columns||[]).map(c=>[c.id,c.type]));
  for(const field of writes){
    const expected=change.kind==="dates"?"date":"number";
    if(!isValidAvID(field.keyID)||columns.get(field.keyID)!==expected)
      throw new Error("数据库字段已改变，已停止写入");
  }
  // Last boundary before the native SiYuan API: only canonical HH:mm is
  // allowed on date writes. Frappe's private +1ms sentinel and legacy hidden
  // seconds never reach setAttributeViewBlockAttr. Rollback may restore the
  // original untouched cell exactly as it existed before this operation.
  for(const field of writes){
    if(change.kind!=="dates")continue;
    const date=field.value.date;
    if(!date || !Number.isFinite(date.content) || date.content!%60000!==0 ||
       (date.hasEndDate && date.isNotEmpty2 &&
        (!Number.isFinite(date.content2) || date.content2!%60000!==0)))
      throw new Error("甘特日期转换异常：思源仅支持分钟级时间，已停止写入");
  }
  const applied:typeof writes=[];
  try{
    for(const field of writes){
      await writer("/api/av/setAttributeViewBlockAttr",{
        avID:context.avID,keyID:field.keyID,itemID:change.id,value:field.value,
      });
      applied.push(field);
    }
  }catch(error){
    const recoveryErrors:string[]=[];
    // Two separate date columns aren't an atomic kernel transaction. Restore
    // prior cells if the later write is rejected; never silently claim success.
    for(const field of applied.reverse()){
      try{
        await writer("/api/av/setAttributeViewBlockAttr",{
          avID:context.avID,keyID:field.keyID,itemID:change.id,value:field.original,
        });
      }catch(e){recoveryErrors.push(e instanceof Error?e.message:String(e));}
    }
    // An HTTP/network failure can arrive after the server committed a
    // field. Do not claim rollback happened when no acknowledgement arrived.
    const details=recoveryErrors.length
      ? "；部分日期回滚失败，请到思源原生表格核对："+recoveryErrors.join("；")
      : applied.length
        ? "；已尝试回滚已确认的字段，正在重新读取最新数据"
        : "；写入结果未确认，正在重新读取思源数据库核对";
    throw new Error("甘特自动保存失败：" +
      (error instanceof Error?error.message:String(error))+details);
  }
}
