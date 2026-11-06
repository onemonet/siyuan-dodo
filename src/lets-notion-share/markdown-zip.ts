import JSZip from "jszip";

export interface ZipAsset {
  marker: string;
  path: string;
  name: string;
  mime: string;
  blob: Blob;
  kind: "image" | "video" | "audio" | "file";
}
export interface EmbeddedFrame { marker: string; url: string; kind: "embed" }
export interface PreparedMarkdownZip {
  markdown: string;
  assets: ZipAsset[];
  embeds?: EmbeddedFrame[];
}
const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4",
  m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
  webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v", ogv: "video/ogg", mpg: "video/mpeg",
};

function normalizedPath(raw: string): string {
  let path = raw.split(/[?#]/, 1)[0].replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
  try { path = decodeURIComponent(path); } catch { /* retain original */ }
  if (!path.startsWith("assets/") || path.split("/").some(segment => segment === "..")) return "";
  return path;
}
function fileName(path: string): string {
  return path.split("/").pop() || "asset";
}
function assetType(path: string): { mime: string; kind: "image" | "video" | "audio" | "file" } {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  return { mime, kind: mime.startsWith("image/") ? "image" :
    mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "file" };
}

/** 将本地资源引用替换成独立的段落锚点，后续按位置插入 Notion 原生文件块。 */
export function extractAssetRefs(markdown: string): {
  markdown: string;
  refs: Array<{ marker: string; path: string; kind: "image" | "video" | "audio" | "file" }>;
  embeds: EmbeddedFrame[];
} {
  const refs: Array<{ marker: string; path: string; kind: "image" | "video" | "audio" | "file" }> = [];
  const embeds: EmbeddedFrame[] = [];
  const createMarker = (): string => {
    const index = refs.length + embeds.length + 1;
    return `DODO_ASSET_MARKER_${index}_${(index + 70).toString(36).toUpperCase()}_END`;
  };
  let inFence = false;
  const result = markdown.split(/\r?\n/).map(line => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    // Markdown 图片或独立附件链接；不处理外网 URL 与普通内部笔记链接。
    const assetPattern = /(!?)\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g;
    let text = line.replace(assetPattern, (full, bang: string, _label: string, angle: string, raw: string) => {
      const path = normalizedPath(angle || raw);
      if (!path) return full;
      const type = assetType(path);
      if (!bang && type.kind === "image") return full;
      if (!bang && !/^\s*\[/.test(line)) return full;
      const marker = createMarker();
      refs.push({ marker, path, kind: type.kind });
      return `\n\n${marker}\n\n`;
    });
    // 思源导出也可能使用 HTML img 标签。
    text = text.replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?\s*>/gi, (full, raw: string) => {
      const path = normalizedPath(raw);
      if (!path) return full;
      const marker = createMarker();
      refs.push({ marker, path, kind: "image" });
      return `\n\n${marker}\n\n`;
    });
    // 思源 ZIP 将视频和音频作为 HTML 标签输出；使用 src 而不是历史 data-src。
    text = text.replace(/<(video|audio)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/gi,
      (full, tag: string, opening: string, inner: string = "") => {
        const srcAttr = (attrs: string) => attrs.match(/(?:^|\s)src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
        const source = inner.match(/<source\b([^>]*)\/?\s*>/i);
        const direct = srcAttr(opening);
        const fallback = source ? srcAttr(source[1]) : null;
        const path = normalizedPath(direct?.[1] || direct?.[2] || direct?.[3] ||
          fallback?.[1] || fallback?.[2] || fallback?.[3] || "");
        if (!path) return full;
        const marker = createMarker();
        refs.push({ marker, path, kind: tag.toLowerCase() === "video" ? "video" : "audio" });
        return `\n\n${marker}\n\n`;
      });
    // 网页端 ZIP 导入会将可嵌入的 iframe 转为 Notion embed；用原生 embed 块保留外链播放器。
    text = text.replace(/<iframe\b([^>]*?)(?:\/>|>[\s\S]*?<\/iframe\s*>)/gi,
      (full, attrs: string) => {
        const src = attrs.match(/(?:^|\s)src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
        let url = src?.[1] || src?.[2] || src?.[3] || "";
        url = url.replace(/&amp;/gi, "&");
        if (url.startsWith("//")) url = `https:${url}`;
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return full;
          if (/^(?:localhost|127\.0\.0\.1)$/i.test(parsed.hostname)) return full;
        } catch { return full; }
        const marker = createMarker();
        embeds.push({ marker, url, kind: "embed" });
        return `\n\n${marker}\n\n`;
      });
    // 对齐手工 ZIP 导入：Notion 原生 Markdown 使用 span 属性表达下划线，kbd/sup/sub 不应作为字面 HTML 出现。
    text = text.replace(/<u>(.*?)<\/u>/gi, '<span underline="true">$1</span>');
    text = text.replace(/<\/?(?:kbd|sup|sub)>/gi, "");
    return text;
  }).join("\n");
  return { markdown: result, refs, embeds };
}

/** 使用思源原生导出器：导出文档及所有图片，而非从编辑器 DOM 猜测内容。 */
export async function exportDocumentMarkdownZip(docId: string): Promise<PreparedMarkdownZip> {
  if (!/^\d{14}-[a-z0-9]{7}$/.test(docId)) throw new Error("思源文档 ID 无效。");
  const response = await fetch("/api/export/exportMd", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: docId, includeSubDocs: false, markdownYFM: false }),
  });
  if (!response.ok) throw new Error(`思源 Markdown ZIP 导出失败：HTTP ${response.status}`);
  const result = await response.json() as { code: number; msg?: string; data?: { zip?: string } };
  if (result.code !== 0 || !result.data?.zip?.startsWith("/export/")) {
    throw new Error(result.msg || "思源未返回有效的 Markdown 导出 ZIP 地址。");
  }
  const downloaded = await fetch(result.data.zip);
  if (!downloaded.ok) throw new Error(`无法下载思源导出的 ZIP：HTTP ${downloaded.status}`);
  const zipBlob = await downloaded.blob();
  if (zipBlob.size > 200 * 1024 * 1024) throw new Error("Markdown ZIP 超过 200MB，请精简文档后重试。");
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const entries = Object.values(zip.files).filter(file => !file.dir);
  if (entries.length > 500) throw new Error("文档 ZIP 包含过多文件，已停止同步。");
  const mdFiles = entries.filter(file => /\.md$/i.test(file.name));
  if (mdFiles.length !== 1) throw new Error(`预期单文档 Markdown，实际 ZIP 中存在 ${mdFiles.length} 个 Markdown 文件。`);
  const mdFile = mdFiles[0];
  const raw = await mdFile.async("string");
  const { markdown, refs, embeds } = extractAssetRefs(raw);
  const lookup = new Map(entries.map(file => [file.name.replace(/\\/g, "/"), file]));
  const assets: ZipAsset[] = [];
  const cache = new Map<string, Blob>();
  for (const ref of refs) {
    const entry = lookup.get(ref.path) || lookup.get(`${mdFile.name.split("/").slice(0, -1).join("/")}/${ref.path}`.replace(/^\//, ""));
    if (!entry) throw new Error(`ZIP 中缺少正文引用的附件：${ref.path}，已取消同步以防丢图。`);
    let blob = cache.get(ref.path);
    const { mime, kind } = assetType(ref.path);
    if (!blob) {
      const bytes = await entry.async("uint8array");
      if (bytes.byteLength > 200 * 1024 * 1024) throw new Error(`单个媒体文件超过 200MB，暂不支持自动上传：${ref.path}`);
      blob = new Blob([bytes as BlobPart], { type: mime });
      cache.set(ref.path, blob);
    }
    assets.push({ ...ref, name: fileName(ref.path), mime, kind, blob });
  }
  return { markdown, assets, embeds };
}
