/**
 * 预览系统常量定义
 */

// 支持的文件类型
export const SUPPORTED_FILE_TYPES = {
  EXCEL: ["xlsx", "xls"],
  WORD: ["docx", "doc"],
  PDF: ["pdf"],
  PPT: ["pptx", "ppt"],
  EPUB: ["epub"],
  TXT: ["txt", "text", "log", "md"],
};

// 文件图标映射
export const FILE_ICONS = {
  xlsx: "/plugins/siyuan-tools/asset/excel.svg",
  xls: "/plugins/siyuan-tools/asset/excel.svg",
  docx: "/plugins/siyuan-tools/asset/word.svg",
  doc: "/plugins/siyuan-tools/asset/word.svg",
  pdf: "/plugins/siyuan-tools/asset/pdf.svg",
  pptx: "/plugins/siyuan-tools/asset/powerpoint.svg",
  ppt: "/plugins/siyuan-tools/asset/powerpoint.svg",
  epub: "/plugins/siyuan-tools/asset/file.svg", // 使用通用文件图标，可以后续添加专门的epub图标
  txt: "/plugins/siyuan-tools/asset/file.svg",
  text: "/plugins/siyuan-tools/asset/file.svg",
  log: "/plugins/siyuan-tools/asset/file.svg",
  md: "/plugins/siyuan-tools/asset/file.svg",
};

// 默认图标
export const DEFAULT_FILE_ICON = "../asset/file.svg";

// 预览器类型
export const PREVIEWER_TYPES = {
  EXCEL: "excel",
  WORD: "word",
  PDF: "pdf",
  PPT: "ppt",
  EPUB: "epub",
  TXT: "txt",
};

// 错误消息
export const ERROR_MESSAGES = {
  UNSUPPORTED_TYPE: (extension) =>
    `不支持的文件类型: .${extension}。支持的类型：Excel(.xlsx/.xls)、Word(.docx/.doc)、PDF(.pdf)、PPT(.pptx/.ppt)、EPUB(.epub)、TXT(.txt/.text/.log/.md)`,
  LOAD_FAILED: (path, error) => `加载文件失败: ${path}. 错误: ${error}`,
  PREVIEW_FAILED: (type, error) => `${type} 预览失败: ${error}`,
  INIT_FAILED: (type, error) => `初始化 ${type} 预览器失败: ${error}`,
  NO_FILE_PATH: "未指定文件路径<br>请使用 ?url=文件路径 参数",
};

// 加载消息
export const LOADING_MESSAGES = {
  EXCEL: "正在加载 Excel 文件...",
  WORD: "正在加载 Word 文件...",
  PDF: "正在加载 PDF 文件...",
  PPT: "正在加载 PPT 文件...",
  EPUB: "正在加载 EPUB 文件...",
};

// CSS 选择器
export const SELECTORS = {
  VIEWER_CONTAINER: "#viewerContainer",
  FILE_HEADER: "#fileHeader",
  FILE_HEADER_ICON: "#fileHeaderIcon",
  FILE_HEADER_TITLE: "#fileHeaderTitle",
  DOWNLOAD_ACTION: "#downloadAction",
  EXCEL_CONTAINER: "#excel-preview-container",
  DOCX_CONTAINER: "#docx-preview-container",
  PDF_CONTAINER: "#pdf-preview-container",
  PPT_CONTAINER: "#ppt-preview-container",
  EPUB_CONTAINER: "#epub-preview-container",
  TXT_CONTAINER: "#txt-preview-container",
};

// 容器ID
export const CONTAINER_IDS = {
  EXCEL: "excel-preview-container",
  DOCX: "docx-preview-container",
  PDF: "pdf-preview-container",
  PPT: "ppt-preview-container",
  EPUB: "epub-preview-container",
  TXT: "txt-preview-container",
};
