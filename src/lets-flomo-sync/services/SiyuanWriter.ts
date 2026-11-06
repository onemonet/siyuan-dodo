/**
 * 思源笔记写入服务
 */
import { fetchSyncPost, openTab, openMobileFileById, getFrontend } from "siyuan";
import { createLogger } from "../../logger";
import type { FlomoConfig, ProcessedMemo } from "../types";
import {
  getLastMemoUpdatedDate,
  groupMemosByUpdatedDate,
  shouldPrependMemos,
  sortMemosForWriting,
} from "../utils/siyuanWriter";
import { SiyuanMemoBlockWriter } from "./SiyuanMemoBlockWriter";
import type { MemoBlockWriteResult } from "./SiyuanMemoBlockWriter";
import {
  SiyuanDailyNoteResolver,
} from "./SiyuanDailyNoteResolver";
import {
  getUnknownErrorReason,
  type SiyuanPost,
  type SiyuanWarningLogger,
} from "./siyuanApi";

type PageOpenHandler = (pageId: string) => void;
const logger = createLogger("SiyuanWriter");

export interface MemoWriteFailure {
  memo: ProcessedMemo;
  error: string;
}

export interface WriteMemosResult {
  inserted: MemoBlockWriteResult[];
  skipped: MemoBlockWriteResult[];
  failed: MemoWriteFailure[];
}

function createEmptyWriteResult(): WriteMemosResult {
  return {
    inserted: [],
    skipped: [],
    failed: [],
  };
}

function getSuccessfulWriteCount(result: WriteMemosResult): number {
  return result.inserted.length + result.skipped.length;
}

export interface SiyuanWriterDeps {
  post?: SiyuanPost;
  getFrontendName?: () => string;
  openDesktopPage?: PageOpenHandler;
  openMobilePage?: PageOpenHandler;
  dailyNoteResolver?: SiyuanDailyNoteResolver;
  memoBlockWriter?: SiyuanMemoBlockWriter;
  warn?: SiyuanWarningLogger;
}

export class SiyuanWriter {
  private readonly isMobile: boolean;
  private readonly post: SiyuanPost;
  private readonly openDesktopPage: PageOpenHandler;
  private readonly openMobilePage: PageOpenHandler;
  private readonly dailyNoteResolver: SiyuanDailyNoteResolver;
  private readonly memoBlockWriter: SiyuanMemoBlockWriter;
  private readonly warn: SiyuanWarningLogger;

  constructor(deps: SiyuanWriterDeps = {}) {
    this.post = deps.post ?? fetchSyncPost;
    this.warn = deps.warn ?? logger.warn;
    const frontEnd = deps.getFrontendName?.() ?? getFrontend();
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
    this.openDesktopPage = deps.openDesktopPage ?? this.openDesktopTab;
    this.openMobilePage = deps.openMobilePage ?? this.openMobileFile;
    this.dailyNoteResolver =
      deps.dailyNoteResolver ??
      new SiyuanDailyNoteResolver({
        post: this.post,
        warn: this.warn,
      });
    this.memoBlockWriter =
      deps.memoBlockWriter ??
      new SiyuanMemoBlockWriter({
        post: this.post,
        warn: this.warn,
      });
  }

  /**
   * 写入 memos 到思源
   */
  async writeMemos(
    processedMemos: ProcessedMemo[],
    config: FlomoConfig,
    silent: boolean = false,
  ): Promise<WriteMemosResult> {
    const { locationMode, dailnoteNotebook, pageId } = config;
    const sortedMemos = sortMemosForWriting(processedMemos);
    const usePrepend = shouldPrependMemos(config);

    if (locationMode === "0") {
      return this.writeToDailyNote(
        sortedMemos,
        dailnoteNotebook,
        usePrepend,
        silent,
      );
    }

    return this.writeToDocument(sortedMemos, pageId, usePrepend, silent);
  }

  /**
   * 写入到 DailyNote
   */
  private async writeToDailyNote(
    processedMemos: ProcessedMemo[],
    notebook: string,
    usePrepend: boolean,
    silent: boolean = false,
  ): Promise<WriteMemosResult> {
    const groupedMemos = groupMemosByUpdatedDate(processedMemos);
    const pageIdCache = new Map<string, string>();
    const result = createEmptyWriteResult();

    for (const [date, dateMemos] of groupedMemos) {
      const pageId = await this.resolveDailyNotePageId(notebook, date);
      if (!pageId) {
        dateMemos.forEach((memo) => {
          result.failed.push({
            memo,
            error: `无法解析 DailyNote 页面; notebook=${notebook}; date=${date}`,
          });
        });
        continue;
      }

      pageIdCache.set(date, pageId);
      for (const memo of dateMemos) {
        await this.writeMemoBlock(pageId, memo, usePrepend, result);
      }
    }

    if (!silent && getSuccessfulWriteCount(result) > 0) {
      const lastDate = getLastMemoUpdatedDate(processedMemos);
      const lastPageId =
        pageIdCache.get(lastDate) ||
        (await this.resolveDailyNotePageId(notebook, lastDate));
      if (lastPageId) {
        this.openPage(lastPageId);
      }
    }

    return result;
  }

  private async resolveDailyNotePageId(
    notebook: string,
    date: string,
  ): Promise<string> {
    try {
      return await this.dailyNoteResolver.resolveDailyNotePageId(notebook, date);
    } catch (error) {
      this.warn("SiyuanWriter.resolveDailyNotePageId: failed", {
        notebook,
        date,
        reason: getUnknownErrorReason(error),
      });
      return "";
    }
  }

  /**
   * 写入到指定文档
   */
  private async writeToDocument(
    processedMemos: ProcessedMemo[],
    targetPage: string,
    usePrepend: boolean,
    silent: boolean = false,
  ): Promise<WriteMemosResult> {
    const result = createEmptyWriteResult();

    for (const memo of processedMemos) {
      await this.writeMemoBlock(targetPage, memo, usePrepend, result);
    }

    if (!silent && getSuccessfulWriteCount(result) > 0) {
      this.openPage(targetPage);
    }

    return result;
  }

  private async writeMemoBlock(
    parentId: string,
    memo: ProcessedMemo,
    usePrepend: boolean,
    result: WriteMemosResult,
  ): Promise<void> {
    try {
      const writeResult = await this.memoBlockWriter.insertMemoBlock(
        parentId,
        memo,
        usePrepend,
      );

      if (writeResult.status === "skipped") {
        result.skipped.push(writeResult);
        return;
      }

      result.inserted.push(writeResult);
    } catch (error) {
      result.failed.push({
        memo,
        error: getUnknownErrorReason(error),
      });
    }
  }

  /**
   * 打开页面
   */
  private openPage(pageId: string): void {
    if (this.isMobile) {
      this.openMobilePage(pageId);
      return;
    }

    this.openDesktopPage(pageId);
  }

  private openDesktopTab(pageId: string): void {
    openTab({ app: window.siyuan?.ws?.app || {}, doc: { id: pageId } });
  }

  private openMobileFile(pageId: string): void {
    openMobileFileById(window.siyuan?.ws?.app || {}, pageId);
  }
}
