import type { AvRenderData } from "./av-data-adapter";
type BlockDataType = "markdown" | "dom";

interface KernelResponse<T> {
  code: number;
  msg?: string;
  data: T;
}

interface BlockKramdownData {
  id?: string;
  kramdown: string;
}

export async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as KernelResponse<T>;
  if (result.code !== 0) {
    throw new Error(result.msg || `Kernel request failed: ${url}`);
  }

  return result.data;
}

export async function getBlockKramdown(id: string): Promise<BlockKramdownData> {
  return postJson<BlockKramdownData>("/api/block/getBlockKramdown", { id });
}

export async function getBlockDOM(id: string): Promise<{ dom: string }> {
  return postJson<{ dom: string }>("/api/block/getBlockDOM", { id });
}

export interface RenderAttributeViewPayload {
  id: string;
  blockID?: string;
  viewID?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  createIfNotExist?: boolean;
}

/** Typed native response; flatten only at a renderer's presentation edge.
 * ponytail: callers currently use one large page; add pagination when native
 * rowCount exceeds the returned records, without caching a second database.
 */
export async function renderAttributeView(
  payload: RenderAttributeViewPayload
): Promise<AvRenderData> {
  const data = await postJson<AvRenderData>("/api/av/renderAttributeView", {
    page: 1, createIfNotExist: false,
    ...payload,
  });
  const resolvedView = data?.viewID || data?.view?.id;
  if (payload.viewID && resolvedView && resolvedView !== payload.viewID) {
    throw new Error("数据库返回了不同的视图，已停止使用过期数据。");
  }
  return data;
}

/** Authoritative database name. renderAttributeView may omit its top-level name in some SiYuan versions. */
export async function getAttributeViewName(avID: string): Promise<string> {
  const data = await postJson<{ av?: { name?: string } }>("/api/av/getAttributeView", { id: avID });
  return data?.av?.name?.trim() || "";
}

export async function updateBlock(
  dataType: BlockDataType,
  data: string,
  id: string
): Promise<unknown> {
  return postJson<unknown>("/api/block/updateBlock", {
    dataType,
    data,
    id,
  });
}

export async function insertBlock(
  dataType: BlockDataType,
  data: string,
  nextID?: string,
  previousID?: string
): Promise<unknown> {
  return postJson<unknown>("/api/block/insertBlock", {
    dataType,
    data,
    nextID,
    previousID,
  });
}

export async function getBlockAttrs(id: string): Promise<Record<string, string>> {
  return postJson<Record<string, string>>("/api/attr/getBlockAttrs", { id });
}

export async function setBlockAttrs(
  id: string,
  attrs: Record<string, string | null>
): Promise<unknown> {
  return postJson<unknown>("/api/attr/setBlockAttrs", { id, attrs });
}

export interface AppearanceConf {
  /** 模式：0 明亮，1 暗黑（modeOS 跟随系统时为思源解析后的有效值） */
  mode: number;
  modeOS: boolean;
  themeDark?: string;
  themeLight?: string;
}

/** 读取内核外观配置（/api/system/getConf 的 appearance 段） */
export async function getAppearanceConf(): Promise<AppearanceConf> {
  const data = await postJson<{
    appearance?: AppearanceConf;
    conf?: { appearance?: AppearanceConf };
  }>("/api/system/getConf", {});
  // 内核返回 data.conf.appearance；兼容顶层 data.appearance 的旧结构
  const appearance = data?.appearance || data?.conf?.appearance;
  if (!appearance || typeof appearance.mode !== "number") {
    // 结构异常时抛错，让调用方回退宿主同步值，而不是默认亮色
    throw new Error("Unexpected /api/system/getConf response shape.");
  }
  return appearance;
}
