/**
 * 预览器基类
 * 定义所有预览器的通用接口和行为
 */

import { safeDestroyPreviewer, clearContainer } from "../utils/Helpers.js";

/**
 * 预览器基类
 */
export class BasePreviewer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.instance = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.eventListeners = new Map();
  }

  /**
   * 初始化预览器
   * 子类必须实现此方法
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error("子类必须实现 initialize 方法");
  }

  /**
   * 预览文件
   * 子类必须实现此方法
   * @param {string|ArrayBuffer} data 文件数据
   * @returns {Promise<void>}
   */
  async preview(data) {
    throw new Error("子类必须实现 preview 方法");
  }

  /**
   * 销毁预览器
   * @returns {Promise<void>}
   */
  async destroy() {
    try {
      // 移除所有事件监听器
      this.removeAllEventListeners();

      // 销毁预览器实例
      if (this.instance) {
        safeDestroyPreviewer(this.instance);
        this.instance = null;
      }

      // 清空容器
      if (this.container) {
        this.container.innerHTML = "";
      }

      this.isInitialized = false;
      this.isLoading = false;
    } catch (error) {
      console.warn("销毁预览器时出错:", error);
    }
  }

  /**
   * 调整预览器大小
   * 子类可以重写此方法
   * @param {number} width 宽度
   * @param {number} height 高度
   */
  resize(width, height) {
    // 默认实现为空，子类可以重写
  }

  /**
   * 添加事件监听器
   * @param {string} event 事件名称
   * @param {Function} handler 事件处理函数
   * @param {Element} target 目标元素，默认为window
   */
  addEventListener(event, handler, target = window) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }

    target.addEventListener(event, handler);
    this.eventListeners.get(event).push({ handler, target });
  }

  /**
   * 移除事件监听器
   * @param {string} event 事件名称
   * @param {Function} handler 事件处理函数
   * @param {Element} target 目标元素，默认为window
   */
  removeEventListener(event, handler, target = window) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.findIndex(
        (l) => l.handler === handler && l.target === target
      );
      if (index > -1) {
        target.removeEventListener(event, handler);
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 移除所有事件监听器
   */
  removeAllEventListeners() {
    for (const [event, listeners] of this.eventListeners) {
      for (const { handler, target } of listeners) {
        target.removeEventListener(event, handler);
      }
    }
    this.eventListeners.clear();
  }

  /**
   * 创建预览容器
   * @param {string} containerId 容器ID
   * @param {Object} styles 样式对象
   * @returns {HTMLElement} 容器元素
   */
  createContainer(containerId, styles = {}) {
    // 清空现有容器
    clearContainer(containerId);

    // 创建新容器
    const container = document.createElement("div");
    container.id = containerId;

    // 应用默认样式
    const defaultStyles = {
      width: "100%",
      height: "100%",
    };

    // 合并样式
    const finalStyles = { ...defaultStyles, ...styles };
    Object.assign(container.style, finalStyles);

    // 添加到父容器
    this.container.innerHTML = "";
    this.container.appendChild(container);

    return container;
  }

  /**
   * 显示加载状态
   * @param {string} message 加载消息
   */
  showLoading(message = "正在加载...") {
    this.isLoading = true;
    this.container.innerHTML = `<div class="loading-message">${message}</div>`;
  }

  /**
   * 显示错误状态
   * @param {string} message 错误消息
   */
  showError(message) {
    this.isLoading = false;
    this.container.innerHTML = `<div class="error-message">${message}</div>`;
  }

  /**
   * 检查是否已初始化
   * @returns {boolean}
   */
  isReady() {
    return this.isInitialized && !this.isLoading;
  }

  /**
   * 检查是否正在加载
   * @returns {boolean}
   */
  isLoadingState() {
    return this.isLoading;
  }

  /**
   * 获取预览器状态
   * @returns {Object} 状态对象
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      hasInstance: !!this.instance,
      containerId: this.container?.id,
    };
  }
}

/**
 * 预览器接口定义
 * 所有预览器都应该实现这个接口
 */
export class IPreviewer {
  constructor(container, options) {
    throw new Error("IPreviewer 是接口类，不能直接实例化");
  }

  async initialize() {
    throw new Error("必须实现 initialize 方法");
  }

  async preview(data) {
    throw new Error("必须实现 preview 方法");
  }

  async destroy() {
    throw new Error("必须实现 destroy 方法");
  }

  resize(width, height) {
    throw new Error("必须实现 resize 方法");
  }
}
