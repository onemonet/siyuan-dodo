const DEFAULT_FILE_NAME = "img";
const DEFAULT_IMAGE_EXTENSION = "png";
const SUPPORTED_FILE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "flac",
  "webm",
] as const;
const SUPPORTED_FILE_EXTENSION_REGEX = /\.(png|jpg|jpeg|gif|mp3|m4a|aac|wav|ogg|flac|webm)$/i;

export interface FileNameSource {
  name: string;
  url?: string;
}

export function resolveAttachmentFileName(file: FileNameSource): string {
  const fileName = resolveBaseFileName(file.name);

  if (hasSupportedExtension(fileName)) {
    return fileName;
  }

  const extension = resolveSupportedUrlExtension(file.url);
  return `${fileName}.${extension}`;
}

function resolveBaseFileName(fileName: string): string {
  if (!fileName) {
    return DEFAULT_FILE_NAME;
  }

  if (!fileName.startsWith("http")) {
    return fileName;
  }

  try {
    const url = new URL(fileName);
    return url.pathname.split("/").pop() || DEFAULT_FILE_NAME;
  } catch {
    return DEFAULT_FILE_NAME;
  }
}

function hasSupportedExtension(fileName: string): boolean {
  return SUPPORTED_FILE_EXTENSION_REGEX.test(fileName);
}

function resolveSupportedUrlExtension(url?: string): string {
  if (!url) {
    return DEFAULT_IMAGE_EXTENSION;
  }

  try {
    const urlObject = new URL(url);
    const extension = urlObject.pathname.split(".").pop()?.toLowerCase();
    return extension &&
      SUPPORTED_FILE_EXTENSIONS.includes(
        extension as (typeof SUPPORTED_FILE_EXTENSIONS)[number],
      )
      ? extension
      : DEFAULT_IMAGE_EXTENSION;
  } catch {
    return DEFAULT_IMAGE_EXTENSION;
  }
}
