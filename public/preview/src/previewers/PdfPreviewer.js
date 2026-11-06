/**
 * PDF预览器
 * 使用vue-office库预览PDF文件
 */

import { BasePreviewer } from "../core/BasePreviewer.js";
import {
  CONTAINER_IDS,
  LOADING_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/Constants.js";

/**
 * PDF预览器类
 */
export class PdfPreviewer extends BasePreviewer {
  constructor(container, options = {}) {
    super(container, options);
    this.previewerType = "pdf";
    this.defaultOptions = {
      onError: (error) => {
        console.error("PDF预览错误:", error);
        this.showError(
          ERROR_MESSAGES.PREVIEW_FAILED("PDF", error.message || "未知错误")
        );
      },
      onRendered: () => {
        console.log("PDF预览完成");
      },
    };
  }

  /**
   * 初始化PDF预览器
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.warn("PDF预览器已经初始化");
        return;
      }

      // 检查vue-office库是否可用
      if (typeof jsPreviewPdf === "undefined") {
        throw new Error("vue-office PDF库未加载");
      }

      this.isInitialized = true;
      console.log("PDF预览器初始化成功");
    } catch (error) {
      console.error("PDF预览器初始化失败:", error);
      throw error;
    }
  }

  /**
   * 预览PDF文件
   * @param {ArrayBuffer} data 文件数据（必须是ArrayBuffer）
   * @returns {Promise<void>}
   */
  async preview(data) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.isLoading) {
        console.warn("PDF预览器正在加载中");
        return;
      }

      // 验证数据类型
      if (!(data instanceof ArrayBuffer)) {
        throw new Error("PDF预览器需要ArrayBuffer类型的数据");
      }

      this.isLoading = true;
      this.showLoading(LOADING_MESSAGES.PDF);

      // 销毁之前的实例
      await this.destroy();

      // 创建预览容器
      const pdfContainer = this.createContainer(CONTAINER_IDS.PDF);

      // 合并选项
      const mergedOptions = { ...this.defaultOptions, ...this.options };

      // 初始化vue-office PDF预览器
      this.instance = jsPreviewPdf.init(pdfContainer, mergedOptions);
      console.log("PDF预览器实例创建成功");

      // 预览PDF文件
      this.instance.preview(data);
      console.log("PDF预览完成");

      this.isLoading = false;
    } catch (error) {
      console.error("PDF预览失败:", error);
      this.showError(ERROR_MESSAGES.PREVIEW_FAILED("PDF", error.message));
      this.isLoading = false;
      throw error;
    }
  }

  /**
   * 销毁PDF预览器
   * @returns {Promise<void>}
   */
  async destroy() {
    try {
      // 销毁vue-office实例
      if (this.instance) {
        if (typeof this.instance.destroy === "function") {
          this.instance.destroy();
        }
        this.instance = null;
      }

      // 清空容器
      const pdfContainer = document.getElementById(CONTAINER_IDS.PDF);
      if (pdfContainer) {
        pdfContainer.innerHTML = "";
      }

      // 调用基类销毁方法
      await super.destroy();
    } catch (error) {
      console.warn("销毁PDF预览器时出错:", error);
    }
  }

  /**
   * 获取预览器信息
   * @returns {Object} 预览器信息
   */
  getInfo() {
    return {
      type: this.previewerType,
      name: "PDF预览器",
      library: "vue-office",
      supportedFormats: ["pdf"],
      version: "1.0.0",
    };
  }

  /**
   * 检查文件是否支持
   * @param {string} extension 文件扩展名
   * @returns {boolean}
   */
  static isSupported(extension) {
    return ["pdf"].includes(extension.toLowerCase());
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式数组
   */
  static getSupportedFormats() {
    return ["pdf"];
  }

  /**
   * 验证文件数据
   * @param {ArrayBuffer} data 文件数据
   * @returns {boolean}
   */
  validateData(data) {
    if (!data) {
      return false;
    }

    // PDF预览器只支持ArrayBuffer
    return data instanceof ArrayBuffer;
  }

  /**
   * 获取预览器状态
   * @returns {Object} 状态对象
   */
  getStatus() {
    return {
      ...super.getStatus(),
      previewerType: this.previewerType,
      hasVueOffice: typeof jsPreviewPdf !== "undefined",
    };
  }

  /**
   * 设置预览选项
   * @param {Object} options 预览选项
   */
  setOptions(options = {}) {
    this.options = { ...this.options, ...options };

    // 如果已经初始化，可以应用新选项
    if (this.isInitialized && this.instance) {
      // 根据vue-office PDF库的API设置选项
      // 这里可以根据实际需要扩展
    }
  }

  /**
   * 跳转到指定页面
   * @param {number} pageNum 页码
   */
  goToPage(pageNum) {
    try {
      if (this.instance && typeof this.instance.goToPage === "function") {
        this.instance.goToPage(pageNum);
      }
    } catch (error) {
      console.warn("跳转页面失败:", error);
    }
  }

  /**
   * 获取当前页码
   * @returns {number} 当前页码
   */
  getCurrentPage() {
    try {
      if (this.instance && typeof this.instance.getCurrentPage === "function") {
        return this.instance.getCurrentPage();
      }
      return 1;
    } catch (error) {
      console.warn("获取当前页码失败:", error);
      return 1;
    }
  }

  /**
   * 获取总页数
   * @returns {number} 总页数
   */
  getTotalPages() {
    try {
      if (this.instance && typeof this.instance.getTotalPages === "function") {
        return this.instance.getTotalPages();
      }
      return 0;
    } catch (error) {
      console.warn("获取总页数失败:", error);
      return 0;
    }
  }

  /**
   * 缩放PDF
   * @param {number} scale 缩放比例
   */
  setScale(scale) {
    try {
      if (this.instance && typeof this.instance.setScale === "function") {
        this.instance.setScale(scale);
      }
    } catch (error) {
      console.warn("设置缩放失败:", error);
    }
  }
}

// 导出预览器类和工厂函数
export default PdfPreviewer;

/**
 * 创建PDF预览器实例
 * @param {HTMLElement} container 容器元素
 * @param {Object} options 选项
 * @returns {PdfPreviewer} PDF预览器实例
 */
export function createPdfPreviewer(container, options = {}) {
  return new PdfPreviewer(container, options);
}
