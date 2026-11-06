/**
 * Excel预览器
 * 使用vue-office库预览Excel文件
 */

import { BasePreviewer } from "../core/BasePreviewer.js";
import {
  CONTAINER_IDS,
  LOADING_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/Constants.js";

/**
 * Excel预览器类
 */
export class ExcelPreviewer extends BasePreviewer {
  constructor(container, options = {}) {
    super(container, options);
    this.previewerType = "excel";
  }

  /**
   * 初始化Excel预览器
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.warn("Excel预览器已经初始化");
        return;
      }

      // 检查vue-office库是否可用
      if (typeof jsPreviewExcel === "undefined") {
        throw new Error("vue-office Excel库未加载");
      }

      this.isInitialized = true;
      console.log("Excel预览器初始化成功");
    } catch (error) {
      console.error("Excel预览器初始化失败:", error);
      throw error;
    }
  }

  /**
   * 预览Excel文件
   * @param {string|ArrayBuffer} data 文件数据（URL或ArrayBuffer）
   * @returns {Promise<void>}
   */
  async preview(data) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.isLoading) {
        console.warn("Excel预览器正在加载中");
        return;
      }

      this.isLoading = true;
      this.showLoading(LOADING_MESSAGES.EXCEL);

      // 销毁之前的实例
      await this.destroy();

      // 创建预览容器
      const excelContainer = this.createContainer(CONTAINER_IDS.EXCEL);

      // 初始化vue-office Excel预览器
      this.instance = jsPreviewExcel.init(excelContainer);
      console.log("Excel预览器实例创建成功");

      // 预览Excel文件
      await this.instance.preview(data);
      console.log("Excel预览完成");

      // 添加滚动事件处理，防止事件冒泡到父页面
      this.setupScrollPrevention(excelContainer);

      this.isLoading = false;
    } catch (error) {
      console.error("Excel预览失败:", error);
      this.showError(ERROR_MESSAGES.PREVIEW_FAILED("Excel", error.message));
      this.isLoading = false;
      throw error;
    }
  }

  /**
   * 销毁Excel预览器
   * @returns {Promise<void>}
   */
  async destroy() {
    try {
      // 清理滚动事件监听器
      this.cleanupScrollListeners();

      // 销毁vue-office实例
      if (this.instance) {
        if (typeof this.instance.destroy === "function") {
          this.instance.destroy();
        }
        this.instance = null;
      }

      // 清空容器
      const excelContainer = document.getElementById(CONTAINER_IDS.EXCEL);
      if (excelContainer) {
        excelContainer.innerHTML = "";
      }

      // 调用基类销毁方法
      await super.destroy();
    } catch (error) {
      console.warn("销毁Excel预览器时出错:", error);
    }
  }

  /**
   * 清理滚动事件监听器
   */
  cleanupScrollListeners() {
    const excelContainer = document.getElementById(CONTAINER_IDS.EXCEL);
    if (excelContainer) {
      // 查找所有可能滚动的元素
      const scrollableElements = excelContainer.querySelectorAll(
        '.x-spreadsheet, .x-spreadsheet-sheet, .vue-office-excel, [style*="overflow"]'
      );

      // 如果没有找到特定元素，则对整个容器清理事件
      const targetElements =
        scrollableElements.length > 0 ? scrollableElements : [excelContainer];

      targetElements.forEach((element) => {
        // 克隆元素以移除所有事件监听器
        const newElement = element.cloneNode(true);
        element.parentNode?.replaceChild(newElement, element);
      });

      console.log("Excel预览器滚动事件监听器已清理");
    }
  }

  /**
   * 获取预览器信息
   * @returns {Object} 预览器信息
   */
  getInfo() {
    return {
      type: this.previewerType,
      name: "Excel预览器",
      library: "vue-office",
      supportedFormats: ["xlsx", "xls"],
      version: "1.0.0",
    };
  }

  /**
   * 检查文件是否支持
   * @param {string} extension 文件扩展名
   * @returns {boolean}
   */
  static isSupported(extension) {
    return ["xlsx", "xls"].includes(extension.toLowerCase());
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式数组
   */
  static getSupportedFormats() {
    return ["xlsx", "xls"];
  }

  /**
   * 验证文件数据
   * @param {string|ArrayBuffer} data 文件数据
   * @returns {boolean}
   */
  validateData(data) {
    if (!data) {
      return false;
    }

    // 支持URL字符串或ArrayBuffer
    return typeof data === "string" || data instanceof ArrayBuffer;
  }

  /**
   * 设置滚动事件防护，防止滚动事件冒泡到父页面
   * @param {HTMLElement} container Excel容器元素
   */
  setupScrollPrevention(container) {
    // 等待DOM更新后再添加事件监听器
    setTimeout(() => {
      // 查找所有可能滚动的元素
      const scrollableElements = container.querySelectorAll(
        '.x-spreadsheet, .x-spreadsheet-sheet, .vue-office-excel, [style*="overflow"]'
      );

      // 如果没有找到特定元素，则对整个容器添加事件处理
      const targetElements =
        scrollableElements.length > 0 ? scrollableElements : [container];

      targetElements.forEach((element) => {
        // 防止鼠标滚轮事件冒泡
        element.addEventListener(
          "wheel",
          (e) => {
            e.stopPropagation();
            e.preventDefault();

            // 手动处理滚动
            const scrollTop = element.scrollTop;
            const scrollLeft = element.scrollLeft;
            const delta = e.deltaY;

            // 检查是否可以继续滚动
            const canScrollDown =
              scrollTop < element.scrollHeight - element.clientHeight;
            const canScrollUp = scrollTop > 0;

            // 只有在可以滚动的情况下才执行滚动
            if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
              element.scrollTop += delta;
            }
          },
          { passive: false }
        );

        // 防止触摸滚动事件冒泡（移动端）
        element.addEventListener(
          "touchmove",
          (e) => {
            e.stopPropagation();
          },
          { passive: false }
        );
      });

      console.log("Excel预览器滚动防护已设置");
    }, 100); // 延迟100ms确保DOM完全渲染
  }

  /**
   * 获取预览器状态
   * @returns {Object} 状态对象
   */
  getStatus() {
    return {
      ...super.getStatus(),
      previewerType: this.previewerType,
      hasVueOffice: typeof jsPreviewExcel !== "undefined",
    };
  }
}

// 导出预览器类和工厂函数
export default ExcelPreviewer;

/**
 * 创建Excel预览器实例
 * @param {HTMLElement} container 容器元素
 * @param {Object} options 选项
 * @returns {ExcelPreviewer} Excel预览器实例
 */
export function createExcelPreviewer(container, options = {}) {
  return new ExcelPreviewer(container, options);
}
