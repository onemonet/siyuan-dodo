import type { PreparedMarkdownZip, ZipAsset, EmbeddedFrame } from "./markdown-zip";
import { planIncremental, sha256 } from "./incremental-plan";
import type { NotionSyncManifest, SyncedAsset, SyncedEmbed } from "./incremental-plan";

const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function headers(token: string, json = true): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Notion-Version": VERSION,
    ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function api(token: string, path: string, method = "GET", body?: unknown, attempt = 0): Promise<any> {
  const response = await fetch(`${API}${path}`, {
    method, headers: headers(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 429 && attempt < 3) {
    const seconds = Number(response.headers.get("Retry-After") || "1");
    await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(15, seconds)) * 1000));
    return api(token, path, method, body, attempt + 1);
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Notion API ${method} ${path.split("?")[0]} (${response.status})：${value?.message || response.statusText}`);
  if (value?.object === "async_task") {
    throw new Error("Notion 返回异步任务。当前分享流程不接受未完成的写入，请缩短文章或分批同步。");
  }
  return value;
}

export function pageIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!/^(?:www\.)?notion\.so$/.test(parsed.hostname) && parsed.hostname !== "app.notion.com") return "";
    const id = parsed.pathname.match(/([0-9a-f]{32})(?:\/)?$/i)?.[1] || "";
    if (id.length !== 32) return "";
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  } catch { return ""; }
}

export interface PageStatus {
  id: string;
  url: string;
  lastEdited: string;
  dataSourceId: string;
  databaseId: string;
}
export async function getNotionPageStatus(token: string, url: string): Promise<PageStatus> {
  const id = pageIdFromUrl(url);
  if (!id) throw new Error("Notion 页面地址无效，拒绝覆盖其他页面。");
  const page = await api(token, `/pages/${id}`);
  if (page.in_trash || page.archived) throw new Error("目标 Notion 页面已归档或进入回收站，无法覆盖。");
  return { id: page.id, url: page.url, lastEdited: page.last_edited_time || "",
    dataSourceId: page.parent?.data_source_id || "", databaseId: page.parent?.database_id || "" };
}

async function getDestination(token: string, databaseId: string): Promise<{ dataSourceId: string; titleField: string }> {
  const dbId = databaseId.trim().replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i, "$1-$2-$3-$4-$5");
  if (!UUID.test(dbId)) throw new Error("Notion Database ID 格式无效。");
  const db = await api(token, `/databases/${dbId}`);
  const sources = Array.isArray(db.data_sources) ? db.data_sources : [];
  if (sources.length !== 1) throw new Error("Notion 数据库包含多个数据源，请明确选择目标数据源后再分享。");
  const dataSourceId = sources[0]?.id;
  if (!UUID.test(dataSourceId || "")) throw new Error("Notion 数据库未返回有效数据源 ID。");
  const source = await api(token, `/data_sources/${dataSourceId}`);
  const titleField = Object.entries(source.properties || {}).find(([, value]) => (value as any)?.type === "title")?.[0] || "";
  if (!titleField) throw new Error("Notion 数据源缺少标题字段。");
  return { dataSourceId, titleField };
}

async function uploadNotionAsset(token: string, asset: ZipAsset): Promise<string> {
  if (asset.blob.size > 20 * 1024 * 1024) throw new Error(`Notion 单次文件上传上限为 20MB：${asset.name}，较大的音视频需要分片上传，已取消本次同步。`);
  const created = await api(token, "/file_uploads", "POST", {
    mode: "single_part", filename: asset.name, content_type: asset.mime,
  });
  if (!UUID.test(created?.id || "")) throw new Error(`创建 Notion 文件上传会话失败：${asset.name}`);
  const form = new FormData();
  form.append("file", asset.blob, asset.name);
  const response = await fetch(`${API}/file_uploads/${created.id}/send`, {
    method: "POST", headers: headers(token, false), body: form,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status === "failed") {
    throw new Error(`上传附件「${asset.name}」失败：${result?.message || response.status}`);
  }
  return created.id;
}

interface MarkerLocation { id: string; parentId: string }
/** Notion 可能将 Markdown 占位符放入折叠、引用等子块，递归定位原生块以避免错位。 */
async function findMarkers(token: string, pageId: string, markers: string[]): Promise<Map<string, MarkerLocation>> {
  const targets = new Set(markers);
  const found = new Map<string, MarkerLocation>();
  let requests = 0;
  const scan = async (parentId: string, depth: number): Promise<void> => {
    if (found.size === targets.size) return;
    if (depth > 6) throw new Error("Notion 内容嵌套过深，无法准确插入本地图片。");
    let cursor = "";
    const descendants: string[] = [];
    do {
      if (++requests > 200) throw new Error("Notion 页面块数量过大，图片位置扫描超出限制。");
      const query = `page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = await api(token, `/blocks/${parentId}/children?${query}`);
      for (const block of data.results || []) {
        const contents = block[block.type];
        const text = (contents?.rich_text || []).map((part: any) => part.plain_text || part.text?.content || "").join("").trim();
        if (targets.has(text)) found.set(text, { id: block.id, parentId });
        if (block.has_children) descendants.push(block.id);
      }
      cursor = data.has_more ? data.next_cursor : "";
      if (data.has_more && !cursor) throw new Error("Notion 分页缺少继续游标，图片位置扫描终止。");
    } while (cursor);
    for (const id of descendants) {
      if (found.size === targets.size) return;
      await scan(id, depth + 1);
    }
  };
  await scan(pageId, 0);
  if (found.size !== targets.size) {
    throw new Error(`Notion Markdown 解析后只能定位 ${found.size}/${targets.size} 个资源占位符，已停止插入以防图片错位。`);
  }
  return found;
}
function asMediaBlock(kind: string, uploadId: string, name: string): Record<string, unknown> {
  const blockType = kind === "file" && name.toLowerCase().endsWith(".pdf") ? "pdf" : kind;
  return { object: "block", type: blockType, [blockType]: {
    type: "file_upload", file_upload: { id: uploadId },
    ...(blockType === "file" ? { name } : {}),
  } };
}

/** 插入后返回新块 ID；只在明确拿到 ID 时删除旧块，避免留下不可跟踪的媒体。 */
async function insertBlock(token: string, parentId: string, afterId: string, block: Record<string, unknown>): Promise<string> {
  const result = await api(token, `/blocks/${parentId}/children`, "PATCH", {
    children: [block], position: { type: "after_block", after_block: { id: afterId } },
  });
  const blockId = result?.results?.[0]?.id;
  if (!UUID.test(blockId || "")) throw new Error("Notion 已插入媒体但未返回新块 ID；为避免误删旧文件，已暂停同步。");
  return blockId;
}

async function insertMarkdownMedia(token: string, pageId: string, assets: ZipAsset[], uploadIds: string[], embeds: EmbeddedFrame[], digests: string[]): Promise<{ assets: SyncedAsset[]; embeds: SyncedEmbed[] }> {
  const items = [
    ...assets.map((asset, i) => ({ marker: asset.marker, index: i, kind: "asset" as const })),
    ...embeds.map((embed, i) => ({ marker: embed.marker, index: i, kind: "embed" as const })),
  ].sort((a, b) => Number(a.marker.match(/MARKER_(\d+)_/)?.[1] || 0) - Number(b.marker.match(/MARKER_(\d+)_/)?.[1] || 0));
  const positions = items.length ? await findMarkers(token, pageId, items.map(item => item.marker)) : new Map<string, MarkerLocation>();
  const savedAssets: SyncedAsset[] = new Array(assets.length);
  const savedEmbeds: SyncedEmbed[] = new Array(embeds.length);
  for (const item of items) {
    const { id: placeholderId, parentId } = positions.get(item.marker)!;
    const asset = item.kind === "asset" ? assets[item.index] : null;
    const embed = item.kind === "embed" ? embeds[item.index] : null;
    const block = asset ? asMediaBlock(asset.kind, uploadIds[item.index], asset.name) : { object: "block", type: "embed", embed: { url: embed!.url } };
    const id = await insertBlock(token, parentId, placeholderId, block);
    if (asset) {
      savedAssets[item.index] = { marker: asset.marker, path: asset.path, kind: asset.kind,
        digest: digests[item.index], uploadId: uploadIds[item.index], parentId, blockId: id };
    } else {
      savedEmbeds[item.index] = { marker: embed!.marker, url: embed!.url, parentId, blockId: id };
    }
    await api(token, `/blocks/${placeholderId}`, "DELETE");
  }
  return { assets: savedAssets, embeds: savedEmbeds };
}

async function reusableUpload(token: string, uploadId: string): Promise<boolean> {
  if (!UUID.test(uploadId || "")) return false;
  try {
    const item = await api(token, `/file_uploads/${uploadId}`);
    return item?.status === "uploaded" && !item?.in_trash &&
      (!item?.expiry_time || Date.parse(item.expiry_time) > Date.now() + 120_000);
  } catch { return false; }
}

/** 只在唯一命中的原文上执行定点替换，不碰旁边的原生图片/视频块。 */
async function updateExactText(token: string, pageId: string, edit: { old_str: string; new_str: string }): Promise<void> {
  const markdown = await api(token, `/pages/${pageId}/markdown`);
  if (markdown?.truncated || (markdown?.unknown_block_ids?.length || 0) > 0) {
    throw new Error("NEEDS_FULL_SYNC:Notion 正文无法完整读取，不能进行可靠的文字局部更新");
  }
  const remoteText = String(markdown?.markdown || "");
  if (!remoteText.includes(edit.old_str) || remoteText.split(edit.old_str).length !== 2) {
    throw new Error("NEEDS_FULL_SYNC:Notion 文字内容和上次同步基线不匹配，无法唯一定位修改位置");
  }
  await api(token, `/pages/${pageId}/markdown`, "PATCH", {
    type: "update_content", update_content: { content_updates: [edit] },
  });
}

export interface MarkdownPublishInput {
  token: string;
  databaseId: string;
  title: string;
  exportZip: PreparedMarkdownZip;
  existingPageUrl: string;
  expectedEditedTime: string;
  allowOverwrite: boolean;
  previousManifest?: NotionSyncManifest | null;
  forceFull?: boolean;
  onCreated?: (url: string) => Promise<void>;
}
export interface MarkdownPublishResult {
  url: string; lastEdited: string; manifest: NotionSyncManifest; mode: "skipped" | "incremental" | "full";
  uploaded: number; reused: number;
}

export async function publishMarkdownZip(input: MarkdownPublishInput): Promise<MarkdownPublishResult> {
  const { dataSourceId, titleField } = await getDestination(input.token, input.databaseId);
  const existing = input.existingPageUrl ? await getNotionPageStatus(input.token, input.existingPageUrl) : null;
  if (existing) {
    if (existing.dataSourceId && existing.dataSourceId !== dataSourceId) throw new Error("Notion 页面不属于目标数据源，拒绝覆盖。");
    if (existing.databaseId && existing.databaseId.replace(/-/g, "") !== input.databaseId.replace(/-/g, "")) {
      throw new Error("原分享页面不属于当前数据库，拒绝覆盖。");
    }
    if (!input.allowOverwrite && (!input.expectedEditedTime || input.expectedEditedTime !== existing.lastEdited)) {
      throw new Error("Notion 页面已在上次成功同步后修改，需要先确认覆盖。");
    }
  }
  const zip = input.exportZip;
  if (!zip.markdown.trim()) throw new Error("思源原生 Markdown 内容为空。");
  if (zip.markdown.length > 200_000 || zip.markdown.length + zip.assets.length * 300 + (zip.embeds || []).length * 180 > 240_000) {
    throw new Error("增量索引过大，无法安全保存同步快照，请拆分笔记后重试。");
  }
  const digests = await Promise.all(zip.assets.map(asset => sha256(asset.blob)));
  const embeds = zip.embeds || [];
  const previous = existing && input.previousManifest?.pageId === existing.id ? input.previousManifest : null;
  const decision = existing ? planIncremental(previous, zip, input.title, digests) : { mode: "full" as const, reason: "new page" };
  if (existing && input.allowOverwrite && !input.forceFull && decision.mode === "noop") {
    throw new Error("NEEDS_FULL_SYNC:Notion 页面已被外部修改，不能将该状态当作新的同步基线");
  }
  if (existing && decision.mode === "full" && !input.forceFull) {
    throw new Error(`NEEDS_FULL_SYNC:${decision.reason}。可确认一次完整重建，未变化资源将优先复用已上传文件。`);
  }
  if (existing && decision.mode === "noop" && !input.forceFull) {
    return { url: existing.url, lastEdited: existing.lastEdited, manifest: previous!, mode: "skipped", uploaded: 0, reused: zip.assets.length };
  }
  let uploaded = 0;
  let reused = 0;
  let pageId = existing?.id || "";
  let pageUrl = existing?.url || "";
  const nextAssets = previous?.assets.map(x => ({ ...x })) || [];
  const nextEmbeds = previous?.embeds.map(x => ({ ...x })) || [];
  if (existing && decision.mode === "delta" && !input.forceFull) {
    // Preflight: do not edit the page if the Markdown range cannot be located.
    if (decision.textUpdate) {
      const old = await api(input.token, `/pages/${pageId}/markdown`);
      const text = String(old?.markdown || "");
      if (old?.truncated || old?.unknown_block_ids?.length || text.split(decision.textUpdate.old_str).length !== 2) {
        throw new Error("NEEDS_FULL_SYNC:文字修改位置已变化，无法无损增量更新");
      }
    }
    for (const index of decision.changedAssets) {
      const asset = zip.assets[index];
      const uploadId = await uploadNotionAsset(input.token, asset);
      uploaded++;
      const prev = nextAssets[index];
      // Insert before deleting old media: unchanged neighbors preserve both block IDs and files.
      const blockId = await insertBlock(input.token, prev.parentId, prev.blockId,
        asMediaBlock(asset.kind, uploadId, asset.name));
      await api(input.token, `/blocks/${prev.blockId}`, "DELETE");
      nextAssets[index] = { ...prev, uploadId, blockId, digest: digests[index] };
    }
    for (const index of decision.changedEmbeds) {
      const embed = embeds[index];
      const prev = nextEmbeds[index];
      const blockId = await insertBlock(input.token, prev.parentId, prev.blockId,
        { object: "block", type: "embed", embed: { url: embed.url } });
      await api(input.token, `/blocks/${prev.blockId}`, "DELETE");
      nextEmbeds[index] = { ...prev, url: embed.url, blockId };
    }
    reused = zip.assets.length - uploaded;
    if (decision.textUpdate) await updateExactText(input.token, pageId, decision.textUpdate);
    if (input.title !== previous!.title) {
      await api(input.token, `/pages/${pageId}`, "PATCH", {
        properties: { [titleField]: { title: [{ text: { content: input.title.slice(0, 2000) } }] } },
      });
    }
  } else {
    // Full reconstruction (explicit confirmation for an existing page).
    // Reuse only a matching SHA-256 and a live Notion file upload ID; never trust old signed URLs.
    const cache = new Map<string, string>();
    const uploadIds: string[] = [];
    for (let i = 0; i < zip.assets.length; i++) {
      const asset = zip.assets[i];
      const key = `${asset.kind}:${digests[i]}`;
      let uploadId = cache.get(key);
      if (uploadId) reused++;
      if (!uploadId && previous) {
        const old = previous.assets.find(x => x.digest === digests[i] && x.kind === asset.kind);
        if (old && await reusableUpload(input.token, old.uploadId)) { uploadId = old.uploadId; reused++; }
      }
      if (!uploadId) { uploadId = await uploadNotionAsset(input.token, asset); uploaded++; }
      cache.set(key, uploadId);
      uploadIds.push(uploadId);
    }
    if (existing) {
      const now = await getNotionPageStatus(input.token, pageUrl);
      if (!input.allowOverwrite && now.lastEdited !== existing.lastEdited) {
        throw new Error("资源准备期间 Notion 页面被修改，已取消覆盖。");
      }
      await api(input.token, `/pages/${pageId}/markdown`, "PATCH", {
        type: "replace_content", replace_content: { new_str: zip.markdown },
      });
      if (input.title !== previous?.title) {
        await api(input.token, `/pages/${pageId}`, "PATCH", {
          properties: { [titleField]: { title: [{ text: { content: input.title.slice(0, 2000) } }] } },
        });
      }
    } else {
      const page = await api(input.token, "/pages", "POST", {
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: { [titleField]: { title: [{ text: { content: input.title.slice(0, 2000) } }] } },
        markdown: zip.markdown,
      });
      pageId = page?.id || ""; pageUrl = page?.url || "";
      if (!UUID.test(pageId) || !pageUrl) throw new Error("Notion 新页面缺少 ID 或 URL。");
      await input.onCreated?.(pageUrl);
    }
    const mapping = await insertMarkdownMedia(input.token, pageId, zip.assets, uploadIds, embeds, digests);
    nextAssets.splice(0, nextAssets.length, ...mapping.assets);
    nextEmbeds.splice(0, nextEmbeds.length, ...mapping.embeds);
  }
  const finalPage = await getNotionPageStatus(input.token, pageUrl);
  const manifest: NotionSyncManifest = {
    version: 2, pageId, title: input.title, sourceMarkdown: zip.markdown,
    assets: nextAssets, embeds: nextEmbeds,
  };
  return { url: finalPage.url || pageUrl, lastEdited: finalPage.lastEdited,
    manifest, mode: existing && decision.mode === "delta" && !input.forceFull ? "incremental" : "full", uploaded, reused };
}