import { createLogger } from "../../logger";
import {
  buildSiyuanServiceError,
  extractSiyuanPageId,
  getSiyuanResponseReason,
  getUnknownErrorReason,
  SIYUAN_API_ENDPOINTS,
  type SiyuanPost,
  type SiyuanWarningLogger,
} from "./siyuanApi";

const DAILY_NOTE_DATE_FORMAT = "2006-01-02";
const DAILY_NOTE_NOW_TOKEN = /now/g;
const logger = createLogger("SiyuanDailyNoteResolver");

export interface SiyuanDailyNoteResolverDeps {
  post: SiyuanPost;
  warn?: SiyuanWarningLogger;
}

function buildDailyNoteTemplateDate(date: string): string {
  return `toDate "${DAILY_NOTE_DATE_FORMAT}" "${date}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function extractDailyNoteSavePath(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.conf)) {
    return "";
  }

  const dailyNoteSavePath = value.conf.dailyNoteSavePath;
  return typeof dailyNoteSavePath === "string" ? dailyNoteSavePath : "";
}

function extractId(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  return String(value.id || "");
}

export class SiyuanDailyNoteResolver {
  private readonly post: SiyuanPost;
  private readonly warn: SiyuanWarningLogger;

  constructor(deps: SiyuanDailyNoteResolverDeps) {
    this.post = deps.post;
    this.warn = deps.warn ?? logger.warn;
  }

  async resolveDailyNotePageId(notebook: string, date: string): Promise<string> {
    const pageIdFromConfiguredPath = await this.tryResolveConfiguredPageId(
      notebook,
      date,
    );
    if (pageIdFromConfiguredPath) {
      return pageIdFromConfiguredPath;
    }

    const pageIdFromFallback = await this.tryCreateDailyNote(notebook, date);
    if (pageIdFromFallback) {
      return pageIdFromFallback;
    }

    return this.createTodayDailyNote(notebook, date);
  }

  private async tryResolveConfiguredPageId(
    notebook: string,
    date: string,
  ): Promise<string> {
    try {
      const renderedPath = await this.renderDailyNotePath(notebook, date);
      const existingPageId = await this.findPageIdByHPath(notebook, renderedPath);
      if (existingPageId) {
        return existingPageId;
      }

      return this.createDocumentAtPath(notebook, renderedPath, date);
    } catch (error) {
      this.warn("SiyuanDailyNoteResolver.tryResolveConfiguredPageId: failed", {
        notebook,
        date,
        reason: getUnknownErrorReason(error),
      });
      return "";
    }
  }

  private async renderDailyNotePath(
    notebook: string,
    date: string,
  ): Promise<string> {
    const response = await this.post(SIYUAN_API_ENDPOINTS.getNotebookConf, {
      notebook,
    });
    const dailyNoteSavePath = extractDailyNoteSavePath(response.data);
    if (response.code !== 0 || !dailyNoteSavePath) {
      throw buildSiyuanServiceError(
        "renderDailyNotePath",
        { notebook, date },
        getSiyuanResponseReason(response),
      );
    }

    const templateDate = buildDailyNoteTemplateDate(date);
    const pathTemplate = dailyNoteSavePath.replace(
      DAILY_NOTE_NOW_TOKEN,
      templateDate,
    );
    const renderResponse = await this.post(SIYUAN_API_ENDPOINTS.renderSprig, {
      template: pathTemplate,
    });
    if (renderResponse.code !== 0 || !renderResponse.data) {
      throw buildSiyuanServiceError(
        "renderDailyNotePath.renderSprig",
        { notebook, date, pathTemplate },
        getSiyuanResponseReason(renderResponse),
      );
    }

    return String(renderResponse.data);
  }

  private async findPageIdByHPath(
    notebook: string,
    renderedPath: string,
  ): Promise<string> {
    const response = await this.post(SIYUAN_API_ENDPOINTS.getIDsByHPath, {
      notebook,
      path: renderedPath,
    });
    if (response.code !== 0) {
      this.warn("SiyuanDailyNoteResolver.findPageIdByHPath: request failed", {
        notebook,
        renderedPath,
        reason: getSiyuanResponseReason(response),
      });
      return "";
    }

    const ids = Array.isArray(response.data) ? response.data : [];
    return ids.length > 0 ? String(ids[0]) : "";
  }

  private async createDocumentAtPath(
    notebook: string,
    renderedPath: string,
    date: string,
  ): Promise<string> {
    const response = await this.post(SIYUAN_API_ENDPOINTS.createDocWithMd, {
      notebook,
      path: renderedPath,
      markdown: "",
    });
    if (response.code !== 0 || !response.data) {
      this.warn("SiyuanDailyNoteResolver.createDocumentAtPath: request failed", {
        notebook,
        renderedPath,
        date,
        reason: getSiyuanResponseReason(response),
      });
      return "";
    }

    const pageId = extractSiyuanPageId(response.data);
    if (!pageId) {
      this.warn("SiyuanDailyNoteResolver.createDocumentAtPath: page id missing", {
        notebook,
        renderedPath,
        date,
      });
      return "";
    }

    await this.setDailyNoteAttrs(pageId, date);
    return pageId;
  }

  private async setDailyNoteAttrs(pageId: string, date: string): Promise<void> {
    const dateKey = date.replace(/-/g, "");
    const response = await this.post(SIYUAN_API_ENDPOINTS.setBlockAttrs, {
      id: pageId,
      attrs: {
        [`custom-dailynote-${dateKey}`]: dateKey,
      },
    });
    if (response.code !== 0) {
      this.warn("SiyuanDailyNoteResolver.setDailyNoteAttrs: request failed", {
        pageId,
        date,
        reason: getSiyuanResponseReason(response),
      });
    }
  }

  private async tryCreateDailyNote(
    notebook: string,
    date: string,
  ): Promise<string> {
    try {
      const response = await this.post(SIYUAN_API_ENDPOINTS.createDailyNote, {
        notebook,
        date,
      });
      const pageId = extractId(response.data);
      if (response.code !== 0 || !pageId) {
        this.warn("SiyuanDailyNoteResolver.tryCreateDailyNote: request failed", {
          notebook,
          date,
          reason: getSiyuanResponseReason(response),
        });
        return "";
      }

      return pageId;
    } catch (error) {
      this.warn("SiyuanDailyNoteResolver.tryCreateDailyNote: failed", {
        notebook,
        date,
        reason: getUnknownErrorReason(error),
      });
      return "";
    }
  }

  private async createTodayDailyNote(
    notebook: string,
    originalDate: string,
  ): Promise<string> {
    const response = await this.post(SIYUAN_API_ENDPOINTS.createDailyNote, {
      notebook,
    });
    const pageId = extractId(response.data);
    if (response.code !== 0 || !pageId) {
      throw buildSiyuanServiceError(
        "createTodayDailyNote",
        { notebook, originalDate },
        getSiyuanResponseReason(response),
      );
    }

    return pageId;
  }
}
