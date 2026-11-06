/**
 * EPUB预览器模块
 * 使用 epub.js 库实现 EPUB 文件预览
 */
import {
  PREVIEWER_TYPES,
  LOADING_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/Constants.js";
import { BasePreviewer } from "../core/BasePreviewer.js";

export class EpubPreviewer extends BasePreviewer {
  constructor(container, options = {}) {
    super(container, options);
    this.previewerType = PREVIEWER_TYPES.EPUB;
    this.book = null;
    this.rendition = null;
    this.isNavigating = false; // 防止重复导航
    this.updatePageInfoTimeout = null; // 防抖处理
  }

  /**
   * 初始化预览器
   */
  async initialize() {
    // EPUB 预览器不需要特殊的初始化逻辑
    console.log("EPUB 预览器初始化完成");
    this.isInitialized = true;
  }

  /**
   * 预览 EPUB 文件
   * @param {string|ArrayBuffer} data - 文件URL或ArrayBuffer
   * @returns {Promise<void>}
   */
  async preview(data) {
    try {
      this.showLoading(LOADING_MESSAGES.EPUB || "正在加载 EPUB 文件...");

      // 清理之前的实例
      this.cleanup();

      const viewerContainer = this.container;
      viewerContainer.innerHTML = `
        <div id="epub-preview-container" style="width: 100%; height: 100%; position: relative;">
          <div id="epub-viewer" style="width: 100%; height: 100%;"></div>
          <div id="epub-controls" style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); 
               background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 25px; 
               display: flex; align-items: center; gap: 15px; z-index: 10;">
            <button id="epub-prev" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px; padding: 5px 10px; margin: 0 5px;">◀</button>
            <span id="epub-page-info" style="font-size: 14px; min-width: 100px; text-align: center; display: inline-block;">加载中...</span>
            <button id="epub-next" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px; padding: 5px 10px; margin: 0 5px;">▶</button>
            <button id="epub-toc" style="background: none; border: none; color: white; cursor: pointer; font-size: 14px; padding: 5px 10px; margin: 0 5px;">目录</button>
          </div>
          <div id="epub-toc-panel" style="position: absolute; top: 0; left: 0; width: 300px; height: 100%; 
               background: white; border-right: 1px solid #ccc; display: none; z-index: 20; overflow-y: auto;">
            <div style="padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0;">目录</h3>
              <button id="epub-toc-close" style="background: none; border: none; cursor: pointer; font-size: 18px;">×</button>
            </div>
            <div id="epub-toc-content" style="padding: 10px;"></div>
          </div>
        </div>
      `;

      // 检查依赖库是否已加载
      if (typeof ePub === "undefined") {
        throw new Error("epub.js 库未加载");
      }

      if (typeof JSZip === "undefined") {
        throw new Error("JSZip 库未加载");
      }

      // 创建 EPUB 书籍实例
      let book;
      if (typeof data === "string" && data.startsWith("http")) {
        // 网络URL
        book = ePub(data);
      } else {
        // ArrayBuffer 或 Blob
        const blob = data instanceof ArrayBuffer ? new Blob([data]) : data;
        book = ePub(blob);
      }

      this.book = book;

      // 获取容器
      const viewer = document.getElementById("epub-viewer");

      // 创建渲染实例
      this.rendition = book.renderTo("epub-viewer", {
        width: "100%",
        height: "100%",
        spread: "auto",
        flow: "paginated",
      });

      // 显示渲染进度
      this.rendition.on("rendered", () => {
        console.log("EPUB 页面渲染完成");
        this.updatePageInfo();
      });

      // 监听位置变化（添加防抖处理）
      this.rendition.on("relocated", (location) => {
        // 清除之前的定时器
        if (this.updatePageInfoTimeout) {
          clearTimeout(this.updatePageInfoTimeout);
        }

        // 设置新的定时器，延迟更新页面信息
        this.updatePageInfoTimeout = setTimeout(() => {
          console.log("EPUB 位置变化:", location);
          this.updatePageInfo();
        }, 100); // 100ms 防抖延迟
      });

      // 处理渲染错误
      this.rendition.on("displayError", (error) => {
        console.error("EPUB 渲染错误:", error);
        this.showError(
          ERROR_MESSAGES.PREVIEW_FAILED("EPUB", error.message || "渲染失败")
        );
      });

      // 初始化 locations 以获得准确的进度信息
      try {
        console.log("正在生成 EPUB 位置信息...");
        await this.book.ready;
        await this.book.locations.generate(1600); // 生成位置信息，1600字符为一个位置
        console.log("EPUB 位置信息生成完成");
      } catch (error) {
        console.warn("生成位置信息失败，使用备用方案:", error);
      }

      // 开始渲染
      await this.rendition.display();

      // 绑定控制事件
      this.bindControls();

      // 加载目录
      await this.loadTableOfContents();

      console.log("EPUB 预览初始化完成");
    } catch (error) {
      console.error("EPUB 预览初始化失败:", error);
      this.showError(ERROR_MESSAGES.INIT_FAILED("EPUB", error.message));
    }
  }

  /**
   * 绑定控制事件
   */
  bindControls() {
    const prevBtn = document.getElementById("epub-prev");
    const nextBtn = document.getElementById("epub-next");
    const tocBtn = document.getElementById("epub-toc");
    const tocCloseBtn = document.getElementById("epub-toc-close");
    const tocPanel = document.getElementById("epub-toc-panel");

    // 上一页
    prevBtn?.addEventListener("click", async () => {
      if (this.rendition && !this.isNavigating) {
        this.isNavigating = true;
        this.setNavigationButtonState(false);

        try {
          // 检查是否已经在第一页
          const location = this.rendition.currentLocation();
          if (location && location.atStart) {
            console.log("已经在第一页");
            this.isNavigating = false;
            this.setNavigationButtonState(true);
            return;
          }

          await this.rendition.prev();
          // 延迟更新页面信息，避免与 relocated 事件冲突
          setTimeout(() => {
            this.updatePageInfo();
            this.isNavigating = false;
            this.setNavigationButtonState(true);
          }, 200);
        } catch (error) {
          console.error("上一页导航失败:", error);
          this.isNavigating = false;
          this.setNavigationButtonState(true);
        }
      }
    });

    // 下一页
    nextBtn?.addEventListener("click", async () => {
      if (this.rendition && !this.isNavigating) {
        this.isNavigating = true;
        this.setNavigationButtonState(false);

        try {
          // 检查是否已经在最后一页
          const location = this.rendition.currentLocation();
          if (location && location.atEnd) {
            console.log("已经在最后一页");
            this.isNavigating = false;
            this.setNavigationButtonState(true);
            return;
          }

          await this.rendition.next();
          // 延迟更新页面信息，避免与 relocated 事件冲突
          setTimeout(() => {
            this.updatePageInfo();
            this.isNavigating = false;
            this.setNavigationButtonState(true);
          }, 200);
        } catch (error) {
          console.error("下一页导航失败:", error);
          this.isNavigating = false;
          this.setNavigationButtonState(true);
        }
      }
    });

    // 显示/隐藏目录
    tocBtn?.addEventListener("click", () => {
      if (tocPanel) {
        tocPanel.style.display =
          tocPanel.style.display === "none" ? "block" : "none";
      }
    });

    // 关闭目录
    tocCloseBtn?.addEventListener("click", () => {
      if (tocPanel) {
        tocPanel.style.display = "none";
      }
    });

    // 键盘事件
    this.addEventListener("keydown", async (e) => {
      if (!this.rendition || this.isNavigating) return;

      switch (e.key) {
        case "ArrowLeft":
          this.isNavigating = true;
          this.setNavigationButtonState(false);
          try {
            const location = this.rendition.currentLocation();
            if (location && location.atStart) {
              console.log("已经在第一页");
              this.isNavigating = false;
              this.setNavigationButtonState(true);
              return;
            }

            await this.rendition.prev();
            setTimeout(() => {
              this.updatePageInfo();
              this.isNavigating = false;
              this.setNavigationButtonState(true);
            }, 200);
          } catch (error) {
            console.error("键盘上一页导航失败:", error);
            this.isNavigating = false;
            this.setNavigationButtonState(true);
          }
          break;
        case "ArrowRight":
          this.isNavigating = true;
          this.setNavigationButtonState(false);
          try {
            const location = this.rendition.currentLocation();
            if (location && location.atEnd) {
              console.log("已经在最后一页");
              this.isNavigating = false;
              this.setNavigationButtonState(true);
              return;
            }

            await this.rendition.next();
            setTimeout(() => {
              this.updatePageInfo();
              this.isNavigating = false;
              this.setNavigationButtonState(true);
            }, 200);
          } catch (error) {
            console.error("键盘下一页导航失败:", error);
            this.isNavigating = false;
            this.setNavigationButtonState(true);
          }
          break;
      }
    }, document);
  }

  /**
   * 加载目录
   */
  async loadTableOfContents() {
    if (!this.book) return;

    try {
      const navigation = await this.book.loaded.navigation;
      const tocContent = document.getElementById("epub-toc-content");

      if (tocContent && navigation.toc) {
        tocContent.innerHTML = "";

        navigation.toc.forEach((chapter, index) => {
          const chapterElement = document.createElement("div");
          chapterElement.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-radius: 4px;
            margin-bottom: 4px;
            font-size: 14px;
          `;
          chapterElement.textContent = chapter.label;

          chapterElement.addEventListener("click", async () => {
            if (this.rendition && !this.isNavigating) {
              this.isNavigating = true;
              try {
                await this.rendition.display(chapter.href);
                setTimeout(() => {
                  this.updatePageInfo();
                  this.isNavigating = false;
                }, 200);

                // 关闭目录面板
                const tocPanel = document.getElementById("epub-toc-panel");
                if (tocPanel) {
                  tocPanel.style.display = "none";
                }
              } catch (error) {
                console.error("章节跳转失败:", error);
                this.isNavigating = false;
              }
            }
          });

          chapterElement.addEventListener("mouseenter", () => {
            chapterElement.style.backgroundColor = "#f0f0f0";
          });

          chapterElement.addEventListener("mouseleave", () => {
            chapterElement.style.backgroundColor = "transparent";
          });

          tocContent.appendChild(chapterElement);
        });
      }
    } catch (error) {
      console.warn("加载目录失败:", error);
    }
  }

  /**
   * 更新页码信息
   */
  updatePageInfo() {
    if (!this.rendition) return;

    const pageInfo = document.getElementById("epub-page-info");
    if (pageInfo) {
      try {
        // 获取当前位置信息
        const location = this.rendition.currentLocation();

        // 更新导航按钮状态
        this.updateNavigationButtonStates();

        if (location && location.start) {
          // 尝试获取章节标题
          let chapterTitle = "";

          // 从不同位置获取章节信息
          if (location.start.displayed?.chapter) {
            chapterTitle = location.start.displayed.chapter;
          } else if (location.start.displayed?.section) {
            chapterTitle = location.start.displayed.section;
          } else if (location.toc && location.toc.length > 0) {
            // 从目录获取当前章节
            const currentCfi = location.start.cfi;
            const currentChapter = location.toc.find(
              (chapter) => chapter.href && currentCfi.startsWith(chapter.href)
            );
            if (currentChapter) {
              chapterTitle = currentChapter.label;
            }
          }

          // 尝试获取页码信息
          let currentPage = 0;
          let totalPages = 0;

          // 检查是否有页码信息
          if (location.start.displayed && location.start.displayed.page) {
            currentPage = location.start.displayed.page;
          }

          // 尝试从不同位置获取总页数
          if (location.total) {
            totalPages = location.total;
          } else if (this.rendition.location && this.rendition.location.total) {
            totalPages = this.rendition.location.total;
          }

          // 如果有页码信息，显示页码
          if (currentPage > 0 && totalPages > 0) {
            pageInfo.textContent = `${currentPage} / ${totalPages}`;
          } else if (chapterTitle) {
            // 显示章节信息
            pageInfo.textContent = chapterTitle;
          } else {
            // 显示阅读进度（基于 CFI）
            const progress = this.calculateProgress(location);
            pageInfo.textContent = progress;
          }
        } else {
          pageInfo.textContent = "加载中...";
        }
      } catch (error) {
        console.warn("更新页码信息时出错:", error);
        pageInfo.textContent = "阅读中";
      }
    }
  }

  /**
   * 计算阅读进度
   * @param {Object} location 位置信息
   * @returns {string} 进度信息
   */
  calculateProgress(location) {
    try {
      if (!location || !location.start) {
        return "阅读中";
      }

      // 尝试使用 epub.js 的 locations API 获取准确进度
      if (this.book && this.book.locations && this.book.locations.total) {
        const currentCfi = location.start.cfi;
        if (currentCfi) {
          try {
            // 获取当前位置在总位置中的百分比
            const progress = this.book.locations.percentageFromCfi(currentCfi);
            if (
              typeof progress === "number" &&
              !isNaN(progress) &&
              progress >= 0 &&
              progress <= 1
            ) {
              return `${Math.round(progress * 100)}%`;
            }
          } catch (error) {
            console.warn("使用 locations API 计算进度失败:", error);
          }
        }
      }

      // 备用方案1：基于章节信息计算进度
      if (location.toc && location.toc.length > 0) {
        const currentCfi = location.start.cfi;
        const totalChapters = location.toc.length;

        // 找到当前章节
        let currentChapterIndex = 0;
        for (let i = 0; i < location.toc.length; i++) {
          const chapter = location.toc[i];
          if (chapter.href && currentCfi.includes(chapter.href)) {
            currentChapterIndex = i + 1;
            break;
          }
        }

        if (currentChapterIndex > 0) {
          return `第${currentChapterIndex}章/${totalChapters}章`;
        }
      }

      // 备用方案2：基于 spine 信息计算进度
      if (this.book && this.book.spine && this.book.spine.length > 0) {
        const currentCfi = location.start.cfi;
        const totalSpineItems = this.book.spine.length;

        // 尝试从 CFI 中提取 spine 索引
        const spineMatch = currentCfi.match(/\/(\d+)\//);
        if (spineMatch) {
          const spineIndex = parseInt(spineMatch[1], 10) + 1; // CFI 是从0开始的
          if (spineIndex > 0 && spineIndex <= totalSpineItems) {
            return `${spineIndex}/${totalSpineItems}`;
          }
        }
      }

      // 最后备用方案：显示章节标题
      if (location.start.displayed?.chapter) {
        return location.start.displayed.chapter;
      } else if (location.start.displayed?.section) {
        return location.start.displayed.section;
      }

      return "阅读中";
    } catch (error) {
      console.warn("计算进度时出错:", error);
      return "阅读中";
    }
  }

  /**
   * 设置导航按钮状态
   * @param {boolean} enabled 是否启用
   */
  setNavigationButtonState(enabled) {
    const prevBtn = document.getElementById("epub-prev");
    const nextBtn = document.getElementById("epub-next");

    if (prevBtn) {
      prevBtn.style.opacity = enabled ? "1" : "0.5";
      prevBtn.style.cursor = enabled ? "pointer" : "not-allowed";
      prevBtn.disabled = !enabled;
    }

    if (nextBtn) {
      nextBtn.style.opacity = enabled ? "1" : "0.5";
      nextBtn.style.cursor = enabled ? "pointer" : "not-allowed";
      nextBtn.disabled = !enabled;
    }
  }

  /**
   * 更新导航按钮状态（基于当前位置）
   */
  updateNavigationButtonStates() {
    if (!this.rendition) return;

    try {
      const location = this.rendition.currentLocation();
      const prevBtn = document.getElementById("epub-prev");
      const nextBtn = document.getElementById("epub-next");

      if (location && prevBtn && nextBtn) {
        // 如果在第一页，禁用上一页按钮
        if (location.atStart) {
          prevBtn.style.opacity = "0.5";
          prevBtn.style.cursor = "not-allowed";
          prevBtn.disabled = true;
        } else {
          prevBtn.style.opacity = "1";
          prevBtn.style.cursor = "pointer";
          prevBtn.disabled = false;
        }

        // 如果在最后一页，禁用下一页按钮
        if (location.atEnd) {
          nextBtn.style.opacity = "0.5";
          nextBtn.style.cursor = "not-allowed";
          nextBtn.disabled = true;
        } else {
          nextBtn.style.opacity = "1";
          nextBtn.style.cursor = "pointer";
          nextBtn.disabled = false;
        }
      }
    } catch (error) {
      console.warn("更新导航按钮状态时出错:", error);
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 清理防抖定时器
    if (this.updatePageInfoTimeout) {
      clearTimeout(this.updatePageInfoTimeout);
      this.updatePageInfoTimeout = null;
    }

    // 重置导航状态
    this.isNavigating = false;

    if (this.rendition) {
      try {
        this.rendition.destroy();
      } catch (error) {
        console.warn("清理 EPUB 渲染实例时出错:", error);
      }
      this.rendition = null;
    }

    if (this.book) {
      try {
        this.book.destroy();
      } catch (error) {
        console.warn("清理 EPUB 书籍实例时出错:", error);
      }
      this.book = null;
    }
  }

  /**
   * 销毁预览器
   */
  async destroy() {
    try {
      this.cleanup();
      await super.destroy();
    } catch (error) {
      console.warn("销毁 EPUB 预览器时出错:", error);
    }
  }

  /**
   * 获取预览器信息
   * @returns {Object} 预览器信息
   */
  getInfo() {
    return {
      type: this.previewerType,
      name: "EPUB预览器",
      library: "epub.js",
      supportedFormats: ["epub"],
      version: "1.0.0",
    };
  }

  /**
   * 检查文件是否支持
   * @param {string} extension 文件扩展名
   * @returns {boolean}
   */
  static isSupported(extension) {
    return ["epub"].includes(extension.toLowerCase());
  }

  /**
   * 获取支持的文件格式
   * @returns {string[]} 支持的文件格式数组
   */
  static getSupportedFormats() {
    return ["epub"];
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
      hasEpubJS: typeof ePub !== "undefined",
      hasBook: !!this.book,
      hasRendition: !!this.rendition,
    };
  }
}
