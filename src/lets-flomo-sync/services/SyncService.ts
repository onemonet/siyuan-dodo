/**
 * Flomo 鍚屾鏈嶅姟
 */
import { createLogger } from "../../logger";
import {
  fetchJsonWithTimeout,
  getErrorMessage,
} from "../../request-utils";
import { fetchWithTimeout } from "../../security-utils";
import { FlomoAPI } from './FlomoAPI';
import { SiyuanWriter, type WriteMemosResult } from './SiyuanWriter';
import { resolveAttachmentFileName } from '../utils/fileName';
import { processMarkdown } from '../utils/markdown';
import { fetchPendingMemos } from "../utils/pendingMemos";
import type { FlomoConfig, FlomoFile, FlomoMemo, SyncResult } from '../types';

const logger = createLogger("FlomoSyncService");
const FLOMO_ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 60_000;
const SIYUAN_FILE_REQUEST_TIMEOUT_MS = 60_000;

interface AttachmentDownloadFailure {
  file: FlomoFile;
  reason: string;
}

interface SiyuanPutFileResponse {
  code?: number;
  msg?: string;
}

function getMemoSlug(memo: FlomoMemo | undefined): string {
  return memo?.slug?.trim() || "";
}

function getUnprocessedMemos(
  memos: FlomoMemo[],
  writeResultMemos: ReturnType<typeof processMarkdown>["processedMemos"],
): FlomoMemo[] {
  const processedOriginalMemos = new Set(
    writeResultMemos
      .map((memo) => memo.originalMemo)
      .filter((memo): memo is FlomoMemo => Boolean(memo)),
  );

  return memos.filter((memo) => !processedOriginalMemos.has(memo));
}

function getSuccessfullyWrittenMemos(writeResult: WriteMemosResult): FlomoMemo[] {
  return writeResult.inserted
    .map((result) => result.memo.originalMemo)
    .filter((memo): memo is FlomoMemo => Boolean(memo));
}

function summarizeFailedWrites(writeResult: WriteMemosResult): string {
  return writeResult.failed
    .map((failure) => {
      const slug = getMemoSlug(failure.memo.originalMemo) || "unknown";
      return `${slug}: ${failure.error}`;
    })
    .join("; ");
}

export class SyncService {
  constructor(
    private api: FlomoAPI,
    private writer: SiyuanWriter,
    private config: FlomoConfig
  ) {}

  /**
   * 鎵ц鍚屾
   */
  async sync(silent: boolean = false): Promise<SyncResult> {
    try {
      // 鑾峰彇鏈€鏂扮殑 memos
      const memos = await this.getLatestMemos();
      
      if (memos.length === 0) {
        return { success: true, memoCount: 0 };
      }

      // 澶勭悊 Markdown 鍜屽浘鐗?
      const { processedMemos, imgs } = processMarkdown(
        memos,
        this.config.contentTemplate,
        this.config.timeFormat || 'YYYY-MM-DD HH:mm:ss'
      );
      const unprocessedMemos = getUnprocessedMemos(memos, processedMemos);

      if (processedMemos.length === 0) {
        return {
          success: false,
          memoCount: 0,
          error: `Flomo 鍚屾澶辫触: ${memos.length} 鏉?memo 鏃犳硶瑙ｆ瀽涓哄彲鍐欏叆鍐呭`,
        };
      }

      // 涓嬭浇鍥剧墖
      const imageFailures = await this.downloadImages(imgs);
      if (imageFailures.length > 0) {
        return {
          success: false,
          memoCount: 0,
          error: `Flomo 鍚屾澶辫触: ${imageFailures.length} 涓檮浠朵笅杞芥垨淇濆瓨澶辫触`,
        };
      }

      // 鍐欏叆鎬濇簮
      const writeResult = await this.writer.writeMemos(
        processedMemos,
        this.config,
        silent,
      );
      const successfulMemos = getSuccessfullyWrittenMemos(writeResult);

      // 鍥炲啓鏍囩
      if (this.config.syncSuccessTag && successfulMemos.length > 0) {
        await this.writeBackTags(successfulMemos);
      }

      const errors: string[] = [];
      if (unprocessedMemos.length > 0) {
        errors.push(`${unprocessedMemos.length} 鏉?memo 鏃犳硶瑙ｆ瀽`);
      }
      if (writeResult.failed.length > 0) {
        errors.push(`${writeResult.failed.length} 鏉?memo 鍐欏叆澶辫触: ${summarizeFailedWrites(writeResult)}`);
      }

      if (errors.length > 0) {
        return {
          success: false,
          memoCount: successfulMemos.length,
          error: errors.join("; "),
        };
      }

      // 鏇存柊鍚屾鏃堕棿
      if (!this.config.debugMode) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return { success: true, memoCount: successfulMemos.length };
    } catch (error) {
      return {
        success: false,
        memoCount: 0,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * 鑾峰彇鏈€鏂扮殑 memos
   */
  private async getLatestMemos(): Promise<FlomoMemo[]> {
    return fetchPendingMemos({
      api: this.api,
      config: this.config,
      limit: "200",
    });
  }

  /**
   * 涓嬭浇鍥剧墖鍒版€濇簮
   */
  private async downloadImages(imgs: FlomoFile[]): Promise<AttachmentDownloadFailure[]> {
    const failures: AttachmentDownloadFailure[] = [];

    for (const img of imgs) {
      try {
        const imgName = resolveAttachmentFileName(img);
        const imgPath = "data/assets/flomo/" + img.id + "_" + imgName;
        
        const imgResponse = await fetchWithTimeout(
          img.url,
          {},
          FLOMO_ATTACHMENT_DOWNLOAD_TIMEOUT_MS,
        );
        if (!imgResponse.ok) {
          failures.push({
            file: img,
            reason: `image request failed; status=${imgResponse.status}`,
          });
          continue;
        }
        
        const fileBlob = await imgResponse.blob();
        await this.addFile(imgPath, fileBlob);
      } catch (error) {
        failures.push({
          file: img,
          reason: getErrorMessage(error),
        });
      }
    }

    return failures;
  }

  /**
   * 娣诲姞鏂囦欢鍒版€濇簮
   */
  private async addFile(path: string, file: Blob): Promise<void> {
    const fd = new FormData();
    fd.append('path', path);
    fd.append('isDir', 'false');
    fd.append('file', file);
    
    const result = await fetchJsonWithTimeout<SiyuanPutFileResponse>('/api/file/putFile', {
      method: 'POST',
      body: fd
    }, {
      timeoutMs: SIYUAN_FILE_REQUEST_TIMEOUT_MS,
      errorPrefix: "Siyuan putFile",
    });
    if (!result || result.code !== 0) {
      throw new Error(result?.msg || `putFile code=${result?.code ?? "unknown"}`);
    }
  }

  /**
   * 鍥炲啓鏍囩鍒?Flomo
   */
  private async writeBackTags(memos: FlomoMemo[]): Promise<void> {
    const { syncSuccessTag } = this.config;
    if (!syncSuccessTag) return;

    for (const memo of memos) {
      try {
        await this.api.updateMemo(memo, syncSuccessTag);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 闂撮殧1绉?
      } catch (error) {
        logger.warn("writeBackTags failed to update memo tag", {
          memoSlug: memo.slug,
          syncSuccessTag,
          reason: getErrorMessage(error),
        });
      }
    }
  }
}

