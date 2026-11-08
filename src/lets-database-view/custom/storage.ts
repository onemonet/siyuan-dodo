import { DEFAULT_CUSTOM_HTML } from "./default-html";

/** User-authored apps must outlive plugin installation/builds. */
export const CUSTOM_VIEW_ROOT = "/data/storage/petal/siyuan-dodo/custom-views";
export const CUSTOM_VIEW_TRASH_ROOT = "/data/storage/petal/siyuan-dodo/custom-view-trash";
const PREFERENCES_PATH = CUSTOM_VIEW_ROOT + "/preferences.json";
const APP = /^app-[0-9a-f]{8}-[0-9a-f-]{27}$/;
const VERSION = /^v\d+-\d+-[0-9a-f]+\.html$/;
const MAX_HTML = 512 * 1024;
/** Number of *unpinned* historical snapshots (the current HTML is separate). */
export const DEFAULT_HISTORY_LIMIT = 10;
/** A free-form positive integer, bounded to prevent unreasonable retention. */
export const MIN_HISTORY_LIMIT = 1;
export const MAX_HISTORY_LIMIT = 10000;
export function validCustomHistoryLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= MIN_HISTORY_LIMIT && value <= MAX_HISTORY_LIMIT;
}

export interface CustomAppManifest {
  id: string;
  version: number;
  updatedAt: string;
  /** Explicitly retained snapshots are never removed by automatic pruning. */
  pinnedVersions?: string[];
}

interface DirectoryEntry {
  name: string;
  isDir?: boolean;
  isSymlink?: boolean;
  size?: number;
}

async function readDirectory(path: string, missingOk = false): Promise<DirectoryEntry[]> {
  const response = await fetch("/api/file/readDir", {
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({path}),
  });
  if (missingOk && response.status === 404) return [];
  if (!response.ok) throw new Error(`读取自定义视图目录失败：HTTP ${response.status}`);
  const data = await response.json();
  if (missingOk && (data.code === 404 ||
      /not found|does not exist|no such file|不存在|找不到/i.test(data.msg || ""))) return [];
  if (data.code !== 0 || !Array.isArray(data.data))
    throw new Error(data.msg || "思源未返回有效的文件目录");
  return data.data as DirectoryEntry[];
}

async function removeFile(path: string): Promise<void> {
  const response = await fetch("/api/file/removeFile", {
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({path}),
  });
  if (!response.ok) throw new Error(`清理自定义视图文件失败：HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 0) throw new Error(result.msg || "清理自定义视图文件失败");
}

async function renameFile(path: string, newPath: string): Promise<void> {
  const response = await fetch("/api/file/renameFile", {
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({path,newPath}),
  });
  if (!response.ok) throw new Error(`移动自定义视图应用失败：HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 0) throw new Error(result.msg || "移动自定义视图应用失败");
}

export async function getCustomHistoryLimit(): Promise<number> {
  // SiYuan /api/file/getFile may return HTTP 200 with a kernel error JSON
  // when a file is missing. Check the parent directory first instead of
  // mistaking that error envelope for a broken preferences.json.
  const entries = await readDirectory(CUSTOM_VIEW_ROOT, true);
  const entry = entries.find(item => item.name === "preferences.json");
  if (!entry) return DEFAULT_HISTORY_LIMIT;
  if (entry.isDir) throw new Error("版本保留设置路径不是文件，请检查 preferences.json");
  const response = await fetch("/api/file/getFile", {
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({path:PREFERENCES_PATH}),
  });
  if (response.status === 404) return DEFAULT_HISTORY_LIMIT;
  if (!response.ok) throw new Error("无法读取版本保留设置");
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {}
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const json = parsed as {historyLimit?:unknown;code?:unknown;msg?:unknown};
    if (validCustomHistoryLimit(json.historyLimit))
      return json.historyLimit as number;
    if (json.code === 404) return DEFAULT_HISTORY_LIMIT;
    if (typeof json.code === "number")
      throw new Error("无法读取版本保留设置：" +
        (typeof json.msg === "string" ? json.msg : "思源文件接口返回错误 " + json.code));
  }
  throw new Error("版本保留设置损坏，请检查 preferences.json");
}

export async function setCustomHistoryLimit(value: number): Promise<void> {
  if (!validCustomHistoryLimit(value))
    throw new Error("历史版本保留数量必须为 1～10000 的整数");
  await putFile("/data/storage/petal/siyuan-dodo");
  await putFile(CUSTOM_VIEW_ROOT);
  await putFile(PREFERENCES_PATH, JSON.stringify({historyLimit:value},null,2));
}

export function assertAppId(appId: string): string {
  if (!APP.test(appId)) throw new Error("非法的自定义视图 appId。");
  return appId;
}

export function appPath(appId: string, name: string): string {
  assertAppId(appId);
  if (name !== "index.html" && name !== "manifest.json" &&
      !(name.startsWith("versions/") && VERSION.test(name.slice(9)))) {
    throw new Error("不允许访问自定义视图目录外的文件。");
  }
  return `${CUSTOM_VIEW_ROOT}/${appId}/${name}`;
}

async function kernelFile(path: string): Promise<string> {
  const response = await fetch("/api/file/getFile", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
  if (!response.ok) throw new Error(`自定义视图文件不存在或无法读取：${response.status}`);
  return await response.text();
}

async function putFile(path: string, textValue?: string): Promise<void> {
  const form = new FormData();
  form.append("path", path);
  form.append("isDir", textValue === undefined ? "true" : "false");
  if (textValue !== undefined) form.append("file",
    new File([textValue], path.split("/").pop()!, {
      type: path.endsWith(".html") ? "text/html" : "application/json",
    }));
  const response = await fetch("/api/file/putFile", { method: "POST", body: form });
  if (!response.ok) throw new Error(`文件写入失败：HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 0) throw new Error(result.msg || "思源未确认自定义视图文件保存成功");
}

async function ensureAppDirs(id: string): Promise<void> {
  // putFile(isDir=true) creates directories through SiYuan's official file API.
  for (const part of [
    "/data/storage/petal/siyuan-dodo",
    CUSTOM_VIEW_ROOT, `${CUSTOM_VIEW_ROOT}/${id}`, `${CUSTOM_VIEW_ROOT}/${id}/versions`,
  ]) await putFile(part);
}

export async function getCustomApp(appId: string): Promise<{html: string; manifest: CustomAppManifest}> {
  const [html, raw] = await Promise.all([
    kernelFile(appPath(appId, "index.html")), kernelFile(appPath(appId, "manifest.json")),
  ]);
  const manifest = JSON.parse(raw) as CustomAppManifest;
  if (manifest.id !== appId || !Number.isInteger(manifest.version) || manifest.version < 1)
    throw new Error("自定义视图清单损坏或 appId 不匹配。");
  return { html, manifest };
}

export async function createCustomApp(): Promise<{html: string; manifest: CustomAppManifest}> {
  const id = "app-" + crypto.randomUUID();
  const manifest: CustomAppManifest = { id, version: 1, updatedAt: new Date().toISOString() };
  await ensureAppDirs(id);
  await putFile(appPath(id, "index.html"), DEFAULT_CUSTOM_HTML);
  await putFile(appPath(id, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { html: DEFAULT_CUSTOM_HTML, manifest };
}

const pending = new Map<string, Promise<unknown>>();
function queueApp<T>(appId: string, work: () => Promise<T>): Promise<T> {
  assertAppId(appId);
  const previous = pending.get(appId);
  const task = (async () => {
    if (previous) await previous.catch(() => {});
    return work();
  })();
  pending.set(appId,task);
  void task.finally(() => {
    if (pending.get(appId) === task) pending.delete(appId);
  }).catch(() => {});
  return task;
}

function snapshotNumber(name: string): number {
  const match = /^v(\d+)-\d+-[0-9a-f]+\.html$/.exec(name);
  return match ? Number(match[1]) : -1;
}

export async function listCustomVersions(appId: string): Promise<string[]> {
  const entries = await readDirectory(`${CUSTOM_VIEW_ROOT}/${assertAppId(appId)}/versions`);
  if (entries.some(item => item.isSymlink && VERSION.test(item.name)))
    throw new Error("历史版本目录包含符号链接，已停止自动清理");
  return entries.filter(item => item.isDir !== true && VERSION.test(item.name))
    .map(item => item.name)
    .sort((a,b) => snapshotNumber(b)-snapshotNumber(a) || b.localeCompare(a));
}

async function pruneSnapshots(appId: string, limit: number): Promise<number> {
  const manifest = (await getCustomApp(appId)).manifest;
  const pinned = new Set((manifest.pinnedVersions || []).filter(name => VERSION.test(name)));
  const snapshots = await listCustomVersions(appId);
  let kept = 0, removed = 0;
  for (const filename of snapshots) {
    if (pinned.has(filename)) continue;
    if (kept++ < limit) continue;
    await removeFile(appPath(appId,"versions/"+filename));
    removed++;
  }
  return removed;
}

/** Explicit cleanup, serialized with source saves and pin changes. */
export async function pruneCustomAppVersions(appId: string): Promise<number> {
  return queueApp(appId,async () => pruneSnapshots(appId,await getCustomHistoryLimit()));
}

export async function pinCustomVersion(appId: string, filename: string, pinned: boolean): Promise<void> {
  appPath(appId,"versions/"+filename); // strictly validate untrusted filename
  await queueApp(appId,async () => {
    const current = await getCustomApp(appId);
    if (!(await listCustomVersions(appId)).includes(filename))
      throw new Error("该历史版本已被清理，请刷新版本列表");
    const keep = new Set(current.manifest.pinnedVersions || []);
    if (pinned) keep.add(filename); else keep.delete(filename);
    await putFile(appPath(appId,"manifest.json"),
      JSON.stringify({...current.manifest,pinnedVersions:[...keep].sort()},null,2));
  });
}

export async function saveCustomApp(appId: string, html: string, expectedVersion?: number):
    Promise<CustomAppManifest> {
  assertAppId(appId);
  if (!html.trim() || new TextEncoder().encode(html).length > MAX_HTML)
    throw new Error("HTML 必须非空，且不能超过 512 KiB。");
  return queueApp(appId,async () => {
    const current = await getCustomApp(appId);
    if (expectedVersion !== undefined && current.manifest.version !== expectedVersion)
      throw new Error("HTML 已由其他编辑器修改，请先读取最新版本，避免覆盖。");
    if (current.html === html) return current.manifest;
    const filename = `v${current.manifest.version}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.html`;
    await putFile(appPath(appId, "versions/" + filename), current.html);
    await putFile(appPath(appId, "index.html"), html);
    const manifest = { ...current.manifest, version: current.manifest.version + 1,
      updatedAt: new Date().toISOString() };
    await putFile(appPath(appId, "manifest.json"), JSON.stringify(manifest, null, 2));
    // Never report a committed HTML save as failed merely because filesystem
    // cleanup is temporarily unavailable. The next save or manager scan can retry.
    try { await pruneSnapshots(appId,await getCustomHistoryLimit()); }
    catch (error) { console.warn("[Dodo 自定义视图] 已保存页面，但历史自动清理失败",error); }
    return manifest;
  });
}

export async function restoreCustomVersion(appId: string, filename: string, expectedVersion?: number):
    Promise<CustomAppManifest> {
  const html = await kernelFile(appPath(appId, "versions/" + filename));
  return saveCustomApp(appId, html, expectedVersion);
}

export interface CustomAppSummary {
  appId: string;
  status: "active" | "trash";
  version: number;
  updatedAt: string;
  versions: number;
  pinned: number;
  /** Size from SiYuan directory metadata when available; otherwise lower bound. */
  bytes: number;
  sizeComplete: boolean;
  error?: string;
}

async function appSummary(appId: string, status: "active" | "trash"): Promise<CustomAppSummary> {
  const dir = status === "active" ? CUSTOM_VIEW_ROOT : CUSTOM_VIEW_TRASH_ROOT;
  try {
    const root = `${dir}/${assertAppId(appId)}`;
    const [html, raw, entries, rootEntries] = await Promise.all([
      kernelFile(root + "/index.html"),
      kernelFile(root + "/manifest.json"),
      readDirectory(root + "/versions",true),
      readDirectory(root),
    ]);
    if ([...rootEntries,...entries].some(item=>item.isSymlink))
      throw new Error("应用目录包含符号链接，拒绝管理此应用");
    const manifest = JSON.parse(raw) as CustomAppManifest;
    if (manifest.id !== appId || !Number.isInteger(manifest.version))
      throw new Error("应用清单与目录不匹配");
    const snapshots = entries.filter(entry => VERSION.test(entry.name) && entry.isDir !== true);
    const files = [...entries.filter(entry => VERSION.test(entry.name) && entry.isDir !== true)];
    const sizeKnown = files.every(entry => Number.isFinite(entry.size) && entry.size! >= 0);
    const bytes = new TextEncoder().encode(html).length +
      new TextEncoder().encode(raw).length +
      files.reduce((sum,entry) => sum + (entry.size || 0),0);
    const names = new Set(snapshots.map(entry=>entry.name));
    return {appId,status,version:manifest.version,
      updatedAt:typeof manifest.updatedAt === "string" ? manifest.updatedAt : "",
      versions:snapshots.length,
      pinned:(manifest.pinnedVersions || []).filter(name => names.has(name)).length,
      bytes,sizeComplete:sizeKnown};
  } catch(error) {
    return {appId,status,version:0,updatedAt:"",versions:0,pinned:0,
      bytes:0,sizeComplete:false,error:error instanceof Error ? error.message : String(error)};
  }
}

/** Both normal apps and the recycle bin are stored outside plugin installation. */
export async function listCustomApps(status: "active" | "trash" = "active"): Promise<CustomAppSummary[]> {
  const root = status === "active" ? CUSTOM_VIEW_ROOT : CUSTOM_VIEW_TRASH_ROOT;
  const entries = await readDirectory(root,true);
  if (entries.some(item => item.isSymlink && APP.test(item.name)))
    throw new Error("App 目录包含符号链接，已停止应用管理");
  const apps = entries.filter(item => APP.test(item.name) && item.isDir !== false);
  const result: CustomAppSummary[] = [];
  // Bound concurrency to avoid overwhelming the SiYuan file API with many apps.
  for (let index = 0; index < apps.length; index += 4) {
    result.push(...await Promise.all(apps.slice(index,index+4)
      .map(item=>appSummary(item.name,status))));
  }
  return result.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Permanently delete an active, validated App directory and its history.
 * Caller MUST re-scan every known SiYuan database reference immediately first.
 * Storage also rejects symlinks, damaged manifests and unexpected directories. */
export async function permanentlyRemoveCustomApp(appId: string): Promise<void> {
  await queueApp(appId, async () => {
    const active = await readDirectory(CUSTOM_VIEW_ROOT, true);
    const entry = active.find(item => item.name === appId);
    if (!entry || entry.isDir !== true || entry.isSymlink)
      throw new Error("自定义应用目录不存在或不是安全的普通目录");
    const summary = await appSummary(appId, "active");
    if (summary.error) throw new Error("应用数据异常，拒绝直接删除：" + summary.error);
    const parts = await readDirectory(CUSTOM_VIEW_ROOT + "/" + appId);
    const versions = await readDirectory(CUSTOM_VIEW_ROOT + "/" + appId + "/versions", true);
    if ([...parts,...versions].some(item => item.isSymlink))
      throw new Error("应用内包含符号链接，拒绝删除");
    // Never delete the app collection root, or follow an arbitrary user path.
    await removeFile(CUSTOM_VIEW_ROOT + "/" + assertAppId(appId));
  });
}
/** Physical removal is deliberately restricted to the recycle bin. */
export async function moveCustomAppToTrash(appId: string): Promise<void> {
  await queueApp(appId,async()=> {
    const active = await readDirectory(CUSTOM_VIEW_ROOT,true);
    if (!active.some(item=>item.name===appId && item.isDir===true && !item.isSymlink))
      throw new Error("应用目录不存在或不是受支持的普通目录");
    if ((await readDirectory(CUSTOM_VIEW_TRASH_ROOT,true)).some(e => e.name === appId))
      throw new Error("回收站已有同名应用，请先恢复或处理冲突");
    await putFile(CUSTOM_VIEW_TRASH_ROOT);
    await renameFile(`${CUSTOM_VIEW_ROOT}/${appId}`,`${CUSTOM_VIEW_TRASH_ROOT}/${appId}`);
  });
}

export async function restoreTrashedCustomApp(appId: string): Promise<void> {
  await queueApp(appId,async()=> {
    if ((await readDirectory(CUSTOM_VIEW_ROOT,true)).some(e => e.name === appId))
      throw new Error("应用目录已存在，无法覆盖现有数据");
    const trash = await readDirectory(CUSTOM_VIEW_TRASH_ROOT,true);
    if (!trash.some(item=>item.name===appId && item.isDir===true && !item.isSymlink))
      throw new Error("回收站应用目录不存在或不安全");
    await renameFile(`${CUSTOM_VIEW_TRASH_ROOT}/${appId}`,`${CUSTOM_VIEW_ROOT}/${appId}`);
  });
}

export async function permanentlyRemoveTrashedCustomApp(appId: string): Promise<void> {
  await queueApp(appId,async()=> {
    // Never accept arbitrary path segments or remove active app directories.
    if (!(await readDirectory(CUSTOM_VIEW_TRASH_ROOT,true))
      .some(e=>e.name === appId && e.isDir===true && !e.isSymlink && APP.test(e.name)))
      throw new Error("回收站中找不到有效的应用目录");
    await removeFile(`${CUSTOM_VIEW_TRASH_ROOT}/${appId}`);
  });
}
