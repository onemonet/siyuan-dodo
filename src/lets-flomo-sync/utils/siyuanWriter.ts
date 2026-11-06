import type { FlomoConfig, ProcessedMemo } from "../types";

export function shouldPrependMemos(config: FlomoConfig): boolean {
  return config.memosSort === "desc";
}

export function sortMemosForWriting(
  processedMemos: ProcessedMemo[],
): ProcessedMemo[] {
  return [...processedMemos].sort((a, b) => a.updatedAt - b.updatedAt);
}

export function groupMemosByUpdatedDate(
  processedMemos: ProcessedMemo[],
): Map<string, ProcessedMemo[]> {
  const groupedMemos = new Map<string, ProcessedMemo[]>();

  processedMemos.forEach((memo) => {
    const dateMemos = groupedMemos.get(memo.updatedDate) || [];
    dateMemos.push(memo);
    groupedMemos.set(memo.updatedDate, dateMemos);
  });

  return groupedMemos;
}

export function getLastMemoUpdatedDate(
  processedMemos: ProcessedMemo[],
): string {
  return processedMemos[processedMemos.length - 1]?.updatedDate || "";
}
