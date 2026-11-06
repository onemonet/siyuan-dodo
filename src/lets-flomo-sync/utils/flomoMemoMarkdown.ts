import { FLOMO_DEFAULT_TIME_FORMAT } from "../../config/constants";
import type { FlomoFile, FlomoMemo, ProcessedMemo } from "../types";
import { buildMemoMarkdownContent } from "./markdownContent";
import { applyTemplate } from "./markdownTemplate";
import { formatDate, formatTime, parseFlomoTime } from "./time";

export interface ProcessMarkdownResult {
  processedMemos: ProcessedMemo[];
  imgs: FlomoFile[];
}

function buildMemoTags(tags: string[] | undefined): string {
  return tags && tags.length > 0 ? `#${tags.join(" #")}` : "";
}

function toProcessedMemo(
  memo: FlomoMemo,
  contentTemplate: string,
  timeFormat: string,
): ProcessedMemo | null {
  const parsedTime = parseFlomoTime(memo.updated_at);
  if (!parsedTime || !parsedTime.isValid()) {
    return null;
  }

  const files = memo.files || [];
  const content = buildMemoMarkdownContent(memo.content, files);
  const time = formatTime(parsedTime, timeFormat);
  const updatedDate = formatDate(parsedTime);
  const tags = buildMemoTags(memo.tags);

  return {
    content: applyTemplate(content, time, tags, contentTemplate),
    time,
    updatedDate,
    updatedAt: parsedTime.valueOf(),
    originalMemo: memo,
  };
}

export function processMarkdown(
  memos: FlomoMemo[],
  contentTemplate: string,
  timeFormat: string = FLOMO_DEFAULT_TIME_FORMAT,
): ProcessMarkdownResult {
  const processedMemos: ProcessedMemo[] = [];
  const imgs: FlomoFile[] = [];

  memos.forEach((memo) => {
    const files = memo.files || [];
    imgs.push(...files);

    const processedMemo = toProcessedMemo(memo, contentTemplate, timeFormat);
    if (processedMemo) {
      processedMemos.push(processedMemo);
    }
  });

  return { processedMemos, imgs };
}
