/**
 * 预览器工厂类
 * 负责创建和管理不同类型的预览器实例
 */

import {
  SUPPORTED_FILE_TYPES,
  PREVIEWER_TYPES,
  ERROR_MESSAGES,
} from "../utils/Constants.js";
import { getFileExtension } from "../utils/Helpers.js";

// 导入所有预览器类
import { ExcelPreviewer } from "../previewers/ExcelPreviewer.js";
import { WordPreviewer } from "../previewers/WordPreviewer.js";
import { PdfPreviewer } from "../previewers/PdfPreviewer.js";
import { PptPreviewer } from "../previewers/PptPreviewer.js";
import { EpubPreviewer } from "../previewers/EpubPreviewer.js";
import { TxtPreviewer } from "../previewers/TxtPreviewer.js";

/**
 * 预览器工厂类
 */
export class PreviewerFactory {
  constructor() {
    this.previewerClasses = new Map();
    this.previewerInstances = new Map();
    this.registerDefaultPreviewers();
  }

  /**
   * 注册默认预览器
   */
  registerDefaultPreviewers() {
    this.registerPreviewer(PREVIEWER_TYPES.EXCEL, ExcelPreviewer);
    this.registerPreviewer(PREVIEWER_TYPES.WORD, WordPreviewer);
    this.registerPreviewer(PREVIEWER_TYPES.PDF, PdfPreviewer);
    this.registerPreviewer(PREVIEWER_TYPES.PPT, PptPreviewer);
    this.registerPreviewer(PREVIEWER_TYPES.EPUB, EpubPreviewer);
    this.registerPreviewer(PREVIEWER_TYPES.TXT, TxtPreviewer);
  }

  /**
   * 注册预览器类
   * @param {string} type 预览器类型
   * @param {Class} PreviewerClass 预览器类
   */
  registerPreviewer(type, PreviewerClass) {
    if (!type || !PreviewerClass) {
      throw new Error("预览器类型和类不能为空");
    }

    this.previewerClasses.set(type, PreviewerClass);
    console.log(`注册预览器: ${type}`);
  }

  /**
   * 注销预览器类
   * @param {string} type 预览器类型
   */
  unregisterPreviewer(type) {
    if (this.previewerClasses.has(type)) {
      this.previewerClasses.delete(type);
      console.log(`注销预览器: ${type}`);
    }
  }

  /**
   * 根据文件扩展名获取预览器类型
   * @param {string} extension 文件扩展名
   * @returns {string|null} 预览器类型
   */
  getPreviewerTypeByExtension(extension) {
    const ext = extension.toLowerCase();

    for (const [type, extensions] of Object.entries(SUPPORTED_FILE_TYPES)) {
      if (extensions.includes(ext)) {
        return PREVIEWER_TYPES[type];
      }
    }

    return null;
  }

  /**
   * 根据文件路径获取预览器类型
   * @param {string} filePath 文件路径
   * @returns {string|null} 预览器类型
   */
  getPreviewerTypeByPath(filePath) {
    const extension = getFileExtension(filePath);
    return this.getPreviewerTypeByExtension(extension);
  }

  /**
   * 创建预览器实例
   * @param {string} type 预览器类型
   * @param {HTMLElement} container 容器元素
   * @param {Object} options 选项
   * @returns {BasePreviewer} 预览器实例
   */
  createPreviewer(type, container, options = {}) {
    if (!type) {
      throw new Error("预览器类型不能为空");
    }

    if (!container) {
      throw new Error("容器元素不能为空");
    }

    const PreviewerClass = this.previewerClasses.get(type);
    if (!PreviewerClass) {
      throw new Error(`不支持的预览器类型: ${type}`);
    }

    try {
      const previewer = new PreviewerClass(container, options);
      console.log(`创建预览器实例: ${type}`);
      return previewer;
    } catch (error) {
      console.error(`创建预览器实例失败: ${type}`, error);
      throw error;
    }
  }

  /**
   * 根据文件路径创建预览器实例
   * @param {string} filePath 文件路径
   * @param {HTMLElement} container 容器元素
   * @param {Object} options 选项
   * @returns {BasePreviewer} 预览器实例
   */
  createPreviewerByPath(filePath, container, options = {}) {
    const type = this.getPreviewerTypeByPath(filePath);
    if (!type) {
      const extension = getFileExtension(filePath);
      throw new Error(ERROR_MESSAGES.UNSUPPORTED_TYPE(extension));
    }

    return this.createPreviewer(type, container, options);
  }

  /**
   * 获取或创建预览器实例（单例模式）
   * @param {string} type 预览器类型
   * @param {HTMLElement} container 容器元素
   * @param {Object} options 选项
   * @returns {BasePreviewer} 预览器实例
   */
  getOrCreatePreviewer(type, container, options = {}) {
    const key = `${type}_${container.id || "default"}`;

    if (this.previewerInstances.has(key)) {
      const previewer = this.previewerInstances.get(key);

      // 检查容器是否仍然有效
      if (document.contains(container)) {
        return previewer;
      } else {
        // 容器已无效，清理实例
        this.destroyPreviewer(type, container);
      }
    }

    const previewer = this.createPreviewer(type, container, options);
    this.previewerInstances.set(key, previewer);
    return previewer;
  }

  /**
   * 销毁预览器实例
   * @param {string} type 预览器类型
   * @param {HTMLElement} container 容器元素
   */
  async destroyPreviewer(type, container) {
    const key = `${type}_${container.id || "default"}`;

    if (this.previewerInstances.has(key)) {
      const previewer = this.previewerInstances.get(key);
      try {
        await previewer.destroy();
      } catch (error) {
        console.warn("销毁预览器实例时出错:", error);
      }
      this.previewerInstances.delete(key);
    }
  }

  /**
   * 销毁所有预览器实例
   */
  async destroyAllPreviewers() {
    const destroyPromises = Array.from(this.previewerInstances.values()).map(
      async (previewer) => {
        try {
          await previewer.destroy();
        } catch (error) {
          console.warn("销毁预览器实例时出错:", error);
        }
      }
    );

    await Promise.allSettled(destroyPromises);
    this.previewerInstances.clear();
  }

  /**
   * 检查文件类型是否支持
   * @param {string} extension 文件扩展名
   * @returns {boolean}
   */
  isSupported(extension) {
    const type = this.getPreviewerTypeByExtension(extension);
    return type !== null && this.previewerClasses.has(type);
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式数组
   */
  getSupportedFormats() {
    const formats = [];
    for (const extensions of Object.values(SUPPORTED_FILE_TYPES)) {
      formats.push(...extensions);
    }
    return [...new Set(formats)];
  }

  /**
   * 获取已注册的预览器类型
   * @returns {string[]} 预览器类型数组
   */
  getRegisteredTypes() {
    return Array.from(this.previewerClasses.keys());
  }

  /**
   * 获取预览器信息
   * @param {string} type 预览器类型
   * @returns {Object|null} 预览器信息
   */
  getPreviewerInfo(type) {
    const PreviewerClass = this.previewerClasses.get(type);
    if (!PreviewerClass) {
      return null;
    }

    // 创建临时实例获取信息
    try {
      const tempContainer = document.createElement("div");
      const tempPreviewer = new PreviewerClass(tempContainer);
      const info = tempPreviewer.getInfo();
      tempPreviewer.destroy();
      return info;
    } catch (error) {
      console.warn("获取预览器信息失败:", error);
      return null;
    }
  }

  /**
   * 获取所有预览器信息
   * @returns {Object[]} 预览器信息数组
   */
  getAllPreviewerInfo() {
    const infos = [];
    for (const type of this.previewerClasses.keys()) {
      const info = this.getPreviewerInfo(type);
      if (info) {
        infos.push(info);
      }
    }
    return infos;
  }

  /**
   * 获取活跃的预览器实例数量
   * @returns {number}
   */
  getActiveInstanceCount() {
    return this.previewerInstances.size;
  }

  /**
   * 清理无效的预览器实例
   */
  cleanupInvalidInstances() {
    const invalidKeys = [];

    for (const [key, previewer] of this.previewerInstances) {
      if (!previewer.container || !document.contains(previewer.container)) {
        invalidKeys.push(key);
      }
    }

    for (const key of invalidKeys) {
      this.previewerInstances.delete(key);
    }

    if (invalidKeys.length > 0) {
      console.log(`清理了 ${invalidKeys.length} 个无效的预览器实例`);
    }
  }
}

// 创建单例实例
export const previewerFactory = new PreviewerFactory();

// 导出工厂类和单例实例
export default PreviewerFactory;
