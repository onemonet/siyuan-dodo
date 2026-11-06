export type ShareResult<T> = {
  data: T | null;
  error: string | null;
};

export type NotionRichText = {
  type: "text";
  text: {
    content: string;
    link?: {
      url: string;
    };
  };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
};

export type NotionBlock = {
  object: "block";
  type: string;
  [key: string]: any;
};

export type NotionPageResponse = {
  id?: string;
  url?: string;
};

export type NotionArchivePageParams = {
  token: string;
  pageUrl: string;
};

export type NotionCreatePageParams = {
  token: string;
  databaseId: string;
  title: string;
  blocks: NotionBlock[];
  existingPageUrl: string;
};

export type ShareDocumentPayload = {
  docId: string;
  title: string;
  markdown: string;
  existingShareUrl: string;
  notionEditedTime: string;
  notionManifest: string;
};
