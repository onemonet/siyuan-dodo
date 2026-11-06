/**
 * iframe 模板服务
 * 负责生成不同预览模式的 iframe HTML
 */

import { settings } from "../../settings";
import pluginMetadata from "../plugin";

export const FILE_DEFAULT_HEIGHT_SETTING_KEY = "file-default-height";
export const DEFAULT_FILE_PREVIEW_HEIGHT = 600;

export interface TemplateConfig {
  label: string;
  icon: string;
  html?: string;
  heightKey?: string;
  defaultHeight?: number;
  sandbox?: boolean;
  useAssetPath?: boolean;
}

export const TEMPLATES: Record<string, TemplateConfig> = {
  file: {
    label: "文件块",
    icon: "iconFile",
    html: "file.html",
    heightKey: FILE_DEFAULT_HEIGHT_SETTING_KEY,
    defaultHeight: DEFAULT_FILE_PREVIEW_HEIGHT,
    sandbox: true,
  },
};

const SANDBOX_ATTRS = "allow-downloads allow-forms allow-modals allow-popups allow-presentation allow-scripts";

export class IframeTemplateService {
  static getTemplates(): Record<string, TemplateConfig> {
    return TEMPLATES;
  }

  private static getTemplateHeight(template: TemplateConfig): number {
    if (template.heightKey) {
      const settingValue = settings.getBySpace(pluginMetadata.name, template.heightKey);
      if (settingValue && typeof settingValue === 'number' && settingValue > 0) {
        return settingValue;
      }
    }
    return template.defaultHeight || 400;
  }

  private static getDefaultHeight(): number {
    const settingValue = settings.getBySpace(
      pluginMetadata.name,
      FILE_DEFAULT_HEIGHT_SETTING_KEY,
    );
    if (settingValue && typeof settingValue === 'number' && settingValue > 0) {
      return settingValue;
    }
    return DEFAULT_FILE_PREVIEW_HEIGHT;
  }

  static generateIframe(mode: string, assetPaths: string[], blockId?: string): string {
    const template = TEMPLATES[mode];
    
    if (template) {
      return this.buildFromTemplate(template, blockId);
    }
    
    return this.buildAssetPreview(assetPaths, { height: this.getDefaultHeight(), sandbox: true });
  }

  private static buildFromTemplate(template: TemplateConfig, blockId?: string): string {
    const src = `/plugins/siyuan-dodo/preview/${template.html}?blockId=${blockId || ''}`;
    const height = this.getTemplateHeight(template);
    return this.buildIframe(src, {
      height,
      sandbox: template.sandbox,
    });
  }

  private static buildAssetPreview(
    assetPaths: string[],
    options?: { height?: number; sandbox?: boolean }
  ): string {
    const src = assetPaths.length > 0 ? assetPaths[0] : "about:blank";
    return this.buildIframe(src, {
      height: options?.height || this.getDefaultHeight(),
      sandbox: options?.sandbox ?? true,
    });
  }

  private static buildIframe(
    src: string, 
    options?: { height?: number; sandbox?: boolean }
  ): string {
    const height = options?.height || 400;
    const useSandbox = options?.sandbox ?? true;
    const sandboxAttr = useSandbox ? `sandbox="${SANDBOX_ATTRS}"` : '';
    
    return `<iframe ${sandboxAttr} src="${src}" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width: 100%; height: ${height}px;"></iframe>`.trim();
  }
}
