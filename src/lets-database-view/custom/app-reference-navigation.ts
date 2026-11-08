import { openTab } from "siyuan";
import { postJson } from "../../shared/av/kernel-api";
import { plugin } from "../../utils";
import type { CustomAppReference, CustomAppReferenceScan } from "./app-management";

const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;

export interface DatabaseBlockLabel {
  /** Human-readable SiYuan attribute-view name, never an abbreviated block ID. */
  title: string;
  path: string;
  /** Native view name by native view ID; it is presentation-only. */
  viewNames?: Record<string, string>;
  /** Original SiYuan view emoji/custom icon, keyed by native view ID. */
  viewIcons?: Record<string, string>;
}

export type CustomAppViewIcon =
  | { kind: "emoji"; value: string }
  | { kind: "asset"; value: string }
  | { kind: "symbol"; value: "iconDatabase" };

/** Match SiYuan AV view icon storage without injecting arbitrary HTML/URLs.
 * Unicode codes are native hex emoji names, and custom SVGs live under /emojis. */
export function nativeViewIcon(icon: string | undefined): CustomAppViewIcon {
  const raw = typeof icon === "string" ? icon.trim() : "";
  const fallback: CustomAppViewIcon = { kind: "symbol", value: "iconDatabase" };
  if (!raw || raw.length > 160) return fallback;
  const value = raw.startsWith("/emojis/") ? raw.slice("/emojis/".length) : raw;
  if (/^[\da-f]{2,6}(?:-[\da-f]{2,6}){0,7}$/i.test(value)) {
    const points = value.split("-").map(segment => Number.parseInt(segment, 16));
    if (points.every(code => code > 0 && code <= 0x10ffff &&
        !(code >= 0xd800 && code <= 0xdfff))) {
      return { kind: "emoji", value: String.fromCodePoint(...points) };
    }
  }
  if (value.length <= 128 &&
      /^[\w.-]+\.(?:svg|png|webp|gif|jpe?g)$/i.test(value) &&
      !value.includes("..")) {
    return { kind: "asset", value: "/emojis/" + value };
  }
  return fallback;
}

function readable(value: unknown): string {
  return typeof value === "string" && !/[<>\r\n]/.test(value)
    ? value.trim().slice(0, 100)
    : "";
}

/** Native AV block content can be empty or HTML. Resolve the actual database
 * name from its data-av-id and the authoritative /api/av/getAttributeView.
 * Labels are display-only: any failure falls back, never affects deletion guards. */
export async function loadAppReferenceLabels(
  scan: CustomAppReferenceScan,
): Promise<Record<string, DatabaseBlockLabel>> {
  const ids = [...new Set(Object.values(scan.byApp).flat()
    .map(ref => ref.blockId).filter(id => BLOCK_ID.test(id)))];
  const labels: Record<string, DatabaseBlockLabel> = Object.create(null);
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const stmt = "SELECT id, content, hpath FROM blocks WHERE id IN (" +
      batch.map(id => "'" + id + "'").join(",") + ")";
    const rows = await postJson<Array<{id:string;content?:string;hpath?:string}>>(
      "/api/query/sql", {stmt});
    if (!Array.isArray(rows)) throw new Error("思源未返回有效的数据库块名称");
    for (const row of rows) {
      if (!BLOCK_ID.test(row.id) || !batch.includes(row.id)) continue;
      labels[row.id] = {
        title: readable(row.content) || "未命名数据库",
        path: typeof row.hpath === "string" ? row.hpath : "",
      };
    }
  }
  // Use bounded concurrency to avoid sending hundreds of AV requests at once.
  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(ids.slice(i, i + 6).map(async blockId => {
      try {
        const { dom } = await postJson<{dom?:string}>(
          "/api/block/getBlockDOM", {id:blockId});
        const avID = (dom || "").match(/\bdata-av-id=["'](\d{14}-[a-z0-9]{7})["']/)?.[1];
        if (!avID) return;
        const result = await postJson<{av?:{name?:string;views?:Array<{id?:string;name?:string;icon?:string}>}}>(
          "/api/av/getAttributeView", {id:avID});
        const name = readable(result?.av?.name);
        const label = labels[blockId] || {title:"未命名数据库",path:""};
        if (name) label.title = name;
        const viewNames: Record<string,string> = Object.create(null);
        const viewIcons: Record<string,string> = Object.create(null);
        for (const view of result?.av?.views || []) {
          if (view.id && BLOCK_ID.test(view.id)) {
            const viewName = readable(view.name);
            if (viewName) viewNames[view.id] = viewName;
            if (typeof view.icon === "string") viewIcons[view.id] = view.icon;
          }
        }
        label.viewNames = viewNames;
        label.viewIcons = viewIcons;
        labels[blockId] = label;
      } catch (error) {
        console.warn("[Dodo 自定义视图] 数据库名称读取失败，使用块名称", blockId, error);
      }
    }));
  }
  return labels;
}

export async function openAppDatabaseBlock(ref: CustomAppReference): Promise<void> {
  if (!BLOCK_ID.test(ref.blockId)) throw new Error("数据库块 ID 无效，无法定位");
  await openTab({app:plugin.app,doc:{id:ref.blockId},openNewTab:true});
}