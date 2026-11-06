/**
 * Math.js 加载器
 * 单例模式，确保 Math.js 库只加载一次
 */

import { MATHJS_CONFIG, ERROR_MESSAGES } from "../constants";

export type MathJsLoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Math.js 加载器类
 */
class MathJsLoaderClass {
  private state: MathJsLoadState = 'idle';
  private loadPromise: Promise<boolean> | null = null;
  private listeners: Array<() => void> = [];

  /**
   * 获取当前加载状态
   */
  getState(): MathJsLoadState {
    return this.state;
  }

  /**
   * 检查是否已加载
   */
  isLoaded(): boolean {
    return this.state === 'loaded' && !!(window as any).math;
  }

  /**
   * 检查是否加载失败
   */
  isError(): boolean {
    return this.state === 'error';
  }

  /**
   * 获取 math 实例
   */
  getMath(): any {
    return (window as any).math;
  }

  /**
   * 加载 Math.js 库
   * @returns Promise<boolean> 加载成功返回 true
   */
  async load(): Promise<boolean> {
    // 如果已经加载成功
    if (this.isLoaded()) {
      return true;
    }

    // 如果正在加载，返回现有的 Promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // 开始加载
    this.state = 'loading';
    this.loadPromise = this.doLoad();
    
    const result = await this.loadPromise;
    this.notifyListeners();
    return result;
  }

  /**
   * 实际加载逻辑
   */
  private doLoad(): Promise<boolean> {
    return new Promise((resolve) => {
      // 检查是否已经存在
      if ((window as any).math) {
        this.state = 'loaded';
        resolve(true);
        return;
      }

      // 尝试本地加载
      const script = document.createElement('script');
      script.src = MATHJS_CONFIG.LOCAL_PATH;
      script.async = false;
      
      script.onload = () => {
        this.state = 'loaded';
        console.log('Math.js 加载成功（本地）');
        resolve(true);
      };
      
      script.onerror = () => {
        console.error('Math.js 本地加载失败，尝试 CDN');
        this.loadFromCDN(resolve);
      };
      
      document.head.appendChild(script);
    });
  }

  /**
   * 从 CDN 加载
   */
  private loadFromCDN(resolve: (value: boolean) => void) {
    const cdnScript = document.createElement('script');
    cdnScript.src = MATHJS_CONFIG.CDN_PATH;
    cdnScript.async = false;
    
    cdnScript.onload = () => {
      this.state = 'loaded';
      console.log('Math.js CDN 加载成功');
      resolve(true);
    };
    
    cdnScript.onerror = () => {
      this.state = 'error';
      console.error(ERROR_MESSAGES.MATHJS_LOAD_FAILED);
      resolve(false);
    };
    
    document.head.appendChild(cdnScript);
  }

  /**
   * 添加加载完成监听器
   */
  onLoad(callback: () => void) {
    if (this.isLoaded()) {
      callback();
    } else {
      this.listeners.push(callback);
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners() {
    this.listeners.forEach(cb => cb());
    this.listeners = [];
  }
}

// 导出单例
export const MathJsLoader = new MathJsLoaderClass();
