/**
 * Word预览器
 * 使用vue-office库预览Word文档
 */

import { BasePreviewer } from "../core/BasePreviewer.js";
import {
  CONTAINER_IDS,
  LOADING_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/Constants.js";

/**
 * Word预览器类
 */
export class WordPreviewer extends BasePreviewer {
  constructor(container, options = {}) {
    super(container, options);
    this.previewerType = "word";
  }

  /**
   * 初始化Word预览器
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.warn("Word预览器已经初始化");
        return;
      }

      // 检查vue-office库是否可用
      if (typeof jsPreviewDocx === "undefined") {
        throw new Error("vue-office Word库未加载");
      }

      this.isInitialized = true;
      console.log("Word预览器初始化成功");
    } catch (error) {
      console.error("Word预览器初始化失败:", error);
      throw error;
    }
  }

  /**
   * 预览Word文档
   * @param {ArrayBuffer} data 文件数据（必须是ArrayBuffer）
   * @returns {Promise<void>}
   */
  async preview(data) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.isLoading) {
        console.warn("Word预览器正在加载中");
        return;
      }

      // 验证数据类型
      if (!(data instanceof ArrayBuffer)) {
        throw new Error("Word预览器需要ArrayBuffer类型的数据");
      }

      this.isLoading = true;
      this.showLoading(LOADING_MESSAGES.WORD);

      // 销毁之前的实例
      await this.destroy();

      // 创建预览容器
      const docxContainer = this.createContainer(CONTAINER_IDS.DOCX);

      // 初始化vue-office Word预览器
      this.instance = jsPreviewDocx.init(docxContainer);
      console.log("Word预览器实例创建成功");

      // 预览Word文档
      await this.instance.preview(data);
      console.log("Word预览完成");

      this.isLoading = false;
    } catch (error) {
      console.error("Word预览失败:", error);
      this.showError(ERROR_MESSAGES.PREVIEW_FAILED("Word", error.message));
      this.isLoading = false;
      throw error;
    }
  }

  /**
   * 销毁Word预览器
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
      const docxContainer = document.getElementById(CONTAINER_IDS.DOCX);
      if (docxContainer) {
        docxContainer.innerHTML = "";
      }

      // 调用基类销毁方法
      await super.destroy();
    } catch (error) {
      console.warn("销毁Word预览器时出错:", error);
    }
  }

  /**
   * 获取预览器信息
   * @returns {Object} 预览器信息
   */
  getInfo() {
    return {
      type: this.previewerType,
      name: "Word预览器",
      library: "vue-office",
      supportedFormats: ["docx", "doc"],
      version: "1.0.0",
    };
  }

  /**
   * 检查文件是否支持
   * @param {string} extension 文件扩展名
   * @returns {boolean}
   */
  static isSupported(extension) {
    return ["docx", "doc"].includes(extension.toLowerCase());
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式数组
   */
  static getSupportedFormats() {
    return ["docx", "doc"];
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

    // Word预览器只支持ArrayBuffer
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
      hasVueOffice: typeof jsPreviewDocx !== "undefined",
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
      // 根据vue-office Word库的API设置选项
      // 这里可以根据实际需要扩展
    }
  }

  /**
   * 获取文档信息
   * @returns {Promise<Object>} 文档信息
   */
  async getDocumentInfo() {
    try {
      if (!this.instance) {
        throw new Error("预览器未初始化");
      }

      // 这里可以调用vue-office Word库的API获取文档信息
      // 具体实现取决于库的API
      return {
        pages: 0,
        title: "",
        author: "",
        created: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("获取文档信息失败:", error);
      return null;
    }
  }
}

// 导出预览器类和工厂函数
export default WordPreviewer;

/**
 * 创建Word预览器实例
 * @param {HTMLElement} container 容器元素
 * @param {Object} options 选项
 * @returns {WordPreviewer} Word预览器实例
 */
export function createWordPreviewer(container, options = {}) {
  return new WordPreviewer(container, options);
}
