import { formatAvWallTime } from "../../shared/av/av-normalized";

/** SiYuan native AV date <-> display date conversion, minute precision only.
 *
 * content/content2 are epoch milliseconds. SiYuan's native date editor uses
 * local calendar fields, just like Frappe and datetime-local inputs.
 *
 * Frappe's private +1 ms exclusive-end sentinel belongs in iframe rendering.
 * Native writes MUST contain a multiple of 60,000 (00 seconds and 000 ms).
 */
export function formatNativeDate(epochMs:number,includeMinute=false):string {
  const result=formatAvWallTime(epochMs,includeMinute);
  return includeMinute?result.slice(0,16):result;
}

export function parseCalendarDay(day:string):number {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("日期格式无效");
  const value=Date.parse(day+"T00:00:00");
  if(!Number.isFinite(value) || formatNativeDate(value)!==day)
    throw new Error("日期格式无效");
  return value;
}

export function parseCalendarMinute(value:string):number {
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value))
    throw new Error("日期必须是 YYYY-MM-DD HH:mm 格式");
  const ms=Date.parse(value.slice(0,10)+"T"+value.slice(11)+":00");
  if(!Number.isFinite(ms)||formatNativeDate(ms,true)!==value)
    throw new Error("日期或时间无效");
  return ms;
}

export function canonicalNativeMinute(ms:number):number {
  if(!Number.isFinite(ms))throw new Error("思源日期时间戳无效");
  // Align to the *visible* minute, not Frappe's sub-millisecond end sentinel.
  return Math.floor(ms/60000)*60000;
}

/** Create a SiYuan-compatible local timestamp from a display date.
 * Explicit HH:mm replaces the complete clock, including seconds/fractions.
 * Calendar-only moves retain existing HH:mm but also zero hidden fractions.
 */
export function toNativeTimestamp(value:string,original?:number):number {
  if(value.includes(" "))return parseCalendarMinute(value);
  const day=parseCalendarDay(value);
  if(original===undefined)return day;
  if(!Number.isFinite(original))throw new Error("原日期值无效，已停止更新");
  return parseCalendarMinute(value+" "+formatNativeDate(original,true).slice(11));
}

export function shiftNativeRangeEnd(endMs:number,fromMs:number,toMs:number):number {
  // UTC is only an arithmetic coordinate here: shift displayed calendar
  // minutes so a day move across DST retains the nested range's clock times.
  const wall=(ms:number)=>Date.parse(formatNativeDate(ms,true).replace(" ","T")+":00Z");
  const shifted=new Date(wall(endMs)+wall(toMs)-wall(fromMs));
  return parseCalendarMinute(shifted.toISOString().slice(0,16).replace("T"," "));
}
