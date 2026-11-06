/**
 * 预览系统主入口文件
 * 整合所有模块，提供统一的预览接口
 */

import { fileLoader } from "./core/FileLoader.js";
import { previewerFactory } from "./core/PreviewerFactory.js";
import { createFileHeader } from "./ui/FileHeader.js";
import { createViewerContainer } from "./ui/ViewerContainer.js";
import { createMessageDisplay } from "./ui/MessageDisplay.js";
import { isNetworkUrl, isAssetsPath, buildFullUrl } from "./utils/Helpers.js";
import { ERROR_MESSAGES } from "./utils/Constants.js";

/**
 * 预览系统主类
 */
export class PreviewSystem {
  constructor(options = {}) {
    this.options = {
      enableFileHeader: true,
      enableMessageDisplay: false, // 默认禁用消息显示
      autoCleanup: true,
      ...options,
    };

    this.isInitialized = false;
    this.currentPreviewer = null;
    this.currentFilePath = "";

    // UI组件
    this.fileHeader = null;
    this.viewerContainer = null;
    this.messageDisplay = null;
  }

  /**
   * 初始化预览系统
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.warn("预览系统已经初始化");
        return;
      }

      // 初始化UI组件
      await this.initializeUI();

      this.isInitialized = true;
      console.log("预览系统初始化成功");
    } catch (error) {
      console.error("预览系统初始化失败:", error);
      throw error;
    }
  }

  /**
   * 初始化UI组件
   */
  async initializeUI() {
    // 初始化文件头部
    if (this.options.enableFileHeader) {
      this.fileHeader = createFileHeader();
    }

    // 初始化预览容器
    this.viewerContainer = createViewerContainer();

    // 初始化消息显示
    if (this.options.enableMessageDisplay) {
      this.messageDisplay = createMessageDisplay();
    }
  }

  /**
   * 加载并预览文件
   * @param {string} filePath 文件路径
   */
  async loadFile(filePath) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!filePath) {
        throw new Error("文件路径不能为空");
      }

      console.log("开始加载文件:", filePath);

      // 显示加载状态
      this.showLoading("正在加载文件...");

      // 处理文件路径
      const processedPath = this.processFilePath(filePath);
      this.currentFilePath = processedPath;

      // 显示文件信息
      if (this.fileHeader) {
        this.fileHeader.showFileInfo(processedPath);
      }

      // 加载文件数据
      const fileData = await fileLoader.loadFile(processedPath);

      // 创建预览器
      await this.createPreviewer(processedPath);

      // 预览文件
      await this.previewFile(fileData.data);

      console.log("文件预览完成:", processedPath);
    } catch (error) {
      console.error("加载文件失败:", error);
      this.hideLoading(); // 确保出错时也隐藏加载消息
      this.handleError(error);
      throw error;
    }
  }

  /**
   * 处理文件路径
   * @param {string} filePath 原始文件路径
   * @returns {string} 处理后的文件路径
   */
  processFilePath(filePath) {
    // 如果是assets相对路径，转换为完整URL
    if (isAssetsPath(filePath)) {
      return buildFullUrl(filePath);
    }

    return filePath;
  }

  /**
   * 创建预览器
   * @param {string} filePath 文件路径
   */
  async createPreviewer(filePath) {
    // 销毁当前预览器
    await this.destroyCurrentPreviewer();

    // 创建新的预览器
    this.currentPreviewer = previewerFactory.createPreviewerByPath(
      filePath,
      this.viewerContainer.container
    );

    // 设置预览器到容器
    this.viewerContainer.setCurrentPreviewer(this.currentPreviewer);

    // 初始化预览器
    await this.currentPreviewer.initialize();
  }

  /**
   * 预览文件
   * @param {string|ArrayBuffer} data 文件数据
   */
  async previewFile(data) {
    if (!this.currentPreviewer) {
      throw new Error("预览器未创建");
    }

    try {
      await this.currentPreviewer.preview(data);

      // 预览完成后隐藏加载消息
      this.hideLoading();

      // 成功消息已禁用，保持界面简洁
    } catch (error) {
      throw error;
    }
  }

  /**
   * 隐藏加载状态
   */
  hideLoading() {
    // 清除消息显示中的加载消息
    if (this.messageDisplay) {
      this.messageDisplay.clearByType("loading");
    }

    // 预览容器的加载状态会在预览器创建新内容时自动清除
  }

  /**
   * 销毁当前预览器
   */
  async destroyCurrentPreviewer() {
    if (this.currentPreviewer) {
      try {
        await this.currentPreviewer.destroy();
      } catch (error) {
        console.warn("销毁预览器时出错:", error);
      }
      this.currentPreviewer = null;
    }
  }

  /**
   * 重置预览系统
   * @param {string} message 重置后显示的消息
   */
  reset(message = "") {
    // 销毁当前预览器
    this.destroyCurrentPreviewer();

    // 重置UI组件
    if (this.viewerContainer) {
      this.viewerContainer.reset(message);
    }

    if (this.fileHeader) {
      this.fileHeader.reset();
    }

    // 清除消息
    if (this.messageDisplay) {
      this.messageDisplay.clearAll();
    }

    this.currentFilePath = "";
  }

  /**
   * 显示加载状态
   * @param {string} message 加载消息
   */
  showLoading(message) {
    if (this.viewerContainer) {
      this.viewerContainer.showLoading(message);
    }

    // 消息显示已禁用，不在弹出层显示加载消息
  }

  /**
   * 显示错误信息
   * @param {Error|string} error 错误信息
   */
  showError(error) {
    const message = error instanceof Error ? error.message : error;

    if (this.viewerContainer) {
      this.viewerContainer.showError(message);
    }

    // 消息显示已禁用，不在弹出层显示错误消息
  }

  /**
   * 显示成功信息
   * @param {string} message 成功消息
   * @param {Object} options 选项
   */
  showSuccess(message, options = {}) {
    // 消息显示已禁用，不显示成功消息
  }

  /**
   * 处理错误
   * @param {Error} error 错误对象
   */
  handleError(error) {
    const message = error.message || "未知错误";
    this.showError(message);
  }

  /**
   * 从URL参数加载文件
   */
  loadFromUrlParam() {
    const urlParams = new URLSearchParams(window.location.search);
    let filePath = urlParams.get("url");

    if (filePath) {
      console.log("从URL参数加载文件:", filePath);
      this.loadFile(filePath);
    } else {
      this.reset(ERROR_MESSAGES.NO_FILE_PATH);
    }
  }

  /**
   * 获取系统状态
   * @returns {Object} 系统状态
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasCurrentPreviewer: !!this.currentPreviewer,
      currentFilePath: this.currentFilePath,
      previewerInfo: this.currentPreviewer
        ? this.currentPreviewer.getInfo()
        : null,
      viewerContainerStatus: this.viewerContainer
        ? this.viewerContainer.getStatus()
        : null,
      fileHeaderInfo: this.fileHeader
        ? this.fileHeader.getCurrentFileInfo()
        : null,
    };
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式
   */
  getSupportedFormats() {
    return previewerFactory.getSupportedFormats();
  }

  /**
   * 检查文件是否支持
   * @param {string} filePath 文件路径
   * @returns {boolean}
   */
  isFileSupported(filePath) {
    return previewerFactory.isSupported(
      filePath.split(".").pop().toLowerCase()
    );
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (!this.options.autoCleanup) {
      return;
    }

    // 销毁当前预览器
    await this.destroyCurrentPreviewer();

    // 清理文件加载器缓存
    fileLoader.clearCache();

    // 清理预览器工厂
    await previewerFactory.destroyAllPreviewers();

    // 销毁UI组件
    if (this.fileHeader) {
      this.fileHeader.destroy();
    }

    if (this.viewerContainer) {
      this.viewerContainer.destroy();
    }

    if (this.messageDisplay) {
      this.messageDisplay.destroy();
    }

    this.isInitialized = false;
    console.log("预览系统资源清理完成");
  }

  /**
   * 销毁预览系统
   */
  async destroy() {
    await this.cleanup();

    // 清理引用
    this.fileHeader = null;
    this.viewerContainer = null;
    this.messageDisplay = null;
    this.currentPreviewer = null;
    this.currentFilePath = "";
  }
}

// 创建全局预览系统实例
export const previewSystem = new PreviewSystem();

// 导出类和实例
export default PreviewSystem;

/**
 * 初始化预览系统
 * @param {Object} options 选项
 * @returns {PreviewSystem} 预览系统实例
 */
export function initializePreviewSystem(options = {}) {
  const system = new PreviewSystem(options);
  system.initialize();
  return system;
}

// 页面加载完成后自动初始化
document.addEventListener("DOMContentLoaded", () => {
  // 自动从URL参数加载文件
  previewSystem.loadFromUrlParam();
});

// 页面卸载时清理资源
window.addEventListener("beforeunload", () => {
  previewSystem.cleanup();
});
