import TurndownService from "turndown";
import type { FlomoFile } from "../types";
import { resolveAttachmentFileName } from "./fileName";
import { fixListHierarchy } from "./markdownList";

const FLOMO_ASSETS_DIR = "assets/flomo";
const AUDIO_FILE_REGEX = /\.(mp3|m4a|aac|wav|ogg|flac|webm)$/i;

function createTurndownService(): TurndownService {
  const turndownService = new TurndownService();
  turndownService.addRule("audio", {
    filter: "audio",
    replacement: (_content, node) => {
      if (!(node instanceof Element)) {
        return "";
      }

      const src = node.getAttribute("src");
      const dataSrc = node.getAttribute("data-src");
      const controls = node.getAttribute("controls");
      return `<audio controls="${controls}" src="${src}" data-src="${dataSrc}"></audio>`;
    },
  });

  return turndownService;
}

function buildAttachmentPath(file: FlomoFile): string {
  const fileName = resolveAttachmentFileName(file);
  return `${FLOMO_ASSETS_DIR}/${file.id}_${fileName}`;
}

function buildAttachmentMarkdown(file: FlomoFile): string {
  const fileName = resolveAttachmentFileName(file);
  const filePath = buildAttachmentPath(file);
  if (AUDIO_FILE_REGEX.test(fileName)) {
    return `<audio controls="controls" src="${filePath}" data-src="${filePath}"></audio> `;
  }

  return `![${fileName}](${filePath}) `;
}

function appendAttachmentMarkdown(content: string, files: FlomoFile[]): string {
  const attachmentMarkdown = files.map(buildAttachmentMarkdown).join("");
  return `${content}${attachmentMarkdown}`.trim();
}

function normalizeMarkdownEscapes(content: string): string {
  return content
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/\\_/g, "_")
    .replace(/(?<=#)(.+?)(?=\s)/g, "$1#");
}

export function buildMemoMarkdownContent(
  content: string,
  files: FlomoFile[],
): string {
  const contentWithAttachments = appendAttachmentMarkdown(content, files);
  const markdown = createTurndownService().turndown(contentWithAttachments);
  return fixListHierarchy(normalizeMarkdownEscapes(markdown));
}
