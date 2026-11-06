import type { PreparedMarkdownZip } from "./markdown-zip";

export interface SyncedAsset {
  marker: string;
  path: string;
  kind: string;
  digest: string;
  uploadId: string;
  blockId: string;
  parentId: string;
}
export interface SyncedEmbed {
  marker: string;
  url: string;
  blockId: string;
  parentId: string;
}
export interface NotionSyncManifest {
  version: 2;
  pageId: string;
  title: string;
  sourceMarkdown: string;
  assets: SyncedAsset[];
  embeds: SyncedEmbed[];
}
export type SyncDecision =
  | { mode: "noop"; changedAssets: number[]; changedEmbeds: number[] }
  | { mode: "delta"; changedAssets: number[]; changedEmbeds: number[]; textUpdate: { old_str: string; new_str: string } | null }
  | { mode: "full"; reason: string };

export async function sha256(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(bytes, v => v.toString(16).padStart(2, "0")).join("");
}

/** Only replace one uniquely identifiable contiguous source segment. Never select code, table, asset marker, or headings. */
export function safeTextEdit(oldMd: string, nextMd: string): { old_str: string; new_str: string } | null {
  if (oldMd === nextMd) return null;
  const oldLines = oldMd.split("\n"), newLines = nextMd.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]) suffix++;
  const oldText = oldLines.slice(prefix, oldLines.length - suffix).join("\n").trim();
  const newText = newLines.slice(prefix, newLines.length - suffix).join("\n").trim();
  if (!oldText || !newText || oldText.length > 1500 || newText.length > 1500) return null;
  const structural = /DODO_ASSET_MARKER_|^\s*(?:#{1,6}\s|[-+*]\s|\d+\.\s|\||>|```|~~~|\$\$|<table|<iframe)/m;
  if (structural.test(oldText) || structural.test(newText) || oldText.includes("\n\n") || newText.includes("\n\n")) return null;
  const fenceCount = oldMd.slice(0, oldMd.indexOf(oldText)).match(/^\s*(```|~~~)/gm)?.length || 0;
  if (fenceCount % 2) return null;
  if (oldMd.split(oldText).length !== 2) return null;
  // Require surrounding lines to be unchanged, so this is an edit, not reordering.
  return { old_str: oldText, new_str: newText };
}

export function planIncremental(previous: NotionSyncManifest | null, next: PreparedMarkdownZip, title: string, digests: string[]): SyncDecision {
  if (!previous || previous.version !== 2) return { mode: "full", reason: "首次建立增量索引" };
  if (previous.assets.length !== next.assets.length || previous.embeds.length !== (next.embeds || []).length) {
    return { mode: "full", reason: "资源数量发生变化，需要重新定位媒体块" };
  }
  for (let i = 0; i < next.assets.length; i++) {
    const a = next.assets[i], b = previous.assets[i];
    if (a.marker !== b.marker || a.path !== b.path || a.kind !== b.kind || !b.blockId || !b.parentId) {
      return { mode: "full", reason: "资源路径或顺序发生变化" };
    }
  }
  const embeds = next.embeds || [];
  for (let i = 0; i < embeds.length; i++) {
    if (embeds[i].marker !== previous.embeds[i].marker || !previous.embeds[i].blockId) {
      return { mode: "full", reason: "嵌入内容的顺序发生变化" };
    }
  }
  const changedAssets = next.assets.map((_, i) => i).filter(i => digests[i] !== previous.assets[i].digest);
  const changedEmbeds = embeds.map((_, i) => i).filter(i => embeds[i].url !== previous.embeds[i].url);
  const textUpdate = previous.sourceMarkdown === next.markdown ? null : safeTextEdit(previous.sourceMarkdown, next.markdown);
  if (previous.sourceMarkdown !== next.markdown && !textUpdate) {
    return { mode: "full", reason: "正文结构变化，无法安全执行单点 Markdown 替换" };
  }
  if (!changedAssets.length && !changedEmbeds.length && !textUpdate && title === previous.title) {
    return { mode: "noop", changedAssets, changedEmbeds };
  }
  return { mode: "delta", changedAssets, changedEmbeds, textUpdate };
}

export function parseManifest(value: string, pageId: string): NotionSyncManifest | null {
  if (!value || value.length > 250_000) return null;
  try {
    const data = JSON.parse(value);
    if (data?.version !== 2 || data.pageId !== pageId || typeof data.sourceMarkdown !== "string" ||
      typeof data.title !== "string" || !Array.isArray(data.assets) || !Array.isArray(data.embeds)) return null;
    return data as NotionSyncManifest;
  } catch { return null; }
}
