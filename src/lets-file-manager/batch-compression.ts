import {
  createCompressionPreview,
  supportsImageCompression,
  type CompressionOptions,
  type CompressionPreview,
} from "./image-compression";

export const MAX_COMPRESSION_BATCH = 40;
export const MAX_COMPRESSION_RESULT_BYTES = 160 * 1024 * 1024;
export const DEFAULT_COMPRESSION_WORKERS = 2;

export interface BatchCompressionSource {
  path: string;
  name: string;
}
export interface BatchCompressionRecord extends BatchCompressionSource {
  status: "pending" | "processing" | "ready" | "larger" | "error" |
    "discarded" | "replacing" | "replaced" | "warning" | "failed";
  checked: boolean;
  preview?: CompressionPreview;
  previewUrl?: string;
  error?: string;
  resultPath?: string;
}
export type BatchCompressionEncoder = typeof createCompressionPreview;

/** Compression is strictly in-memory: no upload or replacement takes place here. */
export async function prepareCompressionBatch(
  sources: readonly BatchCompressionSource[],
  options: CompressionOptions,
  update: (path: string, patch: Partial<BatchCompressionRecord>) => void,
  encoder: BatchCompressionEncoder = createCompressionPreview,
  maxOutputBytes = MAX_COMPRESSION_RESULT_BYTES,
): Promise<void> {
  if (sources.length > MAX_COMPRESSION_BATCH) throw new Error("每批最多压缩 " + MAX_COMPRESSION_BATCH + " 张图片。");
  if (new Set(sources.map((source) => source.path)).size !== sources.length) {
    throw new Error("图片列表中存在重复文件。");
  }
  if (sources.some((source) => !supportsImageCompression(source.name))) {
    throw new Error("所选文件包含不支持压缩的图片格式。");
  }
  let next = 0;
  let retainedBytes = 0;
  const workers = Array.from({ length: Math.min(DEFAULT_COMPRESSION_WORKERS, sources.length) }, async () => {
    while (next < sources.length) {
      const source = sources[next++];
      update(source.path, { status: "processing" });
      try {
        const preview = await encoder(source.path, source.name, options);
        if (preview.blob.size >= preview.originalSize) {
          update(source.path, {
            status: "larger", checked: false, error: "压缩后未变小，已自动取消勾选。",
          });
          continue;
        }
        // A bounded batch prevents keeping hundreds of large Blob objects
        // alive in a long-running SiYuan workbench session.
        if (retainedBytes + preview.blob.size > maxOutputBytes) {
          update(source.path, {
            status: "error", checked: false,
            error: "本批已达到压缩结果内存上限，请分批处理。",
          });
          continue;
        }
        retainedBytes += preview.blob.size;
        update(source.path, { status: "ready", checked: true, preview, error: undefined });
      } catch (error) {
        update(source.path, {
          status: "error", checked: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
  await Promise.all(workers);
}

export function selectedBatchRecords(records: readonly BatchCompressionRecord[]): BatchCompressionRecord[] {
  return records.filter((record) => record.status === "ready" && record.checked
    && record.preview && record.preview.blob.size < record.preview.originalSize);
}

export function batchCompressionSummary(records: readonly BatchCompressionRecord[]) {
  const eligible = records.filter((record) => record.status === "ready");
  const selected = selectedBatchRecords(records);
  return {
    eligible: eligible.length,
    selected: selected.length,
    discarded: eligible.length - selected.length,
    failed: records.filter((record) => record.status === "error" || record.status === "larger").length,
    savedBytes: selected.reduce((total, record) =>
      total + (record.preview!.originalSize - record.preview!.blob.size), 0),
  };
}
