/**
 * 文件加载器
 * 负责处理各种文件类型的加载逻辑
 */

import { isNetworkUrl, isAssetsPath, buildFullUrl } from "../utils/Helpers.js";

/**
 * 文件加载器类
 */
export class FileLoader {
  constructor() {
    this.cache = new Map();
  }

  /**
   * 加载文件
   * @param {string} filePath 文件路径
   * @returns {Promise<{data: string|ArrayBuffer, type: string}>}
   */
  async loadFile(filePath) {
    if (!filePath) {
      throw new Error("文件路径不能为空");
    }

    // 检查缓存
    const cacheKey = this.getCacheKey(filePath);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      let result;

      if (isNetworkUrl(filePath)) {
        result = await this.loadNetworkFile(filePath);
      } else {
        result = await this.loadLocalFile(filePath);
      }

      // 缓存结果
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error("加载文件失败:", error);
      throw new Error(`加载文件失败: ${error.message}`);
    }
  }

  /**
   * 加载网络文件
   * @param {string} url 网络URL
   * @returns {Promise<{data: string|ArrayBuffer, type: string}>}
   */
  async loadNetworkFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const data = await this.getResponseData(response, contentType);

    return {
      data,
      type: contentType,
      url,
    };
  }

  /**
   * 加载本地文件
   * @param {string} path 本地路径
   * @returns {Promise<{data: ArrayBuffer, type: string}>}
   */
  async loadLocalFile(path) {
    // 处理assets相对路径
    let fullPath = path;
    if (isAssetsPath(path)) {
      fullPath = buildFullUrl(path);
    }

    // 移动端文件加载优化
    let fetchUrl = `/${path.trim()}`;

    // 检测移动端环境并优化路径
    if (this.isMobile()) {
      // 移动端可能需要不同的路径处理
      console.log("移动端环境检测到，优化文件加载路径");

      // 确保路径格式正确
      if (!fetchUrl.startsWith("/")) {
        fetchUrl = "/" + fetchUrl;
      }
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      data: arrayBuffer,
      type: "application/octet-stream",
      path: fullPath,
    };
  }

  /**
   * 根据内容类型获取响应数据
   * @param {Response} response fetch响应对象
   * @param {string} contentType 内容类型
   * @returns {Promise<string|ArrayBuffer>}
   */
  async getResponseData(response, contentType) {
    // 对于某些类型，可能需要返回URL而不是ArrayBuffer
    if (this.shouldReturnUrl(contentType)) {
      return response.url;
    }

    return response.arrayBuffer();
  }

  /**
   * 判断是否应该返回URL
   * @param {string} contentType 内容类型
   * @returns {boolean}
   */
  shouldReturnUrl(contentType) {
    // Excel文件可以直接使用URL
    return (
      contentType.includes("sheet") ||
      contentType.includes("excel") ||
      contentType.includes("spreadsheet")
    );
  }

  /**
   * 获取缓存键
   * @param {string} filePath 文件路径
   * @returns {string} 缓存键
   */
  getCacheKey(filePath) {
    return filePath;
  }

  /**
   * 清除缓存
   * @param {string} filePath 文件路径，不传则清除所有缓存
   */
  clearCache(filePath = null) {
    if (filePath) {
      this.cache.delete(this.getCacheKey(filePath));
    } else {
      this.cache.clear();
    }
  }

  /**
   * 获取缓存大小
   * @returns {number} 缓存项数量
   */
  getCacheSize() {
    return this.cache.size;
  }

  /**
   * 检查文件是否已缓存
   * @param {string} filePath 文件路径
   * @returns {boolean}
   */
  isCached(filePath) {
    return this.cache.has(this.getCacheKey(filePath));
  }

  /**
   * 预加载文件
   * @param {string[]} filePaths 文件路径数组
   * @returns {Promise<void>}
   */
  async preloadFiles(filePaths) {
    const promises = filePaths.map((path) => this.loadFile(path));
    await Promise.allSettled(promises);
  }

  /**
   * 获取文件信息
   * @param {string} filePath 文件路径
   * @returns {Promise<{size: number, type: string, lastModified: string}>}
   */
  async getFileInfo(filePath) {
    try {
      const response = await fetch(filePath, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return {
        size: parseInt(response.headers.get("content-length") || "0"),
        type: response.headers.get("content-type") || "unknown",
        lastModified: response.headers.get("last-modified") || "unknown",
      };
    } catch (error) {
      console.warn("获取文件信息失败:", error);
      return {
        size: 0,
        type: "unknown",
        lastModified: "unknown",
      };
    }
  }

  /**
   * 检测是否为移动端环境
   * @returns {boolean} 是否为移动端
   */
  isMobile() {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth <= 768
    );
  }
}

// 创建单例实例
export const fileLoader = new FileLoader();
