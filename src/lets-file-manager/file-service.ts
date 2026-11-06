import { postJsonWithTimeout } from "../request-utils";

export interface AssetEntry {
  name: string;
  isDir: boolean;
  updated?: number;
  size?: number;
}
export type AssetKind = "image" | "video" | "audio" | "document" | "archive" | "other";
export interface AssetReference {
  type?: string;
  notebook?: string;
  rootID?: string;
  blockID?: string;
  path?: string;
  reference?: string;
  relinkable?: boolean;
}
export interface AssetReferences {
  references: AssetReference[];
  skippedNotebooks?: string[];
  unavailableAttributeViews?: Array<{ reason?: string; hPath?: string }>;
  updated?: number;
}
interface ApiReply<T> {
  code: number;
  msg?: string;
  data: T;
}
const API_TIMEOUT = 30000;

function cleanName(name: string): string {
  if (!name || name === "." || name === ".." ||
      name.includes("/") || name.includes("\\") || /[\u0000-\u001f]/.test(name)) {
    throw new Error("文件名包含不支持的字符。");
  }
  return name;
}

export function normalizeFolder(folder: string): string {
  const normalized = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";
  return normalized.split("/").map(cleanName).join("/");
}

export function assetRelativePath(folder: string, name: string): string {
  const safeFolder = normalizeFolder(folder);
  const safeName = cleanName(name);
  return safeFolder ? safeFolder + "/" + safeName : safeName;
}

export function assetUrl(relativePath: string, cache = ""): string {
  const segments = normalizeFolder(relativePath).split("/");
  const path = segments.map(encodeURIComponent).join("/");
  return "/assets/" + path + (cache ? "?v=" + encodeURIComponent(cache) : "");
}

export function assetKind(name: string): AssetKind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif", "apng"].includes(extension)) return "image";
  if (["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"].includes(extension)) return "video";
  if (["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"].includes(extension)) return "audio";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "epub"].includes(extension)) return "document";
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "archive";
  return "other";
}

export function formatSize(size: number | null | undefined): string {
  if (size === null || size === undefined || !Number.isFinite(size)) return "未知";
  if (size < 1024) return Math.max(0, size) + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return value.toFixed(value < 10 ? 1 : 0) + " " + units[i];
}

export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "未知";
  // SiYuan's readDir timestamp may be seconds or milliseconds.
  const value = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN", { hour12: false });
}

async function callApi<T>(endpoint: string, body: unknown, timeoutMs = API_TIMEOUT): Promise<T> {
  const result = await postJsonWithTimeout<ApiReply<T>>(endpoint, body, {}, {
    timeoutMs,
    errorPrefix: "文件管理",
  });
  if (!result || result.code !== 0) {
    throw new Error(result?.msg || "思源接口请求失败：" + endpoint);
  }
  return result.data;
}

// Cache directory metadata in memory so reopening a tab does not re-fetch thousands of names.
// This does not cache file bytes; the browser owns media caching.
export const DIRECTORY_CACHE_TTL_MS = 45_000;
const DIRECTORY_CACHE_CAPACITY = 32;
interface DirectorySnapshot { entries: AssetEntry[]; fetchedAt: number; }
const directoryCache = new Map<string, DirectorySnapshot>();
const inflight = new Map<string, { generation: number; promise: Promise<AssetEntry[]> }>();
const generations = new Map<string, number>();

export function getCachedAssetDirectory(folder: string): { entries: AssetEntry[]; isFresh: boolean } | null {
  const key = normalizeFolder(folder);
  const snapshot = directoryCache.get(key);
  if (!snapshot) return null;
  // Recently accessed folders stay in the cache longer.
  directoryCache.delete(key);
  directoryCache.set(key, snapshot);
  return { entries: snapshot.entries, isFresh: Date.now() - snapshot.fetchedAt < DIRECTORY_CACHE_TTL_MS };
}

export function invalidateAssetDirectory(folder: string): void {
  const key = normalizeFolder(folder);
  directoryCache.delete(key);
  generations.set(key, (generations.get(key) ?? 0) + 1);
  inflight.delete(key);
}

// /api/file/readDir stats each file individually. On large Windows folders this can take
// tens of seconds. SiYuan's searchAsset endpoint reads its in-memory asset index instead.
interface SearchAssetItem { path: string; updated?: number; }
const ASSET_SEARCH_PAGE_SIZE = 64;
const MAX_ASSET_SEARCH_PAGES = 300;
const LOCAL_WRITE_TTL_MS = 5 * 60_000;
const localAssets = new Map<string, { updated: number; createdAt: number }>();
const localRemovedAssets = new Map<string, number>();
const knownFolders = new Set<string>();
let indexedAssets: Map<string, number> | null = null;
let indexedAt = 0;
let indexInflight: Promise<Map<string, number>> | null = null;

async function loadAssetIndexPage(page: number, pageSize: number): Promise<SearchAssetItem[]> {
  const items = await callApi<SearchAssetItem[]>("/api/search/searchAsset", {
    k: "",
    page,
    pageSize,
    includeMetadata: false,
  });
  if (!Array.isArray(items)) throw new Error("资源索引返回格式错误。");
  return items;
}

async function fetchAssetIndex(forceRefresh: boolean): Promise<Map<string, number>> {
  if (!forceRefresh && indexedAssets && Date.now() - indexedAt < DIRECTORY_CACHE_TTL_MS) {
    return indexedAssets;
  }
  if (indexInflight) return indexInflight;
  const pending = (async () => {
    let pageSize = ASSET_SEARCH_PAGE_SIZE;
    const result = new Map<string, number>();
    for (let page = 1; page <= MAX_ASSET_SEARCH_PAGES; page++) {
      let items: SearchAssetItem[];
      try {
        items = await loadAssetIndexPage(page, pageSize);
      } catch (error) {
        // Search limit can be configured smaller than 64 in SiYuan.
        if (page === 1 && pageSize > 16) {
          pageSize = 16;
          items = await loadAssetIndexPage(1, pageSize);
        } else {
          throw error;
        }
      }
      const before = result.size;
      for (const item of items) {
        if (typeof item?.path !== "string" || !item.path.startsWith("assets/")) continue;
        try {
          const path = normalizeFolder(item.path.slice("assets/".length));
          if (path && !result.has(path)) result.set(path, Number(item.updated) || 0);
        } catch { /* Skip unsafe or malformed paths from index. */ }
      }
      // Old kernels without pagination may repeat the first page forever.
      if (items.length > 0 && result.size === before) {
        if (page > 1) throw new Error("资源索引分页未前进，已停止查询。");
      }
      if (items.length < pageSize) break;
      if (page === MAX_ASSET_SEARCH_PAGES) throw new Error("资源索引超出最大分页限制。");
    }
    if (result.size === 0) throw new Error("资源索引为空，改用目录读取。");
    indexedAssets = result;
    indexedAt = Date.now();
    return result;
  })();
  indexInflight = pending;
  try { return await pending; }
  finally { if (indexInflight === pending) indexInflight = null; }
}

function indexedDirectory(folder: string, index: Map<string, number>): AssetEntry[] {
  const prefix = folder ? folder + "/" : "";
  const directory = new Map<string, AssetEntry>();
  const now = Date.now();
  function collect(path: string, updated: number) {
    if (!path.startsWith(prefix)) return;
    const rest = path.slice(prefix.length);
    if (!rest) return;
    const slash = rest.indexOf("/");
    const name = slash < 0 ? rest : rest.slice(0, slash);
    if (!name) return;
    const isDir = slash >= 0;
    const prior = directory.get(name);
    if (!prior || (isDir && !prior.isDir)) {
      directory.set(name, { name, isDir, ...(!isDir ? { updated } : {}) });
    }
  }
  for (const [path, updated] of index) {
    if (!localRemovedAssets.has(path) || now - localRemovedAssets.get(path)! > LOCAL_WRITE_TTL_MS) {
      collect(path, updated);
    }
  }
  for (const [path, meta] of localAssets) {
    if (now - meta.createdAt <= LOCAL_WRITE_TTL_MS) collect(path, meta.updated);
    else localAssets.delete(path);
  }
  for (const path of knownFolders) {
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    if (!remainder) continue;
    const name = remainder.split("/")[0];
    if (name) directory.set(name, { name, isDir: true });
  }
  return Array.from(directory.values());
}

/** Make new files visible immediately even if the kernel asset index has not updated. */
function noteAssetChange(path: string, kind: "upsert" | "remove" | "folder"): void {
  const safe = normalizeFolder(path);
  const now = Date.now();
  if (kind === "folder") knownFolders.add(safe);
  else if (kind === "upsert") {
    localRemovedAssets.delete(safe);
    localAssets.set(safe, { updated: Math.floor(now / 1000), createdAt: now });
  } else {
    localAssets.delete(safe);
    localRemovedAssets.set(safe, now);
  }
  indexedAt = 0;
  assetSizeCache.delete("assets/" + safe);
  invalidateAssetDirectory(safe.split("/").slice(0, -1).join("/"));
}

/** Full disk scan is deliberately opt-in: kernel readDir is slow for large directories. */
export async function deepScanAssetDirectory(folder: string): Promise<AssetEntry[]> {
  const key = normalizeFolder(folder);
  const dirPath = "/data/assets" + (key ? "/" + key : "");
  const items = await callApi<AssetEntry[]>("/api/file/readDir", { path: dirPath });
  if (!Array.isArray(items)) throw new Error("磁盘扫描结果格式不正确。");
  const valid = items.filter((item) => {
    try { cleanName(item.name); return typeof item.isDir === "boolean"; }
    catch { return false; }
  });
  for (const item of valid) {
    if (item.isDir) knownFolders.add(assetRelativePath(key, item.name));
    else if (!indexedAssets?.has(assetRelativePath(key, item.name))) {
      const path = assetRelativePath(key, item.name);
      localAssets.set(path, { updated: item.updated ?? 0, createdAt: Date.now() });
    }
  }
  directoryCache.set(key, { entries: valid, fetchedAt: Date.now() });
  return valid;
}

export async function readAssetDirectory(
  folder: string,
  options: { forceRefresh?: boolean } = {},
): Promise<AssetEntry[]> {
  const key = normalizeFolder(folder);
  if (!options.forceRefresh) {
    const cached = getCachedAssetDirectory(key);
    if (cached?.isFresh) return cached.entries;
  }

  const generation = generations.get(key) ?? 0;
  const pending = inflight.get(key);
  if (pending?.generation === generation) return pending.promise;

  const promise = (async () => {
    let valid: AssetEntry[];
    try {
      const index = await fetchAssetIndex(options.forceRefresh === true);
      valid = indexedDirectory(key, index);
    } catch (error) {
      console.warn("[Dodo 文件管理] 快速索引不可用，回退原生目录读取", error);
      valid = await deepScanAssetDirectory(key);
    }
    if ((generations.get(key) ?? 0) === generation) {
      directoryCache.delete(key);
      directoryCache.set(key, { entries: valid, fetchedAt: Date.now() });
      if (directoryCache.size > DIRECTORY_CACHE_CAPACITY) {
        directoryCache.delete(directoryCache.keys().next().value as string);
      }
    }
    return valid;
  })();
  inflight.set(key, { generation, promise });
  try { return await promise; }
  finally {
    if (inflight.get(key)?.promise === promise) inflight.delete(key);
  }
}

// Stat sizes only on demand: the fast searchAsset index deliberately omits file sizes.
const ASSET_SIZE_CACHE_CAPACITY = 3000;
const assetSizeCache = new Map<string, { size: number; version: number }>();
const assetSizePending = new Map<string, Promise<number>>();

export async function getAssetSize(relativePath: string, version = 0): Promise<number> {
  const path = "assets/" + normalizeFolder(relativePath);
  const cached = assetSizeCache.get(path);
  if (cached && cached.version === version) return cached.size;
  const pendingKey = path + "@" + version;
  const pending = assetSizePending.get(pendingKey);
  if (pending) return pending;
  const promise = (async () => {
    const response = await callApi<{ size: number }>("/api/asset/statAsset", { path }, 10_000);
    if (!Number.isFinite(response?.size) || response.size < 0) throw new Error("附件大小信息不可用");
    assetSizeCache.delete(path);
    assetSizeCache.set(path, { size: response.size, version });
    if (assetSizeCache.size > ASSET_SIZE_CACHE_CAPACITY) {
      assetSizeCache.delete(assetSizeCache.keys().next().value as string);
    }
    return response.size;
  })();
  assetSizePending.set(pendingKey, promise);
  try { return await promise; }
  finally { if (assetSizePending.get(pendingKey) === promise) assetSizePending.delete(pendingKey); }
}

export async function findAssetReferences(relativePath: string): Promise<AssetReferences> {
  return callApi<AssetReferences>("/api/asset/findAssetReferences", {
    path: "assets/" + normalizeFolder(relativePath),
  });
}

const SIYUAN_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/;
const REFERENCE_PATH_TTL_MS = 5 * 60_000;
const REFERENCE_PATH_REQUEST_TIMEOUT_MS = 6_000;
const REFERENCE_PATH_CACHE_LIMIT = 256;
const referencePathCache = new Map<string, { path: string; fetchedAt: number }>();
const referencePathInflight = new Map<string, Promise<string>>();

/** Resolve the document ID from an asset reference, never from its attachment URL. */
export function getReferenceDocumentId(ref: AssetReference): string | null {
  if (ref.rootID && SIYUAN_ID_PATTERN.test(ref.rootID)) return ref.rootID;
  if (ref.path) {
    const candidate = ref.path.match(/(?:^|\/)(\d{14}-[a-z0-9]{7})\.sy(?:$|[?#])/);
    if (candidate) return candidate[1];
  }
  if (ref.blockID && SIYUAN_ID_PATTERN.test(ref.blockID)) return ref.blockID;
  return null;
}

/** The kernel returns "notebook / folder / document", not internal .sy paths. */
export async function getReferenceReadablePath(documentID: string, reference?: AssetReference): Promise<string> {
  if (!SIYUAN_ID_PATTERN.test(documentID)) throw new Error("无效文档 ID");
  const cached = referencePathCache.get(documentID);
  if (cached && Date.now() - cached.fetchedAt < REFERENCE_PATH_TTL_MS) return cached.path;
  const inflight = referencePathInflight.get(documentID);
  if (inflight) return inflight;

  const pending = (async () => {
    let path: string | null = null;
    try {
      path = await callApi<string>(
        "/api/filetree/getFullHPathByID",
        { id: documentID },
        REFERENCE_PATH_REQUEST_TIMEOUT_MS,
      );
    } catch (error) {
      // Some reference types may carry a resolvable notebook + .sy path even
      // when the full-path-by-ID lookup fails. Use SiYuan's documented HPath API.
      if (!reference?.notebook || !SIYUAN_ID_PATTERN.test(reference.notebook) ||
          !reference.path || !reference.path.startsWith("/") || !reference.path.endsWith(".sy")) {
        throw error;
      }
      path = await callApi<string>(
        "/api/filetree/getHPathByPath",
        { notebook: reference.notebook, path: reference.path },
        REFERENCE_PATH_REQUEST_TIMEOUT_MS,
      );
    }
    if (typeof path !== "string" || !path.trim()) throw new Error("文档路径为空");
    referencePathCache.delete(documentID);
    referencePathCache.set(documentID, { path, fetchedAt: Date.now() });
    if (referencePathCache.size > REFERENCE_PATH_CACHE_LIMIT) {
      referencePathCache.delete(referencePathCache.keys().next().value as string);
    }
    return path;
  })();
  referencePathInflight.set(documentID, pending);
  try { return await pending; }
  finally {
    if (referencePathInflight.get(documentID) === pending) referencePathInflight.delete(documentID);
  }
}

export interface ReadableReferencePath {
  id: string;
  path: string | null;
}

/** Resolve paths incrementally, with duplicate IDs collapsed and at most four concurrent requests. */
export async function getReadableReferencePaths(
  references: AssetReference[],
  onResolved?: (result: ReadableReferencePath) => void,
): Promise<ReadableReferencePath[]> {
  const ids = [...new Set(references.map(getReferenceDocumentId).filter((id): id is string => Boolean(id)))];
  const referencesById = new Map<string, AssetReference>();
  for (const ref of references) {
    const id = getReferenceDocumentId(ref);
    if (id && (!referencesById.has(id) || (ref.notebook && ref.path))) referencesById.set(id, ref);
  }
  const result = new Array<ReadableReferencePath>(ids.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (cursor < ids.length) {
      const index = cursor++;
      const id = ids[index];
      let item: ReadableReferencePath;
      try {
        item = { id, path: await getReferenceReadablePath(id, referencesById.get(id)) };
      } catch {
        item = { id, path: null };
      }
      result[index] = item;
      // Publish each completed document independently; a slow request must not
      // hide successful titles for the rest of the batch.
      try { onResolved?.(item); }
      catch (error) { console.warn("[Dodo 文件管理] 引用路径回调失败", error); }
    }
  });
  await Promise.all(workers);
  return result;
}

export interface AssetRelinkPreview extends AssetReferences {
  dryRun: boolean;
  historyPath?: string;
  unavailableAttributeViews?: Array<{ reason?: string; hPath?: string }>;
}

/** Use the kernel's transactional asset relinker; never edit .sy or AV files ourselves. */
export async function relinkAssetReferences(
  oldRelativePath: string,
  newRelativePath: string,
  dryRun: boolean,
): Promise<AssetRelinkPreview> {
  return callApi<AssetRelinkPreview>("/api/asset/relinkAsset", {
    oldPath: "assets/" + normalizeFolder(oldRelativePath),
    newPath: "assets/" + normalizeFolder(newRelativePath),
    dryRun,
  }, 120_000);
}

/** Kernel validates the source is unused and backs it up to SiYuan history. */
export async function removeUnusedAssetSafely(relativePath: string): Promise<void> {
  await callApi("/api/asset/removeUnusedAsset", {
    path: "assets/" + normalizeFolder(relativePath),
  }, 120_000);
  noteAssetChange(relativePath, "remove");
}

export async function renameAsset(relativePath: string, newName: string): Promise<string> {
  const oldPath = "assets/" + normalizeFolder(relativePath);
  const result = await callApi<{ newPath: string }>("/api/asset/renameAsset", {
    oldPath,
    newName: cleanName(newName.trim()),
  });
  if (result.newPath) {
    noteAssetChange(normalizeFolder(relativePath), "remove");
    const moved = result.newPath.replace(/^\/?assets\//, "").split(/[?#]/, 1)[0];
    noteAssetChange(moved, "upsert");
  }
  return result.newPath;
}

export async function saveAssetFile(folder: string, file: File, targetName = file.name): Promise<void> {
  const relativePath = assetRelativePath(folder, targetName);
  const form = new FormData();
  form.append("path", "/data/assets/" + relativePath);
  form.append("isDir", "false");
  form.append("modTime", String(Date.now()));
  form.append("file", file, targetName);
  const response = await fetch("/api/file/putFile", { method: "POST", body: form });
  if (!response.ok) throw new Error("上传失败：HTTP " + response.status);
  const result = await response.json() as ApiReply<unknown>;
  if (result.code !== 0) throw new Error(result.msg || "文件写入失败。");
  noteAssetChange(relativePath, "upsert");
}

export async function createAssetFolder(parent: string, name: string): Promise<void> {
  const path = "/data/assets/" + assetRelativePath(parent, name);
  const form = new FormData();
  form.append("path", path);
  form.append("isDir", "true");
  form.append("modTime", String(Date.now()));
  const response = await fetch("/api/file/putFile", { method: "POST", body: form });
  if (!response.ok) throw new Error("新建文件夹失败：HTTP " + response.status);
  const result = await response.json() as ApiReply<unknown>;
  if (result.code !== 0) throw new Error(result.msg || "无法新建文件夹。");
  noteAssetChange(assetRelativePath(parent, name), "folder");
}
