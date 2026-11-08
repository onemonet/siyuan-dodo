import type { PluginSettingItem } from "@/types/plugin";

export const LINK_ICON_CUSTOM_FILE = "link-icon-custom";
export const LINK_ICON_CUSTOM_STYLE_ID = "dodo-link-icon-style";
export const LINK_ICON_DOC_STYLE_ID = "dodo-link-icon-doc-style";
/** Original three-service default, retained only for upgrading untouched settings. */
export const LEGACY_DEFAULT_FAVICON_SERVICE_TEMPLATES = [
  "https://favicon.im/${domain}",
  "https://www.google.com/s2/favicons?domain=${domain}&sz=64",
  "https://icons.duckduckgo.com/ip3/${domain}.ico",
].join("\n");

/** Ordered fallback services; earlier successful sources take priority. */
export const DEFAULT_FAVICON_SERVICE_TEMPLATES = [
  "https://www.boltp.com/favicon/${domain}.png",
  "https://a.favicon.im/${domain}",
  "https://www.google.com/s2/favicons?domain=${domain}&sz=64",
  "https://icons.duckduckgo.com/ip3/${domain}.ico",
].join("\n");

/** Upgrade only the old stock default, never override user-edited service lists. */
export function migrateLegacyFaviconServiceTemplates(value: unknown): unknown {
  return value === LEGACY_DEFAULT_FAVICON_SERVICE_TEMPLATES
    ? DEFAULT_FAVICON_SERVICE_TEMPLATES
    : value;
}

export interface LinkIconConfig {
  insertDocRefIcon: boolean;
  insertStaticRefIcon: boolean;
  showMissingDocRefIcon: boolean;
  showExternalIcon: boolean;
  autoFetchIcon: boolean;
  faviconServiceTemplates: string;
}

export const defaultLinkIconConfig: LinkIconConfig = {
  insertDocRefIcon: true,
  insertStaticRefIcon: false,
  showMissingDocRefIcon: true,
  showExternalIcon: true,
  autoFetchIcon: false,
  faviconServiceTemplates: DEFAULT_FAVICON_SERVICE_TEMPLATES,
};

export const linkIconSettings: PluginSettingItem[] = [
  {
    type: "checkbox",
    section: "文档引用图标",
    title: "显示动态锚文本图标",
    description: "为动态块引用（显示文档标题的内链，data-subtype='d'）在文字前显示文档图标。",
    key: "insertDocRefIcon",
    value: defaultLinkIconConfig.insertDocRefIcon,
  },
  {
    type: "checkbox",
    section: "文档引用图标",
    title: "显示静态锚文本图标",
    description: "为静态块引用（自定义锚文本的内链，data-subtype='s'）在文字前显示文档图标。",
    key: "insertStaticRefIcon",
    value: defaultLinkIconConfig.insertStaticRefIcon,
  },
  {
    type: "checkbox",
    section: "文档引用图标",
    title: "显示已删除文档引用图标",
    description: "为已删除或不存在的文档引用在文字前显示缺失文档图标。",
    key: "showMissingDocRefIcon",
    value: defaultLinkIconConfig.showMissingDocRefIcon,
  },
  {
    type: "checkbox",
    section: "外链图标",
    title: "显示外链图标",
    description: "为外部链接显示站点图标（使用本地自定义图标库及内置规则）。",
    key: "showExternalIcon",
    value: defaultLinkIconConfig.showExternalIcon,
  },
  {
    type: "checkbox",
    section: "外链图标",
    visibleWhen: { key: "showExternalIcon", equals: true },
    title: "自动抓取外链站点图标",
    description: "没有本地图标规则时，自动抓取外链目标站点的 favicon 并缓存到本地（需同时开启「显示外链图标」）。",
    key: "autoFetchIcon",
    value: defaultLinkIconConfig.autoFetchIcon,
  },
  {
    type: "textarea",
    section: "外链图标",
    visibleWhen: [
      { key: "showExternalIcon", equals: true },
      { key: "autoFetchIcon", equals: true },
    ],
    title: "Favicon 服务",
    description: "一行一个 URL 模板，按顺序尝试；支持 ${domain} 或 {domain} 占位符，空行和 # 开头的行会被忽略。",
    key: "faviconServiceTemplates",
    value: defaultLinkIconConfig.faviconServiceTemplates,
    placeholder: DEFAULT_FAVICON_SERVICE_TEMPLATES,
    height: "120px",
  },
];
