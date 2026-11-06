import {
  NOTION_BOOKMARK_BLOCK_TYPE,
  NOTION_BULLETED_LIST_ITEM_BLOCK_TYPE,
  NOTION_CHILD_PAGE_BLOCK_TYPE,
  NOTION_CODE_BLOCK_TYPE,
  NOTION_DEFAULT_CODE_LANGUAGE,
  NOTION_DIVIDER_BLOCK_TYPE,
  NOTION_HEADING_1_BLOCK_TYPE,
  NOTION_HEADING_2_BLOCK_TYPE,
  NOTION_HEADING_3_BLOCK_TYPE,
  NOTION_MAX_BLOCKS_PER_REQUEST,
  NOTION_MAX_RICH_TEXT_LENGTH,
  NOTION_NUMBERED_LIST_ITEM_BLOCK_TYPE,
  NOTION_PARAGRAPH_BLOCK_TYPE,
  NOTION_QUOTE_BLOCK_TYPE,
  NOTION_TOGGLE_BLOCK_TYPE,
} from "./constants";
import { NotionBlock, NotionRichText, ShareResult } from "./types";

const MARKDOWN_LINE_BREAK = "\n";
const MARKDOWN_TRIPLE_BACKTICK = "```";
const MARKDOWN_BULLET_PREFIX = "- ";
const MARKDOWN_ALT_BULLET_PREFIX = "* ";
const MARKDOWN_NUMBERED_LIST_REGEX = /^\d+\.\s+/;
const MARKDOWN_BLOCKQUOTE_PREFIX = "> ";
const MARKDOWN_TOGGLE_PREFIX = "> [!toggle] ";
const MARKDOWN_H1_PREFIX = "# ";
const MARKDOWN_H2_PREFIX = "## ";
const MARKDOWN_H3_PREFIX = "### ";
const MARKDOWN_HORIZONTAL_RULE = "---";
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const MARKDOWN_BOLD_REGEX = /\*\*([^*]+)\*\*/g;
const MARKDOWN_ITALIC_REGEX = /\*([^*]+)\*/g;
const MARKDOWN_STRIKE_REGEX = /~~([^~]+)~~/g;
const MARKDOWN_INLINE_CODE_REGEX = /`([^`]+)`/g;
const MARKDOWN_UNDERLINE_REGEX = /<u>(.*?)<\/u>/g;
const MARKDOWN_IMAGE_REGEX = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/;
const ASSET_PATH_PREFIX = "assets/";
const ASSET_PATH_SECONDARY_PREFIX = "/assets/";
const HTTP_PREFIX = "http://";
const HTTPS_PREFIX = "https://";

function createText(content: string): NotionRichText {
  return {
    type: "text",
    text: { content },
  };
}

function splitTextContent(content: string): string[] {
  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < content.length) {
    const nextIndex = currentIndex + NOTION_MAX_RICH_TEXT_LENGTH;
    chunks.push(content.slice(currentIndex, nextIndex));
    currentIndex = nextIndex;
  }

  return chunks.length > 0 ? chunks : [""];
}

function createRichText(content: string): NotionRichText[] {
  return splitTextContent(content).map((item) => createText(item));
}

function createBlock(type: string, richText: NotionRichText[]): NotionBlock {
  return {
    object: "block",
    type,
    [type]: {
      rich_text: richText,
    },
  };
}

function createCodeBlock(content: string): NotionBlock {
  return {
    object: "block",
    type: NOTION_CODE_BLOCK_TYPE,
    [NOTION_CODE_BLOCK_TYPE]: {
      rich_text: createRichText(content),
      language: NOTION_DEFAULT_CODE_LANGUAGE,
    },
  };
}

function createImageBlock(url: string, caption: string): NotionBlock {
  const imageBlock: NotionBlock = {
    object: "block",
    type: "image",
    image: {
      type: "external",
      external: {
        url,
      },
    },
  };

  if (caption) {
    imageBlock.image.caption = createRichText(caption);
  }

  return imageBlock;
}

function normalizeAssetUrl(path: string): string {
  const trimmedPath = path.trim();
  if (trimmedPath.startsWith(HTTP_PREFIX) || trimmedPath.startsWith(HTTPS_PREFIX)) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith(ASSET_PATH_SECONDARY_PREFIX)) {
    return `${location.origin}${trimmedPath}`;
  }

  if (trimmedPath.startsWith(ASSET_PATH_PREFIX)) {
    const encodedPath = encodeURIComponent(trimmedPath.slice(ASSET_PATH_PREFIX.length));
    return `${location.origin}${ASSET_PATH_SECONDARY_PREFIX}${encodedPath}`;
  }

  return trimmedPath;
}

function parseInlineMarkdown(text: string): NotionRichText[] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const richTexts: NotionRichText[] = [];
  let lastIndex = 0;
  const combinedRegex = new RegExp(
    `${MARKDOWN_LINK_REGEX.source}|${MARKDOWN_BOLD_REGEX.source}|${MARKDOWN_STRIKE_REGEX.source}|${MARKDOWN_INLINE_CODE_REGEX.source}|${MARKDOWN_UNDERLINE_REGEX.source}|${MARKDOWN_ITALIC_REGEX.source}`,
    "g"
  );

  for (const match of normalizedText.matchAll(combinedRegex)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      richTexts.push(...createRichText(normalizedText.slice(lastIndex, matchIndex)));
    }

    const [fullMatch, linkText, linkUrl, boldText, strikeText, codeText, underlineText, italicText] = match;
    const value = linkText || boldText || strikeText || codeText || underlineText || italicText || fullMatch;
    const item = createText(value);

    if (linkText && linkUrl) {
      item.text.link = { url: linkUrl };
    }

    if (boldText) {
      item.annotations = { ...(item.annotations || {}), bold: true };
    }

    if (strikeText) {
      item.annotations = { ...(item.annotations || {}), strikethrough: true };
    }

    if (codeText) {
      item.annotations = { ...(item.annotations || {}), code: true };
    }

    if (underlineText) {
      item.annotations = { ...(item.annotations || {}), underline: true };
    }

    if (italicText && !boldText) {
      item.annotations = { ...(item.annotations || {}), italic: true };
    }

    richTexts.push(item);
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < normalizedText.length) {
    richTexts.push(...createRichText(normalizedText.slice(lastIndex)));
  }

  return richTexts.length > 0 ? richTexts : createRichText(normalizedText);
}

function isCodeFence(line: string): boolean {
  return line.trim().startsWith(MARKDOWN_TRIPLE_BACKTICK);
}

function normalizeMarkdown(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, MARKDOWN_LINE_BREAK)
    .split(MARKDOWN_LINE_BREAK)
    .map((item) => item.replace(/\u00A0/g, " "));
}

function tryCreateImageBlock(line: string): NotionBlock | null {
  const match = line.match(MARKDOWN_IMAGE_REGEX);
  if (!match) {
    return null;
  }

  const altText = match[1]?.trim() || "";
  const imagePath = match[2]?.trim() || "";
  const title = match[3]?.trim() || "";
  const caption = title || altText;
  const imageUrl = normalizeAssetUrl(imagePath);

  if (!imageUrl) {
    return null;
  }

  return createImageBlock(imageUrl, caption);
}

export function markdownToNotionBlocks(markdown: string): ShareResult<NotionBlock[]> {
  try {
    const lines = normalizeMarkdown(markdown);
    const blocks: NotionBlock[] = [];
    const codeLines: string[] = [];
    let isInCodeBlock = false;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (isCodeFence(line)) {
        if (isInCodeBlock) {
          const codeContent = codeLines.join(MARKDOWN_LINE_BREAK).trim();
          if (codeContent) {
            blocks.push(createCodeBlock(codeContent));
          }
          codeLines.length = 0;
          isInCodeBlock = false;
        } else {
          isInCodeBlock = true;
        }
        continue;
      }

      if (isInCodeBlock) {
        codeLines.push(rawLine);
        continue;
      }

      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      const imageBlock = tryCreateImageBlock(trimmedLine);
      if (imageBlock) {
        blocks.push(imageBlock);
        continue;
      }

      if (trimmedLine === MARKDOWN_HORIZONTAL_RULE) {
        blocks.push({ object: "block", type: NOTION_DIVIDER_BLOCK_TYPE, [NOTION_DIVIDER_BLOCK_TYPE]: {} });
        continue;
      }

      if (trimmedLine.startsWith(MARKDOWN_H3_PREFIX)) {
        blocks.push(createBlock(NOTION_HEADING_3_BLOCK_TYPE, parseInlineMarkdown(trimmedLine.slice(MARKDOWN_H3_PREFIX.length))));
        continue;
      }

      if (trimmedLine.startsWith(MARKDOWN_H2_PREFIX)) {
        blocks.push(createBlock(NOTION_HEADING_2_BLOCK_TYPE, parseInlineMarkdown(trimmedLine.slice(MARKDOWN_H2_PREFIX.length))));
        continue;
      }

      if (trimmedLine.startsWith(MARKDOWN_H1_PREFIX)) {
        blocks.push(createBlock(NOTION_HEADING_1_BLOCK_TYPE, parseInlineMarkdown(trimmedLine.slice(MARKDOWN_H1_PREFIX.length))));
        continue;
      }

      if (trimmedLine.startsWith(MARKDOWN_TOGGLE_PREFIX)) {
        blocks.push(createBlock(NOTION_TOGGLE_BLOCK_TYPE, parseInlineMarkdown(trimmedLine.slice(MARKDOWN_TOGGLE_PREFIX.length))));
        continue;
      }

      if (trimmedLine.startsWith(MARKDOWN_BLOCKQUOTE_PREFIX)) {
        blocks.push(createBlock(NOTION_QUOTE_BLOCK_TYPE, parseInlineMarkdown(trimmedLine.slice(MARKDOWN_BLOCKQUOTE_PREFIX.length))));
        continue;
      }

      if (trimmedLine.startsWith(MARKDOWN_BULLET_PREFIX)) {
        blocks.push(createBlock(NOTION_BULLETED_LIST_ITEM_BLOCK_TYPE, parseInlineMarkdown(trimmedLine.slice(MARKDOWN_BULLET_PREFIX.length))));
        continue;
      }

      if (trimmedLine.startsWith(MARKDOWN_ALT_BULLET_PREFIX)) {
        blocks.push(createBlock(NOTION_BULLETED_LIST_ITEM_BLOCK_TYPE, parseInlineMarkdown(trimmedLine.slice(MARKDOWN_ALT_BULLET_PREFIX.length))));
        continue;
      }

      if (MARKDOWN_NUMBERED_LIST_REGEX.test(trimmedLine)) {
        const content = trimmedLine.replace(MARKDOWN_NUMBERED_LIST_REGEX, "");
        blocks.push(createBlock(NOTION_NUMBERED_LIST_ITEM_BLOCK_TYPE, parseInlineMarkdown(content)));
        continue;
      }

      if (trimmedLine.startsWith(HTTP_PREFIX) || trimmedLine.startsWith(HTTPS_PREFIX)) {
        blocks.push({
          object: "block",
          type: NOTION_BOOKMARK_BLOCK_TYPE,
          [NOTION_BOOKMARK_BLOCK_TYPE]: {
            url: trimmedLine,
            caption: [],
          },
        });
        continue;
      }

      if (trimmedLine.startsWith("[[") && trimmedLine.endsWith("]]")) {
        const title = trimmedLine.slice(2, -2).trim();
        blocks.push({
          object: "block",
          type: NOTION_CHILD_PAGE_BLOCK_TYPE,
          [NOTION_CHILD_PAGE_BLOCK_TYPE]: {
            title,
          },
        });
        continue;
      }

      blocks.push(createBlock(NOTION_PARAGRAPH_BLOCK_TYPE, parseInlineMarkdown(trimmedLine)));
    }

    const limitedBlocks = blocks.slice(0, NOTION_MAX_BLOCKS_PER_REQUEST * 10);
    return {
      data: limitedBlocks,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `${"NotionShareConvert"}: ${String(error)}`,
    };
  }
}
