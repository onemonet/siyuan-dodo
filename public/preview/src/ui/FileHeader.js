/**
 * 文件头部组件
 * 负责显示文件信息和操作按钮
 */

import {
  getFileIconPath,
  getFileName,
  createDownloadLink,
} from "../utils/Helpers.js";
import { SELECTORS } from "../utils/Constants.js";

/**
 * 文件头部组件类
 */
export class FileHeader {
  constructor(options = {}) {
    this.options = {
      showDownload: true,
      showIcon: true,
      ...options,
    };
    this.isVisible = false;
    this.currentFilePath = "";
    this.currentFileName = "";
    this.currentExtension = "";
  }

  /**
   * 初始化文件头部
   */
  initialize() {
    this.headerElement = document.querySelector(SELECTORS.FILE_HEADER);
    this.iconElement = document.querySelector(SELECTORS.FILE_HEADER_ICON);
    this.titleElement = document.querySelector(SELECTORS.FILE_HEADER_TITLE);
    this.downloadAction = document.querySelector(SELECTORS.DOWNLOAD_ACTION);

    console.log("FileHeader初始化", {
      headerElement: !!this.headerElement,
      iconElement: !!this.iconElement,
      titleElement: !!this.titleElement,
      downloadAction: !!this.downloadAction,
      selectors: SELECTORS,
    });

    if (!this.headerElement) {
      console.warn("文件头部元素未找到");
      return false;
    }

    this.setupEventListeners();
    return true;
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (this.downloadAction && this.options.showDownload) {
      console.log("设置下载按钮事件监听器");
      this.downloadAction.addEventListener("click", (event) => {
        console.log("下载按钮被点击", event);
        event.preventDefault();
        event.stopPropagation();
        this.handleDownload();
      });
    } else {
      console.warn("下载按钮未找到或未启用", {
        downloadAction: !!this.downloadAction,
        showDownload: this.options.showDownload,
      });
    }
  }

  /**
   * 显示文件信息
   * @param {string} filePath 文件路径
   */
  showFileInfo(filePath) {
    if (!this.headerElement) {
      console.warn("文件头部未初始化");
      return;
    }

    this.currentFilePath = filePath;
    this.currentFileName = getFileName(filePath);
    this.currentExtension = this.currentFileName.split(".").pop().toLowerCase();

    // 设置图标
    if (this.iconElement && this.options.showIcon) {
      this.iconElement.src = getFileIconPath(this.currentExtension);
      this.iconElement.alt = this.currentExtension.toUpperCase();
    }

    // 设置文件名
    if (this.titleElement) {
      this.titleElement.textContent = this.currentFileName;
    }

    // 设置下载链接
    if (this.downloadAction && this.options.showDownload) {
      this.downloadAction.style.display = "flex";
    }

    // 显示头部
    this.show();
  }

  /**
   * 处理下载操作
   */
  handleDownload() {
    console.log("开始处理下载操作", {
      currentFilePath: this.currentFilePath,
      currentFileName: this.currentFileName,
    });

    if (this.currentFilePath) {
      try {
        // 在思源笔记iframe环境中，直接在新窗口打开文件
        // 这样用户可以在浏览器中下载文件
        window.open(this.currentFilePath, "_blank");
        console.log("已在新窗口打开文件供下载");
      } catch (error) {
        console.error("打开文件失败:", error);
        // 降级方案：复制链接到剪贴板
        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(this.currentFilePath)
            .then(() => {
              console.log("文件链接已复制到剪贴板");
              alert(
                `文件链接已复制到剪贴板，请手动在新标签页中打开：\n${this.currentFilePath}`
              );
            })
            .catch((err) => {
              console.error("复制到剪贴板失败:", err);
              alert(
                `请手动复制以下链接在新标签页中打开：\n${this.currentFilePath}`
              );
            });
        } else {
          alert(
            `请手动复制以下链接在新标签页中打开：\n${this.currentFilePath}`
          );
        }
      }
    } else {
      console.warn("没有当前文件路径，无法下载");
    }
  }

  /**
   * 显示文件头部
   */
  show() {
    if (this.headerElement) {
      this.headerElement.style.display = "flex";
      this.isVisible = true;
    }
  }

  /**
   * 隐藏文件头部
   */
  hide() {
    if (this.headerElement) {
      this.headerElement.style.display = "none";
      this.isVisible = false;
    }
  }

  /**
   * 切换显示状态
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 更新文件名
   * @param {string} fileName 新文件名
   */
  updateFileName(fileName) {
    this.currentFileName = fileName;
    if (this.titleElement) {
      this.titleElement.textContent = fileName;
    }
  }

  /**
   * 更新图标
   * @param {string} iconPath 图标路径
   */
  updateIcon(iconPath) {
    if (this.iconElement) {
      this.iconElement.src = iconPath;
    }
  }

  /**
   * 设置下载按钮可见性
   * @param {boolean} visible 是否可见
   */
  setDownloadVisible(visible) {
    if (this.downloadAction) {
      this.downloadAction.style.display = visible ? "flex" : "none";
    }
  }

  /**
   * 设置图标可见性
   * @param {boolean} visible 是否可见
   */
  setIconVisible(visible) {
    if (this.iconElement) {
      this.iconElement.style.display = visible ? "block" : "none";
    }
  }

  /**
   * 添加自定义操作按钮
   * @param {Object} buttonConfig 按钮配置
   * @param {string} buttonConfig.id 按钮ID
   * @param {string} buttonConfig.icon 图标路径
   * @param {string} buttonConfig.title 提示文本
   * @param {Function} buttonConfig.onClick 点击处理函数
   * @param {string} buttonConfig.className CSS类名
   */
  addActionButton(buttonConfig) {
    if (!this.headerElement || !buttonConfig) {
      return;
    }

    const { id, icon, title, onClick, className = "" } = buttonConfig;

    // 查找操作按钮容器
    const actionsContainer = this.headerElement.querySelector(
      ".file-header-actions"
    );
    if (!actionsContainer) {
      console.warn("操作按钮容器未找到");
      return;
    }

    // 创建按钮
    const button = document.createElement("img");
    button.id = id;
    button.className = `file-header-action ${className}`.trim();
    button.src = icon;
    button.alt = title;
    button.title = title;
    button.style.cursor = "pointer";

    // 添加点击事件
    if (typeof onClick === "function") {
      button.addEventListener("click", onClick);
    }

    // 插入到下载按钮之前
    if (this.downloadAction) {
      actionsContainer.insertBefore(button, this.downloadAction);
    } else {
      actionsContainer.appendChild(button);
    }
  }

  /**
   * 移除操作按钮
   * @param {string} buttonId 按钮ID
   */
  removeActionButton(buttonId) {
    if (!this.headerElement) {
      return;
    }

    const button = this.headerElement.querySelector(`#${buttonId}`);
    if (button) {
      button.remove();
    }
  }

  /**
   * 设置标题点击事件
   * @param {Function} onClick 点击处理函数
   */
  setTitleClickHandler(onClick) {
    if (this.titleElement && typeof onClick === "function") {
      this.titleElement.style.cursor = "pointer";
      this.titleElement.addEventListener("click", onClick);
    }
  }

  /**
   * 获取当前文件信息
   * @returns {Object} 文件信息对象
   */
  getCurrentFileInfo() {
    return {
      filePath: this.currentFilePath,
      fileName: this.currentFileName,
      extension: this.currentExtension,
      isVisible: this.isVisible,
    };
  }

  /**
   * 重置文件头部
   */
  reset() {
    this.hide();
    this.currentFilePath = "";
    this.currentFileName = "";
    this.currentExtension = "";

    if (this.titleElement) {
      this.titleElement.textContent = "";
    }

    if (this.iconElement) {
      this.iconElement.src = "";
      this.iconElement.alt = "";
    }
  }

  /**
   * 销毁组件
   */
  destroy() {
    // 移除事件监听器
    if (this.downloadAction) {
      this.downloadAction.removeEventListener("click", this.handleDownload);
    }

    // 重置状态
    this.reset();

    // 清理引用
    this.headerElement = null;
    this.iconElement = null;
    this.titleElement = null;
    this.downloadAction = null;
  }
}

// 导出组件类和工厂函数
export default FileHeader;

/**
 * 创建文件头部组件实例
 * @param {Object} options 选项
 * @returns {FileHeader} 文件头部组件实例
 */
export function createFileHeader(options = {}) {
  const header = new FileHeader(options);
  header.initialize();
  return header;
}
