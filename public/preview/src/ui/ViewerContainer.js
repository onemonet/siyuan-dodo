/**
 * 预览容器组件
 * 负责管理预览内容的显示和状态
 */

import { SELECTORS } from "../utils/Constants.js";
import { createLoadingMessage, createErrorMessage } from "../utils/Helpers.js";

/**
 * 预览容器组件类
 */
export class ViewerContainer {
  constructor(options = {}) {
    this.options = {
      showLoading: true,
      showError: true,
      loadingMessage: "正在加载...",
      errorMessage: "加载失败",
      ...options,
    };
    this.container = null;
    this.currentPreviewer = null;
    this.isLoading = false;
    this.hasError = false;
  }

  /**
   * 初始化容器
   */
  initialize() {
    this.container = document.querySelector(SELECTORS.VIEWER_CONTAINER);
    if (!this.container) {
      console.error("预览容器元素未找到");
      return false;
    }
    return true;
  }

  /**
   * 设置当前预览器
   * @param {BasePreviewer} previewer 预览器实例
   */
  setCurrentPreviewer(previewer) {
    this.currentPreviewer = previewer;
  }

  /**
   * 清空容器
   */
  clear() {
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.isLoading = false;
    this.hasError = false;
  }

  /**
   * 显示加载状态
   * @param {string} message 加载消息
   */
  showLoading(message = null) {
    if (!this.container) {
      console.warn("预览容器未初始化");
      return;
    }

    this.isLoading = true;
    this.hasError = false;

    const loadingMsg = message || this.options.loadingMessage;
    this.container.innerHTML = createLoadingMessage(loadingMsg);
  }

  /**
   * 显示错误状态
   * @param {string} message 错误消息
   */
  showError(message = null) {
    if (!this.container) {
      console.warn("预览容器未初始化");
      return;
    }

    this.isLoading = false;
    this.hasError = true;

    const errorMsg = message || this.options.errorMessage;
    this.container.innerHTML = createErrorMessage(errorMsg);
  }

  /**
   * 显示自定义内容
   * @param {string|HTMLElement} content 内容
   */
  showContent(content) {
    if (!this.container) {
      console.warn("预览容器未初始化");
      return;
    }

    this.isLoading = false;
    this.hasError = false;

    if (typeof content === "string") {
      this.container.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      this.container.innerHTML = "";
      this.container.appendChild(content);
    }
  }

  /**
   * 重置查看器
   * @param {string} message 重置后显示的消息
   */
  reset(message = "") {
    // 销毁当前预览器
    if (this.currentPreviewer) {
      this.currentPreviewer.destroy();
      this.currentPreviewer = null;
    }

    // 清空容器
    this.clear();

    // 显示消息
    if (message) {
      this.showContent(message);
    }
  }

  /**
   * 获取容器尺寸
   * @returns {Object} 包含宽度和高度的对象
   */
  getDimensions() {
    if (!this.container) {
      return { width: 0, height: 0 };
    }

    return {
      width: this.container.offsetWidth,
      height: this.container.offsetHeight,
    };
  }

  /**
   * 设置容器样式
   * @param {Object} styles 样式对象
   */
  setStyles(styles) {
    if (!this.container) {
      return;
    }

    Object.assign(this.container.style, styles);
  }

  /**
   * 添加CSS类
   * @param {string} className CSS类名
   */
  addClass(className) {
    if (this.container) {
      this.container.classList.add(className);
    }
  }

  /**
   * 移除CSS类
   * @param {string} className CSS类名
   */
  removeClass(className) {
    if (this.container) {
      this.container.classList.remove(className);
    }
  }

  /**
   * 切换CSS类
   * @param {string} className CSS类名
   */
  toggleClass(className) {
    if (this.container) {
      this.container.classList.toggle(className);
    }
  }

  /**
   * 检查是否包含指定CSS类
   * @param {string} className CSS类名
   * @returns {boolean}
   */
  hasClass(className) {
    return this.container
      ? this.container.classList.contains(className)
      : false;
  }

  /**
   * 设置容器可见性
   * @param {boolean} visible 是否可见
   */
  setVisible(visible) {
    if (this.container) {
      this.container.style.display = visible ? "block" : "none";
    }
  }

  /**
   * 获取容器可见性
   * @returns {boolean}
   */
  isVisible() {
    if (!this.container) {
      return false;
    }
    return this.container.style.display !== "none";
  }

  /**
   * 聚焦到容器
   */
  focus() {
    if (this.container) {
      this.container.focus();
    }
  }

  /**
   * 滚动到容器
   * @param {Object} options 滚动选项
   */
  scrollTo(options = {}) {
    if (this.container) {
      this.container.scrollIntoView({ behavior: "smooth", ...options });
    }
  }

  /**
   * 添加事件监听器
   * @param {string} event 事件名称
   * @param {Function} handler 事件处理函数
   */
  addEventListener(event, handler) {
    if (this.container) {
      this.container.addEventListener(event, handler);
    }
  }

  /**
   * 移除事件监听器
   * @param {string} event 事件名称
   * @param {Function} handler 事件处理函数
   */
  removeEventListener(event, handler) {
    if (this.container) {
      this.container.removeEventListener(event, handler);
    }
  }

  /**
   * 获取容器状态
   * @returns {Object} 状态对象
   */
  getStatus() {
    return {
      isInitialized: !!this.container,
      isLoading: this.isLoading,
      hasError: this.hasError,
      hasPreviewer: !!this.currentPreviewer,
      isVisible: this.isVisible(),
      dimensions: this.getDimensions(),
    };
  }

  /**
   * 创建子容器
   * @param {string} id 容器ID
   * @param {Object} styles 样式对象
   * @returns {HTMLElement} 子容器元素
   */
  createChildContainer(id, styles = {}) {
    if (!this.container) {
      return null;
    }

    const childContainer = document.createElement("div");
    childContainer.id = id;

    // 应用默认样式
    const defaultStyles = {
      width: "100%",
      height: "100%",
    };

    // 合并样式
    const finalStyles = { ...defaultStyles, ...styles };
    Object.assign(childContainer.style, finalStyles);

    // 添加到主容器
    this.container.appendChild(childContainer);

    return childContainer;
  }

  /**
   * 获取子容器
   * @param {string} id 容器ID
   * @returns {HTMLElement|null} 子容器元素
   */
  getChildContainer(id) {
    return this.container ? this.container.querySelector(`#${id}`) : null;
  }

  /**
   * 移除子容器
   * @param {string} id 容器ID
   */
  removeChildContainer(id) {
    const childContainer = this.getChildContainer(id);
    if (childContainer) {
      childContainer.remove();
    }
  }

  /**
   * 销毁组件
   */
  destroy() {
    // 重置查看器
    this.reset();

    // 清理引用
    this.container = null;
    this.currentPreviewer = null;
  }
}

// 导出组件类和工厂函数
export default ViewerContainer;

/**
 * 创建预览容器组件实例
 * @param {Object} options 选项
 * @returns {ViewerContainer} 预览容器组件实例
 */
export function createViewerContainer(options = {}) {
  const container = new ViewerContainer(options);
  container.initialize();
  return container;
}
