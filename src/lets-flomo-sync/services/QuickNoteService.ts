import moment from "moment";
import type { App } from "siyuan";
import type { IWebSocketData } from "siyuan";
import { createLogger } from "../../logger";
import type { FlomoConfig, ProcessedMemo } from "../types";
import { processQuickNote } from "../utils/markdown";
import type { SiyuanWriter } from "./SiyuanWriter";
import {
  QuickNoteDialogPresenter,
  type QuickNoteControls,
  type QuickNoteDialogSession,
  disableQuickNoteControls,
  enableQuickNoteControls,
} from "./QuickNoteDialogPresenter";
import { QuickNoteDocumentService } from "./QuickNoteDocumentService";

type SiyuanRequest = (url: string, data?: unknown) => Promise<IWebSocketData>;

const QUICK_NOTE_UI = {
  saveSuccessMessage: "速记已保存",
  saveFailureMessage: "速记保存失败",
  openFailureMessage: "开启速记失败",
} as const;

const NOTIFICATION_API = {
  pushMessage: "/api/notification/pushMsg",
  pushErrorMessage: "/api/notification/pushErrMsg",
} as const;
const logger = createLogger("QuickNoteService");

interface QuickNoteServiceOptions {
  app: App;
  request: SiyuanRequest;
  getConfig: () => FlomoConfig;
  createWriter: () => SiyuanWriter;
  getNow?: () => moment.Moment;
}

export class QuickNoteService {
  private readonly documentService: QuickNoteDocumentService;
  private readonly dialogPresenter: QuickNoteDialogPresenter;
  private activeSession: QuickNoteDialogSession | null = null;
  private tempDocumentId: string | null = null;
  private shouldDeleteOnClose = true;

  constructor(private readonly options: QuickNoteServiceOptions) {
    this.dialogPresenter = new QuickNoteDialogPresenter(options.app);
    this.documentService = new QuickNoteDocumentService({
      request: options.request,
      getNow: options.getNow || (() => moment()),
    });
  }

  async open(): Promise<void> {
    if (this.activeSession) {
      this.activeSession.focus();
      return;
    }

    try {
      const config = this.options.getConfig();
      const tempDocumentId = await this.documentService.createTempDocument(config);
      this.tempDocumentId = tempDocumentId;
      this.shouldDeleteOnClose = true;
      this.activeSession = this.dialogPresenter.create(tempDocumentId, {
        onConfirm: (controls) => this.handleConfirm(controls),
        onCancel: (controls) => this.handleCancel(controls),
        onAutoDeleteChange: (shouldDeleteOnClose) => {
          this.shouldDeleteOnClose = shouldDeleteOnClose;
        },
        onDestroy: () => {
          void this.handleDialogDestroyed().catch((error) => {
            logger.warn("open: failed after dialog destroyed", {
              tempDocumentId: this.tempDocumentId,
              reason: error instanceof Error ? error.message : String(error),
            });
          });
        },
      });
    } catch (error) {
      logger.warn("open: failed to open quick note", {
        reason: error instanceof Error ? error.message : String(error),
      });
      await this.notifyError(QUICK_NOTE_UI.openFailureMessage);
      await this.cleanupTempDocument();
      this.resetActiveDialogState();
    }
  }

  destroy(): void {
    if (this.activeSession) {
      this.activeSession.destroy();
      return;
    }

    this.resetActiveDialogState();
  }

  private handleCancel(controls: QuickNoteControls): void {
    disableQuickNoteControls(controls);
    this.activeSession?.destroy();
  }

  private async handleConfirm(
    controls: QuickNoteControls,
  ): Promise<void> {
    disableQuickNoteControls(controls);

    try {
      await this.saveQuickNote();
      this.shouldDeleteOnClose = false;
      this.tempDocumentId = null;
      await this.notifyMessage(QUICK_NOTE_UI.saveSuccessMessage);
      this.activeSession?.destroy();
    } catch (error) {
      logger.warn("handleConfirm: failed to save quick note", {
        tempDocumentId: this.tempDocumentId,
        reason: error instanceof Error ? error.message : String(error),
      });
      await this.notifyError(QUICK_NOTE_UI.saveFailureMessage);
      enableQuickNoteControls(controls);
    }
  }

  private async saveQuickNote(): Promise<void> {
    if (!this.tempDocumentId) {
      throw new Error(
        "QuickNoteService.saveQuickNote: 临时文档 ID 不存在; tempDocumentId=null",
      );
    }

    const config = this.options.getConfig();
    const markdown = await this.documentService.readDocumentMarkdown(
      this.tempDocumentId,
    );
    const processedMemo = this.createProcessedMemo(markdown, config);
    const writer = this.options.createWriter();

    const writeResult = await writer.writeMemos([processedMemo], config, true);
    if (writeResult.failed.length > 0) {
      throw new Error(
        `QuickNoteService.saveQuickNote: 写入失败; reason=${writeResult.failed[0].error}`,
      );
    }

    if (this.shouldDeleteOnClose) {
      await this.cleanupTempDocument();
    } else {
      this.tempDocumentId = null;
    }
  }

  private createProcessedMemo(
    markdown: string,
    config: FlomoConfig,
  ): ProcessedMemo {
    return processQuickNote(markdown, config.contentTemplate, config.timeFormat);
  }

  private async cleanupTempDocument(): Promise<void> {
    const documentId = this.tempDocumentId;
    this.tempDocumentId = null;

    if (!documentId) {
      return;
    }

    try {
      await this.documentService.deleteDocument(documentId);
    } catch (error) {
      logger.warn("cleanupTempDocument: failed to delete temp document", {
        documentId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleDialogDestroyed(): Promise<void> {
    this.activeSession = null;

    if (this.shouldDeleteOnClose && this.tempDocumentId) {
      await this.cleanupTempDocument();
    }
  }

  private resetActiveDialogState(): void {
    this.activeSession = null;
    this.tempDocumentId = null;
    this.shouldDeleteOnClose = true;
  }

  private async notifyMessage(message: string): Promise<void> {
    await this.options.request(NOTIFICATION_API.pushMessage, { msg: message });
  }

  private async notifyError(message: string): Promise<void> {
    await this.options.request(NOTIFICATION_API.pushErrorMessage, {
      msg: message,
    });
  }
}
