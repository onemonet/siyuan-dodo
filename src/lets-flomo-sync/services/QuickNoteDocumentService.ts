import type { IWebSocketData } from "siyuan";
import type { Moment } from "moment";
import type { FlomoConfig } from "../types";

type SiyuanRequest = (url: string, data?: unknown) => Promise<IWebSocketData>;

const SIYUAN_API = {
  listNotebooks: "/api/notebook/lsNotebooks",
  getBlockInfo: "/api/block/getBlockInfo",
  querySQL: "/api/query/sql",
  createDocWithMarkdown: "/api/filetree/createDocWithMd",
  createDailyNote: "/api/filetree/createDailyNote",
  getChildBlocks: "/api/block/getChildBlocks",
  getBlockKramdown: "/api/block/getBlockKramdown",
  removeDocById: "/api/filetree/removeDocByID",
} as const;

interface QuickNoteDocumentServiceOptions {
  request: SiyuanRequest;
  getNow: () => Moment;
}

interface TargetParentDocument {
  notebookId: string;
  parentDocumentId: string;
}

interface ParentDocumentInfo {
  notebookId: string;
  hpath: string;
}

export class QuickNoteDocumentService {
  constructor(private readonly options: QuickNoteDocumentServiceOptions) {}

  async createTempDocument(config: FlomoConfig): Promise<string> {
    const targetParent = await this.resolveTargetParentDocument(config);
    const parentInfo = await this.getParentDocumentInfo(
      targetParent.parentDocumentId,
    );
    const notebookId = targetParent.notebookId || parentInfo.notebookId;
    const timestamp = this.options.getNow().format("YYYYMMDDHHmmss");
    const tempPath = `${parentInfo.hpath}/${timestamp}`;

    const response = await this.options.request(SIYUAN_API.createDocWithMarkdown, {
      notebook: notebookId,
      path: tempPath,
      markdown: "",
    });

    if (response.code !== 0 || !response.data) {
      throw new Error(
        `QuickNoteDocumentService.createTempDocument: 创建临时文档失败; notebook=${notebookId}; path=${tempPath}; reason=${response.msg || "empty response"}`,
      );
    }

    return typeof response.data === "string" ? response.data : response.data.id;
  }

  async readDocumentMarkdown(documentId: string): Promise<string> {
    const childBlocksResponse = await this.options.request(
      SIYUAN_API.getChildBlocks,
      { id: documentId },
    );

    if (childBlocksResponse.code !== 0 || !childBlocksResponse.data) {
      throw new Error(
        `QuickNoteDocumentService.readDocumentMarkdown: 获取文档子块失败; documentId=${documentId}; reason=${childBlocksResponse.msg || "empty response"}`,
      );
    }

    const childBlocks = Array.isArray(childBlocksResponse.data)
      ? childBlocksResponse.data
      : [];
    if (!childBlocks.length) {
      throw new Error(
        `QuickNoteDocumentService.readDocumentMarkdown: 内容不能为空; documentId=${documentId}; reason=no child blocks`,
      );
    }

    const markdownBlocks: string[] = [];
    for (const block of childBlocks) {
      const blockId = String(block.id || "");
      if (!blockId) {
        continue;
      }

      const kramdownResponse = await this.options.request(
        SIYUAN_API.getBlockKramdown,
        { id: blockId },
      );

      if (kramdownResponse.code !== 0) {
        throw new Error(
          `QuickNoteDocumentService.readDocumentMarkdown: 获取块 Markdown 失败; documentId=${documentId}; blockId=${blockId}; reason=${kramdownResponse.msg || "request failed"}`,
        );
      }

      if (kramdownResponse.data?.kramdown) {
        markdownBlocks.push(String(kramdownResponse.data.kramdown));
      }
    }

    const markdown = markdownBlocks.join("\n\n").trim();
    if (!markdown) {
      throw new Error(
        `QuickNoteDocumentService.readDocumentMarkdown: 内容不能为空; documentId=${documentId}; reason=empty markdown`,
      );
    }

    return markdown;
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (!documentId) {
      return;
    }

    const response = await this.options.request(SIYUAN_API.removeDocById, {
      id: documentId,
    });

    if (response.code !== 0) {
      throw new Error(
        `QuickNoteDocumentService.deleteDocument: 删除临时文档失败; documentId=${documentId}; reason=${response.msg || "request failed"}`,
      );
    }
  }

  private async resolveTargetParentDocument(
    config: FlomoConfig,
  ): Promise<TargetParentDocument> {
    if (config.locationMode === "0") {
      const notebookId = config.dailnoteNotebook || (await this.getFallbackNotebookId());
      const today = this.options.getNow().format("YYYY-MM-DD");
      const parentDocumentId = await this.getDailyNotePageId(notebookId, today);

      return {
        notebookId,
        parentDocumentId,
      };
    }

    if (!config.pageId) {
      throw new Error(
        "QuickNoteDocumentService.resolveTargetParentDocument: 指定文档模式未配置 pageId; locationMode=1",
      );
    }

    const blockInfoResponse = await this.options.request(SIYUAN_API.getBlockInfo, {
      id: config.pageId,
    });

    if (blockInfoResponse.code !== 0 || !blockInfoResponse.data?.box) {
      throw new Error(
        `QuickNoteDocumentService.resolveTargetParentDocument: 获取目标文档信息失败; pageId=${config.pageId}; reason=${blockInfoResponse.msg || "missing box"}`,
      );
    }

    return {
      notebookId: String(blockInfoResponse.data.box),
      parentDocumentId: config.pageId,
    };
  }

  private async getFallbackNotebookId(): Promise<string> {
    const response = await this.options.request(SIYUAN_API.listNotebooks, {});
    const notebooks = Array.isArray(response.data?.notebooks)
      ? response.data.notebooks
      : [];
    const firstNotebookId = notebooks[0]?.id;

    if (response.code !== 0 || !firstNotebookId) {
      throw new Error(
        `QuickNoteDocumentService.getFallbackNotebookId: 没有可用的笔记本; reason=${response.msg || "empty notebooks"}`,
      );
    }

    return String(firstNotebookId);
  }

  private async getDailyNotePageId(
    notebookId: string,
    date: string,
  ): Promise<string> {
    const response = await this.options.request(SIYUAN_API.createDailyNote, {
      notebook: notebookId,
      date,
    });

    if (response.code !== 0 || !response.data?.id) {
      throw new Error(
        `QuickNoteDocumentService.getDailyNotePageId: 创建或获取 DailyNote 失败; notebook=${notebookId}; date=${date}; reason=${response.msg || "missing id"}`,
      );
    }

    return String(response.data.id);
  }

  private async getParentDocumentInfo(
    parentDocumentId: string,
  ): Promise<ParentDocumentInfo> {
    const response = await this.options.request(SIYUAN_API.querySQL, {
      stmt: `SELECT hpath, box FROM blocks WHERE id = '${parentDocumentId}' AND type = 'd'`,
    });
    const blockData = Array.isArray(response.data) ? response.data[0] : null;
    const hpath = blockData?.hpath ? String(blockData.hpath) : "";
    const notebookId = blockData?.box ? String(blockData.box) : "";

    if (response.code !== 0 || !blockData || !hpath) {
      throw new Error(
        `QuickNoteDocumentService.getParentDocumentInfo: 获取父文档路径失败; parentDocumentId=${parentDocumentId}; reason=${response.msg || "missing hpath"}`,
      );
    }

    return {
      notebookId,
      hpath,
    };
  }
}
