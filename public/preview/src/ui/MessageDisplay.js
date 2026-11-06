/**
 * 消息显示组件
 * 负责显示各种类型的消息（加载、错误、成功等）
 */

/**
 * 消息类型枚举
 */
export const MessageType = {
  LOADING: "loading",
  ERROR: "error",
  SUCCESS: "success",
  WARNING: "warning",
  INFO: "info",
};

/**
 * 消息显示组件类
 */
export class MessageDisplay {
  constructor(options = {}) {
    this.options = {
      container: null,
      duration: 0, // 0表示不自动消失
      position: "center", // center, top, bottom
      showCloseButton: true,
      maxMessages: 5,
      ...options,
    };
    this.messages = new Map();
    this.container = null;
    this.messageContainer = null;
  }

  /**
   * 初始化消息显示组件
   */
  initialize() {
    this.container = this.options.container || document.body;
    this.createMessageContainer();
    return true;
  }

  /**
   * 创建消息容器
   */
  createMessageContainer() {
    this.messageContainer = document.createElement("div");
    this.messageContainer.className = "message-display-container";
    this.messageContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    `;
    this.container.appendChild(this.messageContainer);
  }

  /**
   * 显示消息
   * @param {string} message 消息内容
   * @param {string} type 消息类型
   * @param {Object} options 选项
   * @returns {string} 消息ID
   */
  showMessage(message, type = MessageType.INFO, options = {}) {
    if (!this.messageContainer) {
      console.warn("消息显示组件未初始化");
      return null;
    }

    const messageId = this.generateMessageId();
    const messageConfig = {
      message,
      type,
      duration: options.duration || this.options.duration,
      showCloseButton:
        options.showCloseButton !== false && this.options.showCloseButton,
      position: options.position || this.options.position,
      ...options,
    };

    // 检查消息数量限制
    if (this.messages.size >= this.options.maxMessages) {
      this.removeOldestMessage();
    }

    // 创建消息元素
    const messageElement = this.createMessageElement(messageId, messageConfig);

    // 添加到容器
    this.messageContainer.appendChild(messageElement);

    // 存储消息信息
    this.messages.set(messageId, {
      element: messageElement,
      config: messageConfig,
      timestamp: Date.now(),
    });

    // 显示动画
    this.showMessageAnimation(messageElement);

    // 设置自动消失
    if (messageConfig.duration > 0) {
      setTimeout(() => {
        this.hideMessage(messageId);
      }, messageConfig.duration);
    }

    return messageId;
  }

  /**
   * 生成消息ID
   * @returns {string} 消息ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 创建消息元素
   * @param {string} messageId 消息ID
   * @param {Object} config 消息配置
   * @returns {HTMLElement} 消息元素
   */
  createMessageElement(messageId, config) {
    const messageElement = document.createElement("div");
    messageElement.id = messageId;
    messageElement.className = `message message-${config.type}`;

    // 基础样式
    const baseStyles = {
      position: "absolute",
      padding: "12px 16px",
      borderRadius: "4px",
      fontSize: "14px",
      fontWeight: "500",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
      pointerEvents: "auto",
      cursor: "default",
      maxWidth: "400px",
      wordWrap: "break-word",
      zIndex: 10000,
      opacity: 0,
      transform: "translateY(-20px)",
      transition: "all 0.3s ease",
    };

    // 根据类型设置样式
    const typeStyles = this.getTypeStyles(config.type);

    // 根据位置设置样式
    const positionStyles = this.getPositionStyles(config.position);

    // 合并样式
    Object.assign(messageElement.style, baseStyles, typeStyles, positionStyles);

    // 设置消息内容
    messageElement.innerHTML = this.formatMessageContent(config);

    // 添加关闭按钮
    if (config.showCloseButton) {
      const closeButton = this.createCloseButton(messageId);
      messageElement.appendChild(closeButton);
    }

    return messageElement;
  }

  /**
   * 获取类型样式
   * @param {string} type 消息类型
   * @returns {Object} 样式对象
   */
  getTypeStyles(type) {
    const styles = {
      [MessageType.LOADING]: {
        backgroundColor: "#e3f2fd",
        color: "#1976d2",
        border: "1px solid #bbdefb",
      },
      [MessageType.ERROR]: {
        backgroundColor: "#ffebee",
        color: "#d32f2f",
        border: "1px solid #ffcdd2",
      },
      [MessageType.SUCCESS]: {
        backgroundColor: "#e8f5e8",
        color: "#2e7d32",
        border: "1px solid #c8e6c9",
      },
      [MessageType.WARNING]: {
        backgroundColor: "#fff3e0",
        color: "#f57c00",
        border: "1px solid #ffcc02",
      },
      [MessageType.INFO]: {
        backgroundColor: "#e0f2f1",
        color: "#00796b",
        border: "1px solid #b2dfdb",
      },
    };

    return styles[type] || styles[MessageType.INFO];
  }

  /**
   * 获取位置样式
   * @param {string} position 位置
   * @returns {Object} 样式对象
   */
  getPositionStyles(position) {
    const styles = {
      center: {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      },
      top: {
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
      },
      bottom: {
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
      },
    };

    return styles[position] || styles.center;
  }

  /**
   * 格式化消息内容
   * @param {Object} config 消息配置
   * @returns {string} 格式化后的HTML
   */
  formatMessageContent(config) {
    let content = config.message;

    // 添加图标
    const icon = this.getTypeIcon(config.type);
    if (icon) {
      content = `<span class="message-icon">${icon}</span> ${content}`;
    }

    // 包装内容
    return `<div class="message-content">${content}</div>`;
  }

  /**
   * 获取类型图标
   * @param {string} type 消息类型
   * @returns {string} 图标HTML
   */
  getTypeIcon(type) {
    const icons = {
      [MessageType.LOADING]: "⏳",
      [MessageType.ERROR]: "❌",
      [MessageType.SUCCESS]: "✅",
      [MessageType.WARNING]: "⚠️",
      [MessageType.INFO]: "ℹ️",
    };

    return icons[type] || "";
  }

  /**
   * 创建关闭按钮
   * @param {string} messageId 消息ID
   * @returns {HTMLElement} 关闭按钮元素
   */
  createCloseButton(messageId) {
    const closeButton = document.createElement("span");
    closeButton.className = "message-close";
    closeButton.innerHTML = "✕";
    closeButton.style.cssText = `
      margin-left: 12px;
      cursor: pointer;
      font-weight: bold;
      opacity: 0.7;
      transition: opacity 0.2s;
    `;

    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.opacity = "1";
    });

    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.opacity = "0.7";
    });

    closeButton.addEventListener("click", () => {
      this.hideMessage(messageId);
    });

    return closeButton;
  }

  /**
   * 显示消息动画
   * @param {HTMLElement} element 消息元素
   */
  showMessageAnimation(element) {
    // 使用requestAnimationFrame确保动画流畅
    requestAnimationFrame(() => {
      element.style.opacity = "1";
      element.style.transform = element.style.transform.replace(
        "translateY(-20px)",
        "translateY(0)"
      );
    });
  }

  /**
   * 隐藏消息
   * @param {string} messageId 消息ID
   */
  hideMessage(messageId) {
    const messageData = this.messages.get(messageId);
    if (!messageData) {
      return;
    }

    const { element } = messageData;

    // 隐藏动画
    element.style.opacity = "0";
    element.style.transform = element.style.transform.replace(
      "translateY(0)",
      "translateY(-20px)"
    );

    // 延迟移除元素
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.messages.delete(messageId);
    }, 300);
  }

  /**
   * 移除最旧的消息
   */
  removeOldestMessage() {
    let oldestMessageId = null;
    let oldestTimestamp = Infinity;

    for (const [messageId, messageData] of this.messages) {
      if (messageData.timestamp < oldestTimestamp) {
        oldestTimestamp = messageData.timestamp;
        oldestMessageId = messageId;
      }
    }

    if (oldestMessageId) {
      this.hideMessage(oldestMessageId);
    }
  }

  /**
   * 显示加载消息
   * @param {string} message 消息内容
   * @param {Object} options 选项
   * @returns {string} 消息ID
   */
  showLoading(message, options = {}) {
    return this.showMessage(message, MessageType.LOADING, {
      ...options,
      duration: 0,
    });
  }

  /**
   * 显示错误消息
   * @param {string} message 消息内容
   * @param {Object} options 选项
   * @returns {string} 消息ID
   */
  showError(message, options = {}) {
    return this.showMessage(message, MessageType.ERROR, options);
  }

  /**
   * 显示成功消息
   * @param {string} message 消息内容
   * @param {Object} options 选项
   * @returns {string} 消息ID
   */
  showSuccess(message, options = {}) {
    return this.showMessage(message, MessageType.SUCCESS, options);
  }

  /**
   * 显示警告消息
   * @param {string} message 消息内容
   * @param {Object} options 选项
   * @returns {string} 消息ID
   */
  showWarning(message, options = {}) {
    return this.showMessage(message, MessageType.WARNING, options);
  }

  /**
   * 显示信息消息
   * @param {string} message 消息内容
   * @param {Object} options 选项
   * @returns {string} 消息ID
   */
  showInfo(message, options = {}) {
    return this.showMessage(message, MessageType.INFO, options);
  }

  /**
   * 清除所有消息
   */
  clearAll() {
    for (const messageId of this.messages.keys()) {
      this.hideMessage(messageId);
    }
  }

  /**
   * 清除指定类型的消息
   * @param {string} type 消息类型
   */
  clearByType(type) {
    const messagesToRemove = [];

    for (const [messageId, messageData] of this.messages) {
      if (messageData.config.type === type) {
        messagesToRemove.push(messageId);
      }
    }

    messagesToRemove.forEach((messageId) => {
      this.hideMessage(messageId);
    });
  }

  /**
   * 获取消息数量
   * @returns {number} 消息数量
   */
  getMessageCount() {
    return this.messages.size;
  }

  /**
   * 销毁组件
   */
  destroy() {
    this.clearAll();

    if (this.messageContainer && this.messageContainer.parentNode) {
      this.messageContainer.parentNode.removeChild(this.messageContainer);
    }

    this.messages.clear();
    this.container = null;
    this.messageContainer = null;
  }
}

// 导出组件类和工厂函数
export default MessageDisplay;

/**
 * 创建消息显示组件实例
 * @param {Object} options 选项
 * @returns {MessageDisplay} 消息显示组件实例
 */
export function createMessageDisplay(options = {}) {
  const display = new MessageDisplay(options);
  display.initialize();
  return display;
}
