/**
 * PPT预览器
 * 使用pptx-preview库预览PPT文件
 */

import { BasePreviewer } from "../core/BasePreviewer.js";
import {
  CONTAINER_IDS,
  LOADING_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/Constants.js";
import { throttle } from "../utils/Helpers.js";

/**
 * PPT预览器类
 */
export class PptPreviewer extends BasePreviewer {
  constructor(container, options = {}) {
    super(container, options);
    this.previewerType = "ppt";
    this.resizeHandler = null;
  }

  /**
   * 初始化PPT预览器
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.warn("PPT预览器已经初始化");
        return;
      }

      // 检查pptx-preview库是否可用
      if (typeof pptxPreview === "undefined") {
        throw new Error("pptx-preview库未加载");
      }

      this.isInitialized = true;
      console.log("PPT预览器初始化成功");
    } catch (error) {
      console.error("PPT预览器初始化失败:", error);
      throw error;
    }
  }

  /**
   * 预览PPT文件
   * @param {ArrayBuffer} data 文件数据（必须是ArrayBuffer）
   * @returns {Promise<void>}
   */
  async preview(data) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.isLoading) {
        console.warn("PPT预览器正在加载中");
        return;
      }

      // 验证数据类型
      if (!(data instanceof ArrayBuffer)) {
        throw new Error("PPT预览器需要ArrayBuffer类型的数据");
      }

      this.isLoading = true;
      this.showLoading(LOADING_MESSAGES.PPT);

      // 销毁之前的实例
      await this.destroy();

      // 创建预览容器
      const pptContainer = this.createContainer(CONTAINER_IDS.PPT, {
        overflow: "hidden",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });

      // 获取容器尺寸
      const containerWidth = this.container.offsetWidth;
      const containerHeight = this.container.offsetHeight;

      // 初始化pptx-preview预览器
      this.instance = pptxPreview.init(pptContainer, {
        width: containerWidth,
        height: containerHeight,
        ...this.options,
      });
      console.log("PPT预览器实例创建成功");

      // 添加窗口大小变化监听，实现响应式
      this.setupResizeHandler();

      // 预览PPT文件
      await this.instance.preview(data);
      console.log("PPT预览完成");

      this.isLoading = false;
    } catch (error) {
      console.error("PPT预览失败:", error);
      this.showError(
        ERROR_MESSAGES.PREVIEW_FAILED("PPT", error.message || "未知错误")
      );
      this.isLoading = false;
      throw error;
    }
  }

  /**
   * 设置响应式处理
   */
  setupResizeHandler() {
    // 移除之前的监听器
    this.removeResizeHandler();

    // 创建节流的resize处理函数
    this.resizeHandler = throttle(() => {
      if (this.instance && typeof this.instance.resize === "function") {
        const newWidth = this.container.offsetWidth;
        const newHeight = this.container.offsetHeight;
        this.instance.resize(newWidth, newHeight);
      }
    }, 200);

    // 添加监听器
    this.addEventListener("resize", this.resizeHandler);
  }

  /**
   * 移除resize处理
   */
  removeResizeHandler() {
    if (this.resizeHandler) {
      this.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
  }

  /**
   * 销毁PPT预览器
   * @returns {Promise<void>}
   */
  async destroy() {
    try {
      // 移除resize处理
      this.removeResizeHandler();

      // 销毁pptx-preview实例
      if (this.instance) {
        if (typeof this.instance.destroy === "function") {
          this.instance.destroy();
        }
        this.instance = null;
      }

      // 清空容器
      const pptContainer = document.getElementById(CONTAINER_IDS.PPT);
      if (pptContainer) {
        pptContainer.innerHTML = "";
      }

      // 调用基类销毁方法
      await super.destroy();
    } catch (error) {
      console.warn("销毁PPT预览器时出错:", error);
    }
  }

  /**
   * 调整预览器大小
   * @param {number} width 宽度
   * @param {number} height 高度
   */
  resize(width, height) {
    try {
      if (this.instance && typeof this.instance.resize === "function") {
        this.instance.resize(width, height);
      }
    } catch (error) {
      console.warn("调整PPT预览器大小失败:", error);
    }
  }

  /**
   * 获取预览器信息
   * @returns {Object} 预览器信息
   */
  getInfo() {
    return {
      type: this.previewerType,
      name: "PPT预览器",
      library: "pptx-preview",
      supportedFormats: ["pptx", "ppt"],
      version: "1.0.0",
    };
  }

  /**
   * 检查文件是否支持
   * @param {string} extension 文件扩展名
   * @returns {boolean}
   */
  static isSupported(extension) {
    return ["pptx", "ppt"].includes(extension.toLowerCase());
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式数组
   */
  static getSupportedFormats() {
    return ["pptx", "ppt"];
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

    // PPT预览器只支持ArrayBuffer
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
      hasPptxPreview: typeof pptxPreview !== "undefined",
      hasResizeHandler: !!this.resizeHandler,
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
      // 根据pptx-preview库的API设置选项
      // 这里可以根据实际需要扩展
    }
  }

  /**
   * 获取当前幻灯片页码
   * @returns {number} 当前页码
   */
  getCurrentSlide() {
    try {
      if (
        this.instance &&
        typeof this.instance.getCurrentSlide === "function"
      ) {
        return this.instance.getCurrentSlide();
      }
      return 1;
    } catch (error) {
      console.warn("获取当前幻灯片失败:", error);
      return 1;
    }
  }

  /**
   * 获取总幻灯片数
   * @returns {number} 总幻灯片数
   */
  getTotalSlides() {
    try {
      if (this.instance && typeof this.instance.getTotalSlides === "function") {
        return this.instance.getTotalSlides();
      }
      return 0;
    } catch (error) {
      console.warn("获取总幻灯片数失败:", error);
      return 0;
    }
  }

  /**
   * 跳转到指定幻灯片
   * @param {number} slideNum 幻灯片页码
   */
  goToSlide(slideNum) {
    try {
      if (this.instance && typeof this.instance.goToSlide === "function") {
        this.instance.goToSlide(slideNum);
      }
    } catch (error) {
      console.warn("跳转幻灯片失败:", error);
    }
  }

  /**
   * 下一张幻灯片
   */
  nextSlide() {
    try {
      if (this.instance && typeof this.instance.nextSlide === "function") {
        this.instance.nextSlide();
      }
    } catch (error) {
      console.warn("切换到下一张幻灯片失败:", error);
    }
  }

  /**
   * 上一张幻灯片
   */
  previousSlide() {
    try {
      if (this.instance && typeof this.instance.previousSlide === "function") {
        this.instance.previousSlide();
      }
    } catch (error) {
      console.warn("切换到上一张幻灯片失败:", error);
    }
  }
}

// 导出预览器类和工厂函数
export default PptPreviewer;

/**
 * 创建PPT预览器实例
 * @param {HTMLElement} container 容器元素
 * @param {Object} options 选项
 * @returns {PptPreviewer} PPT预览器实例
 */
export function createPptPreviewer(container, options = {}) {
  return new PptPreviewer(container, options);
}
