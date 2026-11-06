export const MAP_IFRAME_PATH = "/plugins/siyuan-dodo/preview/map/index.html";
export const MAP_PROVIDER_SETTING_KEY = "map-provider";
export const MAP_AMAP_KEY_SETTING_KEY = "map-amap-key";
export const MAP_GOOGLE_KEY_SETTING_KEY = "map-google-key";
export const MAP_GOOGLE_MAP_ID_SETTING_KEY = "map-google-map-id";
export const MAP_AMAP_API2_SETTING_KEY = "map-amap-api2";
export const MAP_SEARCH_ENABLED_SETTING_KEY = "map-search-enabled";
export const MAP_MARKER_BG_SETTING_KEY = "map-marker-background-color";
export const MAP_MARKER_TEXT_SETTING_KEY = "map-marker-text-color";

export type MapSource = "osm" | "amap" | "google";

export interface MapFieldMapping {
  coordinate: string;
  image: string;
}

export interface MapBlockConfig {
  fieldMapping: MapFieldMapping;
  /** Preview height in px. Missing values use the original 520px default. */
  height?: number;
  /** Previous native table label, used only for a safe return from map mode. */
  originalView?: { name: string; icon: string; appliedIcon: string };
}

export interface MapGlobalSettings {
  mapSource: MapSource;
  amapKey: string;
  googleKey: string;
  googleMapId: string;
  useAmapApi2: boolean;
  searchEnabled: boolean;
  markerBackgroundColor: string;
  markerTextColor: string;
}

export interface MapTableData {
  headers: string[];
  columnIds: string[];
  columnNames: string[];
  rows: string[][];
  /** 与 headers 下标对应的思源数据库字段类型。 */
  fieldTypes: string[];
  /** 数据库条目（行）的 itemID，与 rows 顺序一一对应。 */
  rowBlockIds?: string[];
  /** 与条目绑定的实际文档 ID，未绑定时为空。 */
  rowBoundBlockIds?: string[];
  /** 主键单元格的 value ID。 */
  rowValueIds?: string[];
  avID?: string;
  databaseBlockID?: string;
}

export interface MapPoint {
  /** 真实绑定文档 ID；独立数据库行没有此字段。 */
  blockId: string;
  itemId: string;
  valueId: string;
  avID: string;
  databaseBlockID: string;
  longitude: number;
  latitude: number;
  title: string;
  description: string;
  displayText?: string;
  image?: string;
}

export interface MapUnlocatedItem {
  itemId: string;
  valueId: string;
  blockId: string;
  avID: string;
  databaseBlockID: string;
  title: string;
}

export interface MapPreviewData {
  points: MapPoint[];
  /** Existing database rows with an empty native location cell; never new rows. */
  unlocated?: MapUnlocatedItem[];
  message: string;
}

export const DEFAULT_MAP_CONFIG: MapBlockConfig = {
  fieldMapping: {
    coordinate: "",
    image: "",
  },
};

export const DEFAULT_MAP_GLOBAL_SETTINGS: MapGlobalSettings = {
  mapSource: "osm",
  amapKey: "",
  googleKey: "",
  googleMapId: "",
  useAmapApi2: false,
  searchEnabled: true,
  markerBackgroundColor: "#ffffff",
  markerTextColor: "#202124",
};

export function parseMapConfig(raw?: string): MapBlockConfig {
  try {
    const value = JSON.parse(raw || "{}");
    const fieldMapping = value?.fieldMapping && typeof value.fieldMapping === "object"
      ? value.fieldMapping
      : {};
    const original = value?.originalView;
    return {
      fieldMapping: {
        coordinate: typeof fieldMapping.coordinate === "string"
          ? fieldMapping.coordinate
          : (typeof value?.coordinateColumn === "string" ? value.coordinateColumn : ""),
        image: typeof fieldMapping.image === "string"
          ? fieldMapping.image
          : (typeof value?.imageColumn === "string" ? value.imageColumn : ""),
      },      ...(typeof value?.height === "number" && Number.isFinite(value.height)
        ? { height: Math.min(1200, Math.max(320, Math.round(value.height))) } : {}),

      ...(original && typeof original.name === "string" && typeof original.icon === "string" &&
        typeof original.appliedIcon === "string" ? {
          originalView: { name: original.name, icon: original.icon, appliedIcon: original.appliedIcon },
        } : {}),
    };
  } catch {
    return { fieldMapping: { ...DEFAULT_MAP_CONFIG.fieldMapping } };
  }
}

function normalizeMapMarkerColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase() : fallback;
}

export function normalizeMapGlobalSettings(value?: Partial<MapGlobalSettings> | null): MapGlobalSettings {
  return {
    mapSource: value?.mapSource === "amap" || value?.mapSource === "google" ? value.mapSource : "osm",
    amapKey: typeof value?.amapKey === "string" ? value.amapKey.trim() : "",
    googleKey: typeof value?.googleKey === "string" ? value.googleKey.trim() : "",
    googleMapId: typeof value?.googleMapId === "string" ? value.googleMapId.trim() : "",
    useAmapApi2: value?.useAmapApi2 === true,
    searchEnabled: value?.searchEnabled !== false,
    markerBackgroundColor: normalizeMapMarkerColor(value?.markerBackgroundColor, DEFAULT_MAP_GLOBAL_SETTINGS.markerBackgroundColor),
    markerTextColor: normalizeMapMarkerColor(value?.markerTextColor, DEFAULT_MAP_GLOBAL_SETTINGS.markerTextColor),
  };
}

/** 单个字段按“经度,纬度”读取，绝不猜测或交换经纬度顺序。 */
export function parseCoordinate(raw: string): [number, number] | null {
  let value = raw.trim();
  for (const [left, right] of [["[", "]"], ["(", ")"], ["（", "）"], ["`", "`"]]) {
    if (value.startsWith(left) && value.endsWith(right)) {
      value = value.slice(1, -1).trim();
      break;
    }
  }
  const match = value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*[,，;；]\s*|\s+)([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
    return null;
  }
  return [longitude, latitude];
}

/**
 * Check the ORIGINAL typed SiYuan location cell, not only the flattened
 * coordinate string. Invalid originalInput/name must NOT be treated as empty.
 */
export function nativeLocationHasValue(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const location = input as Record<string, unknown>;
  return ["name", "originalInput"].some(key =>
    typeof location[key] === "string" && (location[key] as string).trim().length > 0) ||
    ["longitude", "latitude"].some(key =>
      typeof location[key] === "number" && Number.isFinite(location[key])) ||
    location.isNotEmpty === true;
}

/** 坐标只能映射数据库原生 location 位置列。 */
export function getMapLocationColumns(table: Pick<MapTableData, "headers" | "fieldTypes">): string[] {
  return table.headers.filter((_, index) => table.fieldTypes[index] === "location");
}

/** 图片只允许映射数据库原生 mAsset 资源列。 */
export function getMapAssetColumns(table: Pick<MapTableData, "headers" | "fieldTypes">): string[] {
  return table.headers.filter((_, index) => table.fieldTypes[index] === "mAsset");
}

import { resolveFieldBinding } from "../../shared/av/field-binding";

export function buildMapPreviewData(
  table: MapTableData,
  fieldMapping: MapFieldMapping,
): MapPreviewData {
  const coordinateColumn = fieldMapping.coordinate || "";
  const coordinateResolution = resolveFieldBinding(table, coordinateColumn, ["location"]);
  const coordinateColumnIndex = coordinateResolution.status === "resolved" ? coordinateResolution.index : -1;
  if (coordinateResolution.status === "invalid-type") {
    return { points: [], message: "坐标字段不是位置类型，请在地图设置中重新选择位置列。" };
  }
  if (!coordinateColumn || coordinateColumnIndex < 0) {
    return {
      points: [],
      message: coordinateColumn
        ? "坐标字段已不存在，请在地图设置中重新选择。"
        : getMapLocationColumns(table).length
          ? "请在地图设置中映射位置类型的坐标字段。"
          : "来源数据库没有位置类型字段，请先新增位置列。",
    };
  }
  if (table.fieldTypes[coordinateColumnIndex] !== "location") {
    return { points: [], message: "坐标字段不是位置类型，请在地图设置中重新选择位置列。" };
  }
  // 主键 block 列是地图标题的唯一来源，与列名、列顺序和旧标题映射无关。
  const primaryKeyIndex = table.fieldTypes.indexOf("block");
  const imageResolution = fieldMapping.image ? resolveFieldBinding(table, fieldMapping.image, ["mAsset"]) : null;
  const configuredImageIndex = imageResolution?.status === "resolved" ? imageResolution.index : -1;
  const imageColumnIndex = configuredImageIndex >= 0 && table.fieldTypes[configuredImageIndex] === "mAsset"
    ? configuredImageIndex : -1;
  const points: MapPoint[] = [];
  const unlocated: MapUnlocatedItem[] = [];
  let skipped = 0;
  table.rows.forEach((row, rowIndex) => {
    const rawLocation = String(row[coordinateColumnIndex] || "");
    const coordinate = parseCoordinate(rawLocation);
    const title = normalizeDisplayText(primaryKeyIndex >= 0 ? row[primaryKeyIndex] || "" : "")
      || `第 ${rowIndex + 1} 行`;
    if (!coordinate) {
      skipped += 1;
      // A nonempty invalid coordinate must not be silently overwritten.
      const itemId = table.rowBlockIds?.[rowIndex] || "";
      if (!rawLocation.trim() && /^\d{14}-[a-z0-9]{7}$/.test(itemId) &&
          /^\d{14}-[a-z0-9]{7}$/.test(table.avID || "") &&
          /^\d{14}-[a-z0-9]{7}$/.test(table.databaseBlockID || "")) {
        unlocated.push({
          itemId, valueId: table.rowValueIds?.[rowIndex] || "",
          blockId: table.rowBoundBlockIds?.[rowIndex] || "",
          avID: table.avID!, databaseBlockID: table.databaseBlockID!, title,
        });
      }
      return;
    }
    // 图片只有显式映射时才读取；没有映射或映射字段无图片时，由标题承担地图上的显示内容。
    const image = imageColumnIndex >= 0
      ? findImage(String(row[imageColumnIndex] || ""))
      : undefined;
    points.push({
      blockId: table.rowBoundBlockIds?.[rowIndex] || "",
      itemId: table.rowBlockIds?.[rowIndex] || "",
      valueId: table.rowValueIds?.[rowIndex] || "",
      avID: table.avID || "",
      databaseBlockID: table.databaseBlockID || "",
      longitude: coordinate[0],
      latitude: coordinate[1],
      title,
      description: table.headers.map((header, index) => `${header}：${row[index] || ""}`).join("\n"),
      displayText: image ? undefined : title,
      image,
    });
  });
  const message = !table.rows.length ? "来源暂无数据。" : !points.length
    ? "未找到有效位置坐标，请检查位置列中的经纬度数据。"
    : `${points.length} 个地点${skipped ? ` · 已跳过 ${skipped} 行空值或无效坐标` : ""}`;
  return { points, unlocated, message };
}

/** 高德逆地理编码只提供可选名称；合法坐标不应因海外权限或无 POI 而无法创建。 */
export type PointNameFallback = "no-key" | "no-result" | "overseas" | "lookup-failed";
export interface MapPointNameResult {
  name: string;
  fallback: PointNameFallback | null;
}

/** 与位置列原始输入统一采用「经度,纬度」(WGS84) 顺序。 */
export function coordinatePointName(longitude: number, latitude: number): string {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
    throw new Error("无法使用无效经纬度创建标记。");
  }
  return `坐标 ${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

export async function chooseMapPointName(
  longitude: number,
  latitude: number,
  lookup?: () => Promise<string>,
): Promise<MapPointNameResult> {
  const fallbackName = coordinatePointName(longitude, latitude);
  if (!lookup) return { name: fallbackName, fallback: "no-key" };
  try {
    const name = (await lookup()).trim();
    return name
      ? { name, fallback: null }
      : { name: fallbackName, fallback: "no-result" };
  } catch (error) {
    const info = error instanceof Error ? error.message : String(error || "");
    return {
      name: fallbackName,
      fallback: /20011|INSUFFICIENT_ABROAD_PRIVILEGES|海外.*权限|境外.*权限/i.test(info)
        ? "overseas" : "lookup-failed",
    };
  }
}

/** 悬浮/列表标题最多 20 个可见字符，超出用省略号占据最后一位。 */
export function truncateMapHoverTitle(raw: string, limit = 20): string {
  const chars = Array.from(normalizeDisplayText(raw));
  if (chars.length <= limit) return chars.join("");
  return `${chars.slice(0, Math.max(0, limit - 1)).join("")}…`;
}

/** 地图标签只展示纯文本；超过 10 个字符时显示前 10 个字符和省略号。 */
export function truncateMapDisplayText(raw: string, limit = 10): string {
  const value = normalizeDisplayText(raw);
  const chars = Array.from(value);
  return chars.length > limit ? `${chars.slice(0, limit).join("")}...` : value;
}

function normalizeDisplayText(raw: string): string {
  return String(raw || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function findImage(value: string): string | undefined {
  const markdown = value.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
  const html = value.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
  const plain = /^\s*((?:https?:\/\/|\/|\.\/|assets\/).+?\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:\?[^\s]*)?)\s*$/i.exec(value)?.[1];
  const raw = (markdown || html || plain)?.trim();
  if (!raw) return undefined;
  // mAsset 同时可保存 PDF/文档等资源；只有图片扩展名才能用作地图缩略图。
  if (!/\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#].*)?$/i.test(raw) &&
      !/^data:image\//i.test(raw)) return undefined;
  if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  return raw.startsWith("/") ? raw : `/${raw.replace(/^\.\//, "")}`;
}
