import {
  assetKind,
  assetRelativePath,
  assetUrl,
  findAssetReferences,
  formatSize,
  getAssetSize,
  relinkAssetReferences,
  removeUnusedAssetSafely,
  saveAssetFile,
  type AssetRelinkPreview,
} from "./file-service";

export type CompressionFormat = "webp" | "jpeg" | "png";
export type CompressionSaveMode = "copy" | "relink-keep" | "relink-delete";
export interface CompressionOptions {
  format: CompressionFormat;
  quality: number;
  maxEdge: number;
}
export interface CompressionPreview {
  blob: Blob;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  mime: string;
}
export const compressionFormatOptions: Array<{ value: CompressionFormat; label: string }> = [
  { value: "webp", label: "WebP（推荐）" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG（无损）" },
];
export const MAX_COMPRESSION_INPUT = 45 * 1024 * 1024;
const MAX_PIXELS = 36_000_000;
const MIME_TYPES: Record<CompressionFormat, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Animated GIF/APNG/WebP/AVIF and vector SVG are intentionally unsupported. */
export function supportsImageCompression(name: string): boolean {
  return /\.(jpe?g|png|webp|avif)$/i.test(name);
}

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

export function assertStaticImage(name: string, bytes: Uint8Array): void {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") {
    if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 ||
        bytes[2] !== 78 || bytes[3] !== 71 || fourcc(bytes, 12) !== "IHDR") {
      throw new Error("不是有效的 PNG 图片。");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let at = 8; at + 12 <= bytes.length;) {
      const len = view.getUint32(at);
      const chunk = fourcc(bytes, at + 4);
      if (chunk === "acTL") throw new Error("暂不支持压缩 APNG 动图，避免丢失动画帧。");
      if (chunk === "IDAT" || chunk === "IEND") return;
      if (len > bytes.length || at + 12 + len > bytes.length) break;
      at += 12 + len;
    }
    throw new Error("无法确认 PNG 是否为动图，请保留原件。");
  }
  if (ext === "avif") {
    if (bytes.length < 20 || fourcc(bytes, 4) !== "ftyp") {
      throw new Error("不是有效的 AVIF 图片。");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const boxSize = view.getUint32(0);
    if (boxSize < 20 || boxSize > bytes.length) {
      throw new Error("无法确认 AVIF 文件结构，已拒绝转换以保护原件。");
    }
    const brands = [fourcc(bytes, 8)];
    for (let at = 16; at + 4 <= boxSize; at += 4) brands.push(fourcc(bytes, at));
    if (brands.includes("avis") || brands.includes("msf1")) {
      throw new Error("暂不支持压缩 AVIF 动图，避免丢失动画帧。");
    }
    if (!brands.includes("avif")) {
      throw new Error("不是兼容的静态 AVIF 格式。");
    }
  }
  if (ext === "webp") {
    if (bytes.length < 24 || fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WEBP") {
      throw new Error("不是有效的 WebP 图片。");
    }
    if (fourcc(bytes, 12) === "VP8X" && (bytes[20] & 2) !== 0) {
      throw new Error("暂不支持压缩动态 WebP，避免丢失动画帧。");
    }
    if (fourcc(bytes, 12) === "ANIM") {
      throw new Error("暂不支持压缩动态 WebP。");
    }
  }
}

/** Preview only. No attachment file is changed by this function. */
export async function createCompressionPreview(
  relativePath: string,
  name: string,
  options: CompressionOptions,
): Promise<CompressionPreview> {
  if (!supportsImageCompression(name)) {
    throw new Error("目前仅支持静态 JPG、JPEG、PNG、WebP、AVIF 图片。");
  }
  if (!Number.isFinite(options.quality) || options.quality < 0.1 || options.quality > 1) {
    throw new Error("压缩质量必须在 10% 到 100% 之间。");
  }
  const response = await fetch(assetUrl(relativePath), { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取原始附件（HTTP " + response.status + "）。");
  const input = await response.blob();
  if (input.size > MAX_COMPRESSION_INPUT) throw new Error("原图大于 45 MB，请使用专业图片处理工具压缩。");
  if (input.size < 20) throw new Error("源图片内容不完整。");
  if (/\.(png|webp|avif)$/i.test(name)) {
    const header = new Uint8Array(await input.slice(0, Math.min(input.size, 1024 * 1024)).arrayBuffer());
    assertStaticImage(name, header);
  }
  let bitmap: ImageBitmap | null = null;
  let outputCanvas: HTMLCanvasElement | null = null;
  try {
    bitmap = await createImageBitmap(input);
    const width = bitmap.width;
    const height = bitmap.height;
    if (!width || !height || width * height > MAX_PIXELS || width > 12000 || height > 12000) {
      throw new Error("图片分辨率超出浏览器安全处理上限（3600 万像素）。");
    }
    const ratio = options.maxEdge > 0
      ? Math.min(1, options.maxEdge / Math.max(width, height))
      : 1;
    const targetWidth = Math.max(1, Math.round(width * ratio));
    const targetHeight = Math.max(1, Math.round(height * ratio));
    outputCanvas = document.createElement("canvas");
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
    const ctx = outputCanvas.getContext("2d");
    if (!ctx) throw new Error("浏览器无法创建图片编码画布。");
    if (options.format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const mime = MIME_TYPES[options.format];
    const blob = await new Promise<Blob>((resolve, reject) => {
      outputCanvas!.toBlob((data) => {
        if (data) resolve(data);
        else reject(new Error("浏览器图片编码失败。"));
      }, mime, options.quality);
    });
    if (blob.type !== mime) throw new Error("当前浏览器不支持编码 " + mime + "。");
    return { blob, originalSize: input.size, originalWidth: width, originalHeight: height,
      width: targetWidth, height: targetHeight, mime };
  } finally {
    bitmap?.close();
    if (outputCanvas) { outputCanvas.width = 0; outputCanvas.height = 0; }
  }
}

export function compressionSavings(preview: CompressionPreview): number {
  return Math.round((1 - preview.blob.size / preview.originalSize) * 100);
}

/** Random output basename ensures source and other existing assets are never overwritten. */
export function compressedFileName(originalName: string, format: CompressionFormat, id: string): string {
  const root = originalName.replace(/\.[^.]+$/, "");
  if (!/^[a-z0-9-]{8,60}$/i.test(id)) throw new Error("压缩文件标识无效");
  return root + "-optimized-" + id + "." + (format === "jpeg" ? "jpg" : format);
}

export interface CompressionMigrationDeps {
  save: typeof saveAssetFile;
  stat: typeof getAssetSize;
  dryRun: typeof relinkAssetReferences;
  check: typeof findAssetReferences;
  remove: typeof removeUnusedAssetSafely;
}

const DEFAULT_DEPS: CompressionMigrationDeps = {
  save: saveAssetFile,
  stat: getAssetSize,
  dryRun: relinkAssetReferences,
  check: findAssetReferences,
  remove: removeUnusedAssetSafely,
};

function assertCompleteScan(report: AssetRelinkPreview): void {
  if (report.skippedNotebooks?.length) throw new Error("有笔记本未参与引用扫描，已阻止迁移以免断链。");
  if (report.unavailableAttributeViews?.length) throw new Error("部分数据库无法更新引用，已阻止迁移。");
  if ((report.references ?? []).some((ref) => !ref.relinkable)) {
    throw new Error("存在不可迁移的文档或数据库引用，已阻止迁移。");
  }
}

export interface CompressionCommitResult {
  savedPath: string;
  oldRemoved: boolean;
  migratedReferences: number;
  /** Core document/database references verified independently of OCR text indexes. */
  verificationCompleted: boolean;
  verificationWarning?: string;
  ocrMetadataCount: number;
}

export interface CompressionVerification {
  documentReferences: number;
  ocrMetadataCount: number;
  skippedNotebooks: number;
  unavailableDatabases: number;
  error?: string;
  attempts: number;
  complete: boolean;
}

export function classifyCompressionReferences(report: {
  references?: Array<{ type?: string }>;
  skippedNotebooks?: string[];
  unavailableAttributeViews?: Array<{ reason?: string }>;
}): Omit<CompressionVerification, "error" | "attempts"> {
  const refs = report.references ?? [];
  const documentReferences = refs.filter((ref) => ref.type?.toLowerCase() !== "ocr").length;
  const ocrMetadataCount = refs.length - documentReferences;
  const skippedNotebooks = report.skippedNotebooks?.length ?? 0;
  const unavailableDatabases = report.unavailableAttributeViews?.length ?? 0;
  return {
    documentReferences,
    ocrMetadataCount,
    skippedNotebooks,
    unavailableDatabases,
    complete: documentReferences === 0 && skippedNotebooks === 0 && unavailableDatabases === 0,
  };
}

export function describeCompressionVerification(result: CompressionVerification): string {
  const issues: string[] = [];
  if (result.documentReferences > 0) issues.push("旧图仍有 " + result.documentReferences + " 处文档或数据库引用");
  if (result.skippedNotebooks > 0) issues.push(result.skippedNotebooks + " 个笔记本未参与扫描");
  if (result.unavailableDatabases > 0) issues.push(result.unavailableDatabases + " 个数据库未能检查");
  if (result.error) issues.push("引用验证请求失败：" + result.error);
  return issues.join("；");
}

/** Bounded verification retries only. No rescans modify user documents or files. */
export async function verifyCompressionRelink(
  oldPath: string,
  check: CompressionMigrationDeps["check"],
  onStep: (message: string) => void = () => {},
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<CompressionVerification> {
  const RETRY_DELAY_MS = [350, 900];
  let latest: CompressionVerification = {
    documentReferences: 0,
    ocrMetadataCount: 0,
    skippedNotebooks: 0,
    unavailableDatabases: 0,
    attempts: 0,
    complete: false,
  };
  for (let attempt = 1; attempt <= RETRY_DELAY_MS.length + 1; attempt++) {
    onStep("正在核验原图的文档引用（" + attempt + "/3）…");
    try {
      const data = await check(oldPath);
      latest = { ...classifyCompressionReferences(data), attempts: attempt };
    } catch (error) {
      latest = {
        ...latest,
        error: error instanceof Error ? error.message : String(error),
        attempts: attempt,
        complete: false,
      };
    }
    // OCR text indexes are not document links. They may remain after a
    // successful relink and are not treated as an incomplete document migration.
    if (latest.complete) return latest;
    if (attempt <= RETRY_DELAY_MS.length) await pause(RETRY_DELAY_MS[attempt - 1]);
  }
  return latest;
}

/** Safe order: stage new file -> verify -> dry-run -> relink -> verify -> optional history-safe removal.
 * On every failure old bytes are retained; any newly written copy remains available.
 */
export async function commitCompression(
  sourceRelativePath: string,
  preview: CompressionPreview,
  format: CompressionFormat,
  mode: CompressionSaveMode,
  onStep: (message: string) => void = () => {},
  deps: CompressionMigrationDeps = DEFAULT_DEPS,
): Promise<CompressionCommitResult> {
  if (preview.blob.size >= preview.originalSize) {
    throw new Error("压缩结果没有变小，请调整质量或尺寸后重新生成预览。");
  }
  const parts = sourceRelativePath.split(String.fromCharCode(92)).join("/").split("/");
  const sourceName = parts.pop() ?? "";
  if (!supportsImageCompression(sourceName)) throw new Error("不支持该源图片类型。");
  const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  const targetName = compressedFileName(sourceName, format, suffix);
  const file = new File([preview.blob], targetName, { type: preview.mime });
  return commitStagedImage(sourceRelativePath, file, targetName, mode, onStep, deps);
}

/** New-name writes are staged and verified before the native relinker is invoked.
 * Used by both compression and user-supplied replacement, with identical
 * OCR migration and original history-safe cleanup.
 */
async function commitStagedImage(
  sourceRelativePath: string,
  file: File,
  targetName: string,
  mode: CompressionSaveMode,
  onStep: (message: string) => void,
  deps: CompressionMigrationDeps,
): Promise<CompressionCommitResult> {
  const parts = sourceRelativePath.split(String.fromCharCode(92)).join("/").split("/");
  parts.pop();
  const folder = parts.join("/");
  const targetRelativePath = assetRelativePath(folder, targetName);
  onStep("正在保存新图片…");
  await deps.save(folder, file, targetName);
  onStep("正在确认新图片已写入思源…");
  try {
    const onDiskSize = await deps.stat(targetRelativePath, Date.now());
    if (onDiskSize !== file.size) throw new Error("新图片大小校验不一致。");
  } catch (error) {
    throw new Error("新图片已保存，但无法验证其完整性；原图未修改。目标：" + targetRelativePath
      + "。原因：" + (error instanceof Error ? error.message : String(error)));
  }

  if (mode === "copy") {
    onStep("已保存新图片副本，原图和引用均未修改。");
    return { savedPath: targetRelativePath, oldRemoved: false, migratedReferences: 0,
      verificationCompleted: true, ocrMetadataCount: 0 };
  }

  onStep("正在预检引用迁移（不修改文档）…");
  let report: AssetRelinkPreview;
  try {
    report = await deps.dryRun(sourceRelativePath, targetRelativePath, true);
    assertCompleteScan(report);
  } catch (error) {
    throw new Error("新图片已保存，但引用迁移预检失败，原图和引用未修改。新图：" + targetRelativePath
      + "。原因：" + (error instanceof Error ? error.message : String(error)));
  }

  onStep("正在由思源内核迁移文档和数据库引用…");
  let migrated: AssetRelinkPreview;
  try {
    migrated = await deps.dryRun(sourceRelativePath, targetRelativePath, false);
    assertCompleteScan(migrated);
  } catch (error) {
    throw new Error("新图片已保存，但迁移未能确认成功，原图未删除。请检查引用后再操作。新图："
      + targetRelativePath + "。原因：" + (error instanceof Error ? error.message : String(error)));
  }

  const verification = await verifyCompressionRelink(sourceRelativePath, deps.check, onStep);
  const verified = verification.complete;
  const warning = verified ? undefined : describeCompressionVerification(verification);
  const ocrMetadataCount = verification.ocrMetadataCount;
  const migratedReferences = migrated.updated ?? 0;

  if (mode === "relink-delete" && verified) {
    // Never remove the original based on a plugin-only prediction. The kernel
    // independently recalculates unused assets, writes history and rejects a
    // removal if any live reference or incomplete notebook scan remains.
    onStep("正在由思源内核再次验证未引用状态、备份并清理原图…");
    try {
      await deps.remove(sourceRelativePath);
      return {
        savedPath: targetRelativePath, oldRemoved: true, migratedReferences,
        verificationCompleted: true, ocrMetadataCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        savedPath: targetRelativePath, oldRemoved: false, migratedReferences,
        verificationCompleted: true, ocrMetadataCount,
        verificationWarning: "思源安全清理接口未批准删除，原图已保留（" + message + "）。",
      };
    }
  }

  if (!verified) {
    onStep("引用迁移接口已执行，但验证未完成。新图有效，原图保持不变。");
    return {
      savedPath: targetRelativePath, oldRemoved: false, migratedReferences,
      verificationCompleted: false, ocrMetadataCount,
      verificationWarning: "验证未完全通过，原图已保留：" + (warning || "未知原因")
        + (mode === "relink-delete" ? "。未执行删除操作。" : "。"),
    };
  }

  onStep(ocrMetadataCount
    ? "文档引用核验通过，旧图还有 " + ocrMetadataCount + " 条 OCR 索引记录（非文档引用）。"
    : "图片引用迁移完成，旧图已保留。");
  return {
    savedPath: targetRelativePath, oldRemoved: false, migratedReferences,
    verificationCompleted: true, ocrMetadataCount,
  };
}

/** A replacement may differ in pixels, dimensions, size and format.
 * All old references and OCR associations are migrated; cleanup is delegated
 * to SiYuan's history-backed unused asset API.
 */
export async function replaceImageAsset(
  sourceRelativePath: string,
  newFile: File,
  onStep: (message: string) => void = () => {},
  deps: CompressionMigrationDeps = DEFAULT_DEPS,
): Promise<CompressionCommitResult> {
  if (!newFile.size) throw new Error("替换图片不能为空。");
  if (assetKind(newFile.name) !== "image") {
    throw new Error("替换图片必须是受支持的图片格式。");
  }
  const parts = sourceRelativePath.split(String.fromCharCode(92)).join("/").split("/");
  const sourceName = parts.pop() || "";
  if (assetKind(sourceName) !== "image") throw new Error("原附件不是图片。");
  const extension = newFile.name.split(".").pop()?.toLowerCase() || "";
  const root = sourceName.replace(/\.[^.]+$/, "");
  const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  const targetName = root + "-replaced-" + suffix + "." + extension;
  const stagedFile = new File([newFile], targetName, { type: newFile.type });
  return commitStagedImage(sourceRelativePath, stagedFile, targetName, "relink-delete", onStep, deps);
}

export function formatCompressionSummary(preview: CompressionPreview): string {
  return formatSize(preview.originalSize) + " → " + formatSize(preview.blob.size)
    + "（节省 " + compressionSavings(preview) + "%）";
}
