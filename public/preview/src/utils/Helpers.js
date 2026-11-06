/**
 * 工具函数集合
 */

import { FILE_ICONS, DEFAULT_FILE_ICON } from "./Constants.js";

/**
 * 获取文件扩展名
 * @param {string} filePath 文件路径
 * @returns {string} 扩展名（小写）
 */
export function getFileExtension(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return "";
  }
  const fileName = filePath.split("/").pop() || filePath;
  return fileName.split(".").pop().toLowerCase();
}

/**
 * 获取文件名（不含路径）
 * @param {string} filePath 文件路径
 * @returns {string} 文件名
 */
export function getFileName(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return "";
  }
  const fileName = filePath.split("/").pop() || filePath;
  return removeSiyuanSuffix(fileName);
}

/**
 * 去除文件名中的思源笔记自动添加的后缀
 * 例如：document-20251126141807-8dhtxg7.pdf -> document.pdf
 * @param {string} fileName 原始文件名
 * @returns {string} 去除后缀后的文件名
 */
export function removeSiyuanSuffix(fileName) {
  // 匹配思源笔记的命名模式：文件名-YYYYMMDDHHMMXX-xxxxxxx.扩展名
  const pattern = /^(.+)-\d{14}-[a-z0-9]{7}(\.[^.]+)$/;
  const match = fileName.match(pattern);

  if (match) {
    return match[1] + match[2];
  }

  return fileName;
}

/**
 * 获取文件图标路径
 * @param {string} extension 文件扩展名
 * @returns {string} 图标路径
 */
export function getFileIconPath(extension) {
  return FILE_ICONS[extension] || DEFAULT_FILE_ICON;
}

/**
 * 检查是否为网络URL
 * @param {string} path 路径
 * @returns {boolean} 是否为网络URL
 */
export function isNetworkUrl(path) {
  if (!path || typeof path !== "string") {
    return false;
  }
  return (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("//")
  );
}

/**
 * 检查是否为assets相对路径
 * @param {string} path 路径
 * @returns {boolean} 是否为assets相对路径
 */
export function isAssetsPath(path) {
  if (!path || typeof path !== "string") {
    return false;
  }
  return path.startsWith("assets/");
}

/**
 * 将assets相对路径转换为完整URL
 * @param {string} assetsPath assets相对路径
 * @returns {string} 完整URL
 */
export function buildFullUrl(assetsPath) {
  if (!isAssetsPath(assetsPath)) {
    return assetsPath;
  }
  const currentOrigin = window.location.origin;
  return `${currentOrigin}/${assetsPath}`;
}

/**
 * 创建下载链接
 * @param {string} filePath 文件路径
 * @param {string} fileName 文件名
 */
export async function createDownloadLink(filePath, fileName) {
  try {
    console.log("开始下载文件:", filePath, fileName);

    // 如果是网络URL，需要先获取文件内容
    if (isNetworkUrl(filePath)) {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      let downloadSuccess = false;
      let lastError = null;

      // 方式1: 使用download属性
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 等待一下看是否真的开始下载
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log("下载方式1执行完成");
        downloadSuccess = true;
      } catch (error1) {
        console.warn("下载方式1失败:", error1);
        lastError = error1;
      }

      // 方式2: 使用parent窗口（如果在iframe中）
      if (!downloadSuccess && window.parent && window.parent !== window) {
        try {
          const parentLink = window.parent.document.createElement("a");
          parentLink.href = url;
          parentLink.download = fileName;
          parentLink.style.display = "none";
          window.parent.document.body.appendChild(parentLink);
          parentLink.click();
          window.parent.document.body.removeChild(parentLink);

          await new Promise((resolve) => setTimeout(resolve, 500));
          console.log("下载方式2执行完成");
          downloadSuccess = true;
        } catch (error2) {
          console.warn("下载方式2失败:", error2);
          lastError = error2;
        }
      }

      // 方式3: 使用window.open
      if (!downloadSuccess) {
        try {
          const newWindow = window.open(url, "_blank");
          if (newWindow) {
            console.log("下载方式3：在新窗口中打开文件");
            downloadSuccess = true;
          } else {
            throw new Error("无法打开新窗口");
          }
        } catch (error3) {
          console.warn("下载方式3失败:", error3);
          lastError = error3;
        }
      }

      // 方式4: 直接在新标签页打开原始URL
      if (!downloadSuccess) {
        try {
          window.open(filePath, "_blank");
          console.log("下载方式4：在新标签页打开原始文件URL");
          downloadSuccess = true;
        } catch (error4) {
          console.warn("下载方式4失败:", error4);
          lastError = error4;
        }
      }

      // 方式5: 复制链接到剪贴板并提示用户
      if (!downloadSuccess) {
        try {
          await navigator.clipboard.writeText(filePath);
          alert(
            `由于浏览器限制，无法直接下载文件。\n文件链接已复制到剪贴板，请手动在新标签页中打开：\n${filePath}`
          );
          console.log("文件链接已复制到剪贴板");
          downloadSuccess = true;
        } catch (error5) {
          console.error("复制到剪贴板失败:", error5);
          lastError = error5;
          alert(
            `由于浏览器限制，无法直接下载文件。\n请手动复制以下链接在新标签页中打开：\n${filePath}`
          );
        }
      }

      // 清理对象URL
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      if (!downloadSuccess && lastError) {
        throw lastError;
      }
    } else {
      // 本地文件直接下载
      const link = document.createElement("a");
      link.href = filePath;
      link.download = fileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log("本地文件下载完成");
    }
  } catch (error) {
    console.error("下载文件失败:", error);

    // 最终降级方案：直接在新窗口打开文件
    try {
      window.open(filePath, "_blank");
    } catch (finalError) {
      console.error("所有下载方式都失败:", finalError);
      alert(`下载失败，请手动复制以下链接在新标签页中打开：\n${filePath}`);
    }
  }
}

/**
 * 安全地销毁预览器实例
 * @param {Object} previewer 预览器实例
 */
export function safeDestroyPreviewer(previewer) {
  if (!previewer) {
    return;
  }

  try {
    if (typeof previewer.destroy === "function") {
      previewer.destroy();
    }
  } catch (error) {
    console.warn("清理预览器时出错:", error);
  }
}

/**
 * 清空容器内容
 * @param {string} containerId 容器ID
 */
export function clearContainer(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = "";
  }
}

/**
 * 创建加载消息元素
 * @param {string} message 消息内容
 * @returns {string} HTML字符串
 */
export function createLoadingMessage(message) {
  return `<div class="loading-message">${message}</div>`;
}

/**
 * 创建错误消息元素
 * @param {string} message 消息内容
 * @returns {string} HTML字符串
 */
export function createErrorMessage(message) {
  return `<div class="error-message">${message}</div>`;
}

/**
 * 防抖函数
 * @param {Function} func 要防抖的函数
 * @param {number} wait 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func 要节流的函数
 * @param {number} limit 限制时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
