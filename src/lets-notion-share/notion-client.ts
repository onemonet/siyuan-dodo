import {
  NOTION_API_BASE_URL,
  NOTION_API_VERSION,
  NOTION_MAX_BLOCKS_PER_REQUEST,
  NOTION_SHARE_REQUEST_ERROR_PREFIX,
} from "./constants";
import {
  NotionArchivePageParams,
  NotionBlock,
  NotionCreatePageParams,
  NotionPageResponse,
  ShareResult,
} from "./types";

const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const CONTENT_TYPE_JSON = "application/json";
const MAX_RETRY_COUNT = 2;
const IMAGE_BLOCK_TYPE = "image";
const EXTERNAL_IMAGE_TYPE = "external";
const FILE_UPLOAD_IMAGE_TYPE = "file_upload";
const NOTION_TITLE_PROPERTY_TYPE = "title";
const NOTION_ARCHIVE_BLOCK_VALUE = true;
const NOTION_CHILDREN_PAGE_SIZE = 100;
const NOTION_URL_DASH = "-";
const NOTION_URL_SLASH = "/";

function chunkBlocks(blocks: NotionBlock[]): NotionBlock[][] {
  const chunks: NotionBlock[][] = [];
  let currentIndex = 0;

  while (currentIndex < blocks.length) {
    const nextIndex = currentIndex + NOTION_MAX_BLOCKS_PER_REQUEST;
    chunks.push(blocks.slice(currentIndex, nextIndex));
    currentIndex = nextIndex;
  }

  return chunks;
}

async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": CONTENT_TYPE_JSON,
  };
}

async function requestNotion(
  input: RequestInfo | URL,
  init: RequestInit,
  retryCount = 0
): Promise<ShareResult<any>> {
  try {
    const response = await fetch(input, init);
    if (
      response.status === HTTP_STATUS_TOO_MANY_REQUESTS &&
      retryCount < MAX_RETRY_COUNT
    ) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterSeconds = Number(
        retryAfterHeader || DEFAULT_RETRY_AFTER_SECONDS
      );
      const delay = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : DEFAULT_RETRY_AFTER_SECONDS * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return requestNotion(input, init, retryCount + 1);
    }

    if (!response.ok) {
      const payload = await parseJsonSafe(response);
      const message =
        payload?.message || response.statusText || String(response.status);
      return {
        data: null,
        error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: ${message}`,
      };
    }

    const payload = await parseJsonSafe(response);
    return {
      data: payload,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: ${String(error)}`,
    };
  }
}

function buildTitlePropertyValue(title: string) {
  return {
    title: [
      {
        text: {
          content: title,
        },
      },
    ],
  };
}

function extractTitlePropertyName(databasePayload: any): string {
  const properties = databasePayload?.properties;
  if (!properties || typeof properties !== "object") {
    return "";
  }

  for (const [propertyName, propertyConfig] of Object.entries(properties)) {
    if (
      (propertyConfig as Record<string, unknown>)?.type ===
      NOTION_TITLE_PROPERTY_TYPE
    ) {
      return propertyName;
    }
  }

  return "";
}

async function loadDatabaseTitlePropertyName(
  token: string,
  databaseId: string
): Promise<ShareResult<string>> {
  const headers = buildHeaders(token);
  const databaseResult = await requestNotion(
    `${NOTION_API_BASE_URL}/databases/${databaseId}`,
    {
      method: "GET",
      headers,
    }
  );

  if (databaseResult.error) {
    return {
      data: null,
      error: databaseResult.error,
    };
  }

  const titlePropertyName = extractTitlePropertyName(databaseResult.data);
  if (!titlePropertyName) {
    return {
      data: null,
      error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 未找到 Notion 数据库标题字段，请确认目标 database 可被当前 integration 访问`,
    };
  }

  return {
    data: titlePropertyName,
    error: null,
  };
}

function buildCreatePagePayload(
  params: NotionCreatePageParams,
  firstChunk: NotionBlock[],
  titlePropertyName: string
) {
  const title = params.title.trim();
  return {
    parent: {
      database_id: params.databaseId,
    },
    properties: {
      [titlePropertyName]: buildTitlePropertyValue(title),
    },
    children: firstChunk,
  };
}

function buildUpdatePagePayload(
  params: NotionCreatePageParams,
  titlePropertyName: string
) {
  const title = params.title.trim();
  return {
    properties: {
      [titlePropertyName]: buildTitlePropertyValue(title),
    },
  };
}

async function fetchImageBlob(url: string): Promise<ShareResult<Blob>> {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        data: null,
        error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 图片读取失败 ${response.status}`,
      };
    }

    const blob = await response.blob();
    return {
      data: blob,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 图片读取异常 ${String(error)}`,
    };
  }
}

function getFileNameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const segments = pathname.split(NOTION_URL_SLASH).filter(Boolean);
    return segments[segments.length - 1] || "image";
  } catch (_error) {
    return "image";
  }
}

async function uploadImageToNotion(
  token: string,
  url: string
): Promise<ShareResult<string>> {
  const imageBlobResult = await fetchImageBlob(url);
  if (imageBlobResult.error || !imageBlobResult.data) {
    return {
      data: null,
      error: imageBlobResult.error,
    };
  }

  const createUploadResult = await requestNotion(
    `${NOTION_API_BASE_URL}/file_uploads`,
    {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify({}),
    }
  );

  if (createUploadResult.error || !createUploadResult.data?.id) {
    return {
      data: null,
      error:
        createUploadResult.error ||
        `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 创建 Notion 图片上传会话失败`,
    };
  }

  const formData = new FormData();
  formData.append("file", imageBlobResult.data, getFileNameFromUrl(url));
  const sendHeaders = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_API_VERSION,
  };
  const sendResponse = await fetch(
    `${NOTION_API_BASE_URL}/file_uploads/${createUploadResult.data.id}/send`,
    {
      method: "POST",
      headers: sendHeaders,
      body: formData,
    }
  );

  if (!sendResponse.ok) {
    const payload = await parseJsonSafe(sendResponse);
    const message =
      payload?.message || sendResponse.statusText || String(sendResponse.status);
    return {
      data: null,
      error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: ${message}`,
    };
  }

  return {
    data: createUploadResult.data.id,
    error: null,
  };
}

async function replaceExternalImages(
  token: string,
  blocks: NotionBlock[]
): Promise<ShareResult<NotionBlock[]>> {
  const convertedBlocks: NotionBlock[] = [];

  for (const block of blocks) {
    if (
      block.type !== IMAGE_BLOCK_TYPE ||
      block.image?.type !== EXTERNAL_IMAGE_TYPE
    ) {
      convertedBlocks.push(block);
      continue;
    }

    const imageUrl = block.image?.external?.url || "";
    if (!imageUrl) {
      convertedBlocks.push(block);
      continue;
    }

    const uploadResult = await uploadImageToNotion(token, imageUrl);
    if (uploadResult.error || !uploadResult.data) {
      return {
        data: null,
        error:
          uploadResult.error ||
          `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 图片上传失败`,
      };
    }

    convertedBlocks.push({
      ...block,
      image: {
        type: FILE_UPLOAD_IMAGE_TYPE,
        file_upload: {
          id: uploadResult.data,
        },
        ...(block.image?.caption ? { caption: block.image.caption } : {}),
      },
    });
  }

  return {
    data: convertedBlocks,
    error: null,
  };
}

function extractPageIdFromUrl(pageUrl: string): string {
  try {
    const parsedUrl = new URL(pageUrl);
    const lastSegment =
      parsedUrl.pathname.split(NOTION_URL_SLASH).filter(Boolean).pop() || "";
    const compactId = lastSegment
      .split(NOTION_URL_DASH)
      .pop()
      ?.replace(/[^a-fA-F0-9]/g, "") || "";

    if (compactId.length !== 32) {
      return "";
    }

    return `${compactId.slice(0, 8)}-${compactId.slice(8, 12)}-${compactId.slice(
      12,
      16
    )}-${compactId.slice(16, 20)}-${compactId.slice(20)}`;
  } catch (_error) {
    return "";
  }
}

async function listBlockChildren(
  token: string,
  pageId: string
): Promise<ShareResult<any[]>> {
  const headers = buildHeaders(token);
  const result = await requestNotion(
    `${NOTION_API_BASE_URL}/blocks/${pageId}/children?page_size=${NOTION_CHILDREN_PAGE_SIZE}`,
    {
      method: "GET",
      headers,
    }
  );

  if (result.error) {
    return {
      data: null,
      error: result.error,
    };
  }

  return {
    data: result.data?.results || [],
    error: null,
  };
}

async function archiveBlock(token: string, blockId: string): Promise<ShareResult<null>> {
  const headers = buildHeaders(token);
  const result = await requestNotion(`${NOTION_API_BASE_URL}/blocks/${blockId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ archived: NOTION_ARCHIVE_BLOCK_VALUE }),
  });

  if (result.error) {
    return {
      data: null,
      error: result.error,
    };
  }

  return {
    data: null,
    error: null,
  };
}

async function clearPageChildren(
  token: string,
  pageId: string
): Promise<ShareResult<null>> {
  const childrenResult = await listBlockChildren(token, pageId);
  if (childrenResult.error || !childrenResult.data) {
    return {
      data: null,
      error: childrenResult.error,
    };
  }

  for (const child of childrenResult.data) {
    const blockId = child?.id || "";
    if (!blockId) {
      continue;
    }

    const archiveResult = await archiveBlock(token, blockId);
    if (archiveResult.error) {
      return {
        data: null,
        error: archiveResult.error,
      };
    }
  }

  return {
    data: null,
    error: null,
  };
}

async function appendPageChildren(
  token: string,
  pageId: string,
  chunks: NotionBlock[][]
): Promise<ShareResult<null>> {
  const headers = buildHeaders(token);

  for (const chunk of chunks) {
    const appendResult = await requestNotion(
      `${NOTION_API_BASE_URL}/blocks/${pageId}/children`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ children: chunk }),
      }
    );

    if (appendResult.error) {
      return {
        data: null,
        error: appendResult.error,
      };
    }
  }

  return {
    data: null,
    error: null,
  };
}

async function updateNotionPage(
  params: NotionCreatePageParams,
  pageId: string,
  titlePropertyName: string,
  blocks: NotionBlock[]
): Promise<ShareResult<NotionPageResponse>> {
  const headers = buildHeaders(params.token);
  const updatePayload = buildUpdatePagePayload(params, titlePropertyName);
  const updateResult = await requestNotion(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updatePayload),
  });

  if (updateResult.error) {
    return {
      data: null,
      error: updateResult.error,
    };
  }

  const clearResult = await clearPageChildren(params.token, pageId);
  if (clearResult.error) {
    return {
      data: null,
      error: clearResult.error,
    };
  }

  const chunks = chunkBlocks(blocks);
  const appendResult = await appendPageChildren(params.token, pageId, chunks);
  if (appendResult.error) {
    return {
      data: null,
      error: appendResult.error,
    };
  }

  return {
    data: {
      id: pageId,
      url: updateResult.data?.url || params.existingPageUrl || "",
    },
    error: null,
  };
}

export async function createNotionPage(
  params: NotionCreatePageParams
): Promise<ShareResult<NotionPageResponse>> {
  const titlePropertyResult = await loadDatabaseTitlePropertyName(
    params.token,
    params.databaseId
  );

  if (titlePropertyResult.error || !titlePropertyResult.data) {
    return {
      data: null,
      error:
        titlePropertyResult.error ||
        `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 无法识别标题字段`,
    };
  }

  const imageConvertedResult = await replaceExternalImages(params.token, params.blocks);
  if (imageConvertedResult.error || !imageConvertedResult.data) {
    return {
      data: null,
      error:
        imageConvertedResult.error ||
        `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 图片处理失败`,
    };
  }

  const existingPageId = extractPageIdFromUrl(params.existingPageUrl || "");
  if (existingPageId) {
    return updateNotionPage(
      params,
      existingPageId,
      titlePropertyResult.data,
      imageConvertedResult.data
    );
  }

  const chunks = chunkBlocks(imageConvertedResult.data);
  const firstChunk = chunks[0] || [];
  const headers = buildHeaders(params.token);
  const createPayload = buildCreatePagePayload(
    params,
    firstChunk,
    titlePropertyResult.data
  );

  const createResult = await requestNotion(`${NOTION_API_BASE_URL}/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify(createPayload),
  });

  if (createResult.error) {
    return {
      data: null,
      error: createResult.error,
    };
  }

  const pageId = createResult.data?.id;
  const pageUrl = createResult.data?.url;
  if (!pageId || !pageUrl) {
    return {
      data: null,
      error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: Notion 页面创建成功但返回数据不完整`,
    };
  }

  const appendResult = await appendPageChildren(
    params.token,
    pageId,
    chunks.slice(1)
  );
  if (appendResult.error) {
    return {
      data: null,
      error: appendResult.error,
    };
  }

  return {
    data: {
      id: pageId,
      url: pageUrl,
    },
    error: null,
  };
}

export async function archiveNotionPage(
  params: NotionArchivePageParams
): Promise<ShareResult<null>> {
  const pageId = extractPageIdFromUrl(params.pageUrl);
  if (!pageId) {
    return {
      data: null,
      error: `${NOTION_SHARE_REQUEST_ERROR_PREFIX}: 无法从分享链接中解析 Notion 页面 ID`,
    };
  }

  const headers = buildHeaders(params.token);
  const archiveResult = await requestNotion(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ archived: NOTION_ARCHIVE_BLOCK_VALUE }),
  });

  if (archiveResult.error) {
    return {
      data: null,
      error: archiveResult.error,
    };
  }

  return {
    data: null,
    error: null,
  };
}
