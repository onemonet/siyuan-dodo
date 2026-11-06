/**
 * TXT预览器模块
 * 提供文本文件预览功能，支持语法高亮、行号显示、搜索等功能
 */
import {
  PREVIEWER_TYPES,
  LOADING_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/Constants.js";
import { BasePreviewer } from "../core/BasePreviewer.js";

export class TxtPreviewer extends BasePreviewer {
  constructor(container, options = {}) {
    super(container, options);
    this.previewerType = PREVIEWER_TYPES.TXT;
    this.content = "";
    this.originalContent = "";
    this.isSearchMode = false;
    this.currentSearchIndex = -1;
    this.searchResults = [];
  }

  /**
   * 初始化预览器
   */
  async initialize() {
    console.log("TXT 预览器初始化完成");
    this.isInitialized = true;
  }

  /**
   * 预览 TXT 文件
   * @param {string|ArrayBuffer} data - 文件URL或ArrayBuffer
   * @returns {Promise<void>}
   */
  async preview(data) {
    try {
      this.showLoading(LOADING_MESSAGES.TXT || "正在加载文本文件...");

      // 清理之前的实例
      this.cleanup();

      const viewerContainer = this.container;
      viewerContainer.innerHTML = `
        <div id="txt-preview-container" style="width: 100%; height: 100%; position: relative; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; background-color: #f8f9fa;">
          <!-- 工具栏 -->
          <div class="txt-toolbar" style="display: flex; gap: 10px; justify-content: space-between; align-items: center; 
               padding: 10px 20px; background: white; border-bottom: 1px solid #e9ecef; flex-wrap: wrap;">
            <div style="display: flex; gap: 10px; align-items: center;">
              <button id="txt-toggle-line-numbers" class="txt-btn" style="padding: 6px 12px; cursor: pointer; background: #007bff; color: white; 
                     border: none; border-radius: 4px; transition: background 0.3s; font-size: 12px;">行号</button>
              <button id="txt-toggle-word-wrap" class="txt-btn" style="padding: 6px 12px; cursor: pointer; background: #007bff; color: white; 
                     border: none; border-radius: 4px; transition: background 0.3s; font-size: 12px;">自动换行</button>
              <select id="txt-font-size" style="padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">
                <option value="12px">12px</option>
                <option value="14px" selected>14px</option>
                <option value="16px">16px</option>
                <option value="18px">18px</option>
                <option value="20px">20px</option>
              </select>
            </div>
            
            <div style="display: flex; gap: 10px; align-items: center;">
              <input id="txt-search-input" type="text" placeholder="搜索文本..." style="padding: 6px 10px; border: 1px solid #ccc; 
                     border-radius: 4px; font-size: 12px; width: 200px; display: none;">
              <button id="txt-search-btn" class="txt-btn" style="padding: 6px 12px; cursor: pointer; background: #28a745; color: white; 
                     border: none; border-radius: 4px; transition: background 0.3s; font-size: 12px;">搜索</button>
              <button id="txt-search-prev" class="txt-btn" style="padding: 6px 12px; cursor: pointer; background: #ffc107; color: black; 
                     border: none; border-radius: 4px; transition: background 0.3s; font-size: 12px; display: none;">上一个</button>
              <button id="txt-search-next" class="txt-btn" style="padding: 6px 12px; cursor: pointer; background: #ffc107; color: black; 
                     border: none; border-radius: 4px; transition: background 0.3s; font-size: 12px; display: none;">下一个</button>
              <button id="txt-search-clear" class="txt-btn" style="padding: 6px 12px; cursor: pointer; background: #dc3545; color: white; 
                     border: none; border-radius: 4px; transition: background 0.3s; font-size: 12px; display: none;">清除</button>
            </div>
          </div>
          
          <!-- 文件信息栏 -->
          <div class="txt-info-bar" style="padding: 8px 20px; background: #e9ecef; font-size: 12px; color: #6c757d; 
               display: flex; justify-content: space-between; align-items: center;">
            <span id="txt-file-info">文件信息加载中...</span>
            <span id="txt-cursor-position">行: 1, 列: 1</span>
          </div>
          
          <!-- 文本内容区域 -->
          <div id="txt-content-wrapper" style="flex: 1; overflow: auto; height: calc(100% - 120px); position: relative;">
            <div id="txt-line-numbers" style="position: absolute; left: 0; top: 0; width: 50px; background: #f1f3f4; 
                 color: #6c757d; text-align: right; padding-right: 10px; font-size: 14px; line-height: 1.5; 
                 user-select: none; border-right: 1px solid #e9ecef; display: none;"></div>
            <pre id="txt-content" style="margin: 0; padding: 15px 15px 15px 65px; background: white; color: #333; 
                 font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; 
                 overflow: visible; min-height: 100%;"></pre>
          </div>
        </div>
      `;

      // 添加按钮样式
      this.addButtonStyles();

      // 加载文本内容
      await this.loadTextContent(data);

      // 绑定事件
      this.bindEvents();

      // 显示文件信息
      this.updateFileInfo();

      console.log("TXT 预览初始化完成");
    } catch (error) {
      console.error("TXT 预览初始化失败:", error);
      this.showError(ERROR_MESSAGES.INIT_FAILED("TXT", error.message));
    }
  }

  /**
   * 加载文本内容
   * @param {string|ArrayBuffer} data - 文件数据
   */
  async loadTextContent(data) {
    try {
      let textContent = "";

      if (typeof data === "string") {
        if (data.startsWith("http")) {
          // 网络URL
          const response = await fetch(data);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          textContent = await response.text();
        } else {
          // 本地文件路径
          const response = await fetch(`/${data.trim()}`);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          textContent = await response.text();
        }
      } else if (data instanceof ArrayBuffer) {
        // ArrayBuffer
        const decoder = new TextDecoder("utf-8");
        textContent = decoder.decode(data);
      } else {
        throw new Error("不支持的文件数据格式");
      }

      this.originalContent = textContent;
      this.content = textContent;

      // 显示内容
      this.displayContent();
    } catch (error) {
      console.error("加载文本内容失败:", error);
      throw error;
    }
  }

  /**
   * 显示文本内容
   */
  displayContent() {
    const contentElement = document.getElementById("txt-content");
    const lineNumbersElement = document.getElementById("txt-line-numbers");

    if (contentElement) {
      contentElement.textContent = this.content;

      // 更新行号
      this.updateLineNumbers();

      // 应用语法高亮
      this.applySyntaxHighlighting();
    }
  }

  /**
   * 更新行号显示
   */
  updateLineNumbers() {
    const lineNumbersElement = document.getElementById("txt-line-numbers");
    if (!lineNumbersElement || lineNumbersElement.style.display === "none")
      return;

    const lines = this.content.split("\n");
    const lineNumbersHtml = lines
      .map((_, index) => `<div style="height: 1.5em;">${index + 1}</div>`)
      .join("");

    lineNumbersElement.innerHTML = lineNumbersHtml;
  }

  /**
   * 应用简单的语法高亮
   */
  applySyntaxHighlighting() {
    const contentElement = document.getElementById("txt-content");
    if (!contentElement) return;

    let highlightedContent = this.content
      // 关键字高亮（简单示例）
      .replace(
        /\b(function|const|let|var|if|else|for|while|return|class|import|export)\b/g,
        '<span style="color: #d73a49; font-weight: bold;">$1</span>'
      )
      // 字符串高亮
      .replace(
        /(["'`])([^"'`]*)\1/g,
        '<span style="color: #032f62;">$1$2$1</span>'
      )
      // 注释高亮
      .replace(
        /(\/\/.*$)/gm,
        '<span style="color: #6a737d; font-style: italic;">$1</span>'
      )
      // 数字高亮
      .replace(/\b(\d+)\b/g, '<span style="color: #005cc5;">$1</span>');

    contentElement.innerHTML = highlightedContent;
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 切换行号显示
    const toggleLineNumbersBtn = document.getElementById(
      "txt-toggle-line-numbers"
    );
    toggleLineNumbersBtn?.addEventListener("click", () => {
      const lineNumbersElement = document.getElementById("txt-line-numbers");
      const contentElement = document.getElementById("txt-content");

      if (lineNumbersElement.style.display === "none") {
        lineNumbersElement.style.display = "block";
        contentElement.style.paddingLeft = "65px";
        toggleLineNumbersBtn.textContent = "隐藏行号";
        this.updateLineNumbers();
      } else {
        lineNumbersElement.style.display = "none";
        contentElement.style.paddingLeft = "15px";
        toggleLineNumbersBtn.textContent = "行号";
      }
    });

    // 切换自动换行
    const toggleWordWrapBtn = document.getElementById("txt-toggle-word-wrap");
    toggleWordWrapBtn?.addEventListener("click", () => {
      const contentElement = document.getElementById("txt-content");

      if (contentElement.style.whiteSpace === "pre-wrap") {
        contentElement.style.whiteSpace = "pre";
        contentElement.style.wordWrap = "normal";
        toggleWordWrapBtn.textContent = "自动换行";
      } else {
        contentElement.style.whiteSpace = "pre-wrap";
        contentElement.style.wordWrap = "break-word";
        toggleWordWrapBtn.textContent = "不换行";
      }
    });

    // 字体大小调整
    const fontSizeSelect = document.getElementById("txt-font-size");
    fontSizeSelect?.addEventListener("change", (e) => {
      const contentElement = document.getElementById("txt-content");
      const lineNumbersElement = document.getElementById("txt-line-numbers");
      const fontSize = e.target.value;

      if (contentElement) {
        contentElement.style.fontSize = fontSize;
      }
      if (lineNumbersElement) {
        lineNumbersElement.style.fontSize = fontSize;
      }
    });

    // 搜索功能
    this.bindSearchEvents();

    // 鼠标位置跟踪
    this.bindCursorTracking();
  }

  /**
   * 绑定搜索事件
   */
  bindSearchEvents() {
    const searchBtn = document.getElementById("txt-search-btn");
    const searchInput = document.getElementById("txt-search-input");
    const searchPrevBtn = document.getElementById("txt-search-prev");
    const searchNextBtn = document.getElementById("txt-search-next");
    const searchClearBtn = document.getElementById("txt-search-clear");

    // 显示搜索框
    searchBtn?.addEventListener("click", () => {
      this.isSearchMode = true;
      searchInput.style.display = "inline-block";
      searchPrevBtn.style.display = "inline-block";
      searchNextBtn.style.display = "inline-block";
      searchClearBtn.style.display = "inline-block";
      searchInput.focus();
    });

    // 执行搜索
    const performSearch = () => {
      const searchTerm = searchInput.value.trim();
      if (!searchTerm) return;

      this.searchResults = [];
      this.currentSearchIndex = -1;

      // 查找所有匹配项
      const regex = new RegExp(
        searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi"
      );
      let match;
      while ((match = regex.exec(this.content)) !== null) {
        this.searchResults.push({
          index: match.index,
          length: match[0].length,
          text: match[0],
        });
      }

      if (this.searchResults.length > 0) {
        this.highlightSearchResults();
        this.goToNextSearchResult();
      } else {
        this.showMessage("未找到匹配项", "warning");
      }
    };

    // 搜索输入框回车事件
    searchInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        performSearch();
      }
    });

    // 搜索按钮点击
    searchBtn?.addEventListener("click", performSearch);

    // 上一个搜索结果
    searchPrevBtn?.addEventListener("click", () => {
      this.goToPrevSearchResult();
    });

    // 下一个搜索结果
    searchNextBtn?.addEventListener("click", () => {
      this.goToNextSearchResult();
    });

    // 清除搜索
    searchClearBtn?.addEventListener("click", () => {
      this.clearSearch();
    });
  }

  /**
   * 高亮搜索结果
   */
  highlightSearchResults() {
    const contentElement = document.getElementById("txt-content");
    if (!contentElement) return;

    let highlightedContent = this.content;

    // 按倒序替换，避免位置偏移
    this.searchResults
      .slice()
      .reverse()
      .forEach((result) => {
        const before = highlightedContent.substring(0, result.index);
        const match = highlightedContent.substring(
          result.index,
          result.index + result.length
        );
        const after = highlightedContent.substring(
          result.index + result.length
        );

        highlightedContent =
          before +
          `<span class="txt-search-result" style="background-color: #ffeb3b; padding: 1px 2px;">${match}</span>` +
          after;
      });

    contentElement.innerHTML = highlightedContent;
  }

  /**
   * 跳转到下一个搜索结果
   */
  goToNextSearchResult() {
    if (this.searchResults.length === 0) return;

    this.currentSearchIndex =
      (this.currentSearchIndex + 1) % this.searchResults.length;
    this.scrollToSearchResult(this.currentSearchIndex);
    this.updateSearchInfo();
  }

  /**
   * 跳转到上一个搜索结果
   */
  goToPrevSearchResult() {
    if (this.searchResults.length === 0) return;

    this.currentSearchIndex =
      (this.currentSearchIndex - 1 + this.searchResults.length) %
      this.searchResults.length;
    this.scrollToSearchResult(this.currentSearchIndex);
    this.updateSearchInfo();
  }

  /**
   * 滚动到指定搜索结果
   */
  scrollToSearchResult(index) {
    const searchResults = document.querySelectorAll(".txt-search-result");
    if (searchResults[index]) {
      searchResults[index].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      // 移除之前的高亮
      searchResults.forEach((el) => (el.style.backgroundColor = "#ffeb3b"));

      // 高亮当前结果
      searchResults[index].style.backgroundColor = "#ff9800";
    }
  }

  /**
   * 更新搜索信息
   */
  updateSearchInfo() {
    if (this.searchResults.length > 0) {
      this.showMessage(
        `找到 ${this.searchResults.length} 个匹配项，当前第 ${
          this.currentSearchIndex + 1
        } 个`,
        "info"
      );
    }
  }

  /**
   * 清除搜索
   */
  clearSearch() {
    this.isSearchMode = false;
    this.searchResults = [];
    this.currentSearchIndex = -1;

    const searchInput = document.getElementById("txt-search-input");
    const searchPrevBtn = document.getElementById("txt-search-prev");
    const searchNextBtn = document.getElementById("txt-search-next");
    const searchClearBtn = document.getElementById("txt-search-clear");

    searchInput.style.display = "none";
    searchPrevBtn.style.display = "none";
    searchNextBtn.style.display = "none";
    searchClearBtn.style.display = "none";
    searchInput.value = "";

    // 重新显示内容，移除高亮
    this.displayContent();
  }

  /**
   * 绑定鼠标位置跟踪
   */
  bindCursorTracking() {
    const contentElement = document.getElementById("txt-content");
    const positionElement = document.getElementById("txt-cursor-position");

    contentElement?.addEventListener("mousemove", (e) => {
      if (!positionElement) return;

      // 计算行列位置
      const text = contentElement.textContent;
      const lines = text
        .substring(0, contentElement.selectionStart)
        .split("\n");
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;

      positionElement.textContent = `行: ${line}, 列: ${column}`;
    });
  }

  /**
   * 更新文件信息
   */
  updateFileInfo() {
    const infoElement = document.getElementById("txt-file-info");
    if (!infoElement) return;

    const lines = this.content.split("\n").length;
    const words = this.content
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    const chars = this.content.length;
    const size = new Blob([this.content]).size;

    infoElement.textContent = `行数: ${lines} | 单词: ${words} | 字符: ${chars} | 大小: ${this.formatFileSize(
      size
    )}`;
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * 添加按钮样式
   */
  addButtonStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .txt-btn:hover {
        opacity: 0.8 !important;
        transform: translateY(-1px);
      }
      .txt-btn:active {
        transform: translateY(0);
      }
      #txt-search-input:focus {
        outline: none;
        border-color: #007bff;
        box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
      }
      #txt-font-size:focus {
        outline: none;
        border-color: #007bff;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.content = "";
    this.originalContent = "";
    this.isSearchMode = false;
    this.currentSearchIndex = -1;
    this.searchResults = [];
  }

  /**
   * 销毁预览器
   */
  async destroy() {
    try {
      this.cleanup();
      await super.destroy();
    } catch (error) {
      console.warn("销毁 TXT 预览器时出错:", error);
    }
  }

  /**
   * 获取预览器信息
   * @returns {Object} 预览器信息
   */
  getInfo() {
    return {
      type: this.previewerType,
      name: "TXT预览器",
      library: "原生JavaScript",
      supportedFormats: ["txt", "text", "log", "md"],
      version: "1.0.0",
    };
  }

  /**
   * 检查文件是否支持
   * @param {string} extension 文件扩展名
   * @returns {boolean}
   */
  static isSupported(extension) {
    return ["txt", "text", "log", "md"].includes(extension.toLowerCase());
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式数组
   */
  static getSupportedFormats() {
    return ["txt", "text", "log", "md"];
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
   * 获取预览器状态
   * @returns {Object} 状态对象
   */
  getStatus() {
    return {
      ...super.getStatus(),
      previewerType: this.previewerType,
      hasContent: !!this.content,
      isSearchMode: this.isSearchMode,
      searchResultsCount: this.searchResults.length,
    };
  }
}
