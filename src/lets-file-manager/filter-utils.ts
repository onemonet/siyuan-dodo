import { assetRelativePath, type AssetEntry } from "./file-service";

export const NO_EXTENSION = "__no_extension__";
export type FileSizeFilter = "all" | "under1" | "1to10" | "10to100" | "over100";
export type FileSortMode = "updated" | "name" | "type" | "size";

export interface FileExtensionOption {
  extension: string;
  label: string;
  count: number;
}

/** File suffix is taken from the final dot and normalized case-insensitively. */
export function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot <= 0 || lastDot === name.length - 1
    ? NO_EXTENSION
    : name.slice(lastDot + 1).toLocaleLowerCase();
}

/** Always show live counts for the current folder, including zero-count selections. */
export function collectFileExtensions(
  items: AssetEntry[],
  selected: readonly string[] = [],
): FileExtensionOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.isDir) continue;
    const extension = getFileExtension(item.name);
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }
  for (const extension of selected) {
    if (!counts.has(extension)) counts.set(extension, 0);
  }
  return [...counts].map(([extension, count]) => ({
    extension,
    label: extension === NO_EXTENSION ? "无后缀" : extension,
    count,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"));
}

export const fileSizeOptions: { key: FileSizeFilter; label: string; description: string }[] = [
  { key: "all", label: "全部大小", description: "" },
  { key: "under1", label: "小于 1 MB", description: "适合图标、截图" },
  { key: "1to10", label: "1–10 MB", description: "常见图片与文件" },
  { key: "10to100", label: "10–100 MB", description: "高清素材" },
  { key: "over100", label: "大于 100 MB", description: "视频、大型文件" },
];

const MB = 1024 * 1024;

export function matchesFileSize(size: number | undefined, filter: FileSizeFilter): boolean {
  if (filter === "all") return true;
  if (size === undefined || size === null || !Number.isFinite(size)) return false;
  if (filter === "under1") return size < MB;
  if (filter === "1to10") return size >= MB && size < 10 * MB;
  if (filter === "10to100") return size >= 10 * MB && size < 100 * MB;
  return size >= 100 * MB;
}

export interface FileFilterOptions {
  folder: string;
  keyword: string;
  extensions: readonly string[];
  size: FileSizeFilter;
  sort: FileSortMode;
  sizes: Record<string, number>;
}

export function filterAndSortFiles(items: AssetEntry[], options: FileFilterOptions): AssetEntry[] {
  const keyword = options.keyword.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (keyword && !item.name.toLocaleLowerCase().includes(keyword)) return false;
    // Folders are navigated only from the left sidebar tree.
    if (item.isDir) return false;
    if (options.extensions.length && !options.extensions.includes(getFileExtension(item.name))) return false;
    const size = options.sizes[assetRelativePath(options.folder, item.name)] ?? item.size;
    return matchesFileSize(size, options.size);
  }).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (options.sort === "name") return a.name.localeCompare(b.name, "zh-CN");
    if (options.sort === "type") return getFileExtension(a.name).localeCompare(getFileExtension(b.name), "en") || a.name.localeCompare(b.name, "zh-CN");
    if (options.sort === "size") {
      const aSize = options.sizes[assetRelativePath(options.folder, a.name)] ?? a.size ?? -1;
      const bSize = options.sizes[assetRelativePath(options.folder, b.name)] ?? b.size ?? -1;
      return bSize - aSize || a.name.localeCompare(b.name, "zh-CN");
    }
    return (b.updated || 0) - (a.updated || 0) || a.name.localeCompare(b.name, "zh-CN");
  });
}
