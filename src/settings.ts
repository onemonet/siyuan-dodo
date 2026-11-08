import { fetchSyncPost } from "siyuan";
import { plugin } from "./utils";
import { PluginRegistry } from "./plugin-registry";
import { createLogger } from "./logger";
import { ALWAYS_ON_SECTION_FLAGS } from "./setting-section-features";
import { migrateLegacyFaviconServiceTemplates } from "./lets-link-icon/settings";
import {
  buildDefaultSettingsConfig,
  normalizeSettingsConfig,
} from "./setting-schema";
import type { PluginMetadata } from "./types/plugin";

//配置文件名称
export const CONFIG = "dodo-config";
const logger = createLogger("Settings");

// 动态生成默认配置
function generateDefaultConfig(pluginRegistry: PluginRegistry) {
  const pluginConfigs = pluginRegistry.getPluginConfigs();

  logger.debug("生成默认配置：插件列表", pluginConfigs);
  const config = buildDefaultSettingsConfig(pluginConfigs);
  logger.debug("生成默认配置完成", config);
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeConfigData(
  savedConfig: unknown,
  pluginConfigs: PluginMetadata[],
) {
  const savedRecord = isRecord(savedConfig) ? savedConfig : {};
  const normalizedSettings = normalizeSettingsConfig(savedRecord, pluginConfigs);
  // Preserve custom lists, but automatically upgrade previously saved stock
  // defaults so the new favicon service appears for existing users too.
  const linkIconSettings = normalizedSettings["link-icon"];
  if (linkIconSettings) {
    linkIconSettings.faviconServiceTemplates = migrateLegacyFaviconServiceTemplates(
      linkIconSettings.faviconServiceTemplates,
    );
  }
  const normalizedConfig: Record<string, unknown> = { ...savedRecord };

  for (const pluginMeta of pluginConfigs) {
    if (!pluginMeta.settings) {
      continue;
    }

    const existingSpace = savedRecord[pluginMeta.name];
    normalizedConfig[pluginMeta.name] = {
      ...(isRecord(existingSpace) ? existingSpace : {}),
      ...normalizedSettings[pluginMeta.name],
    };
  }

  // Once section switches are gone, migrate previously disabled subfeatures
  // to enabled so a hidden flag cannot silently disable an inaccessible view.
  // The entire plugin is still controlled by the "开关" page.
  for (const [space, keys] of Object.entries(ALWAYS_ON_SECTION_FLAGS)) {
    const state = normalizedConfig[space];
    if (!isRecord(state)) continue;
    for (const key of keys) state[key] = true;
  }

  return normalizedConfig;
}

let mergedFlag = true;
/**
 * 配置类
 */
class Settings {
  private pluginRegistry = PluginRegistry.getInstance();

  // 获取动态生成的默认配置
  private getDefaultConfig() {
    return generateDefaultConfig(this.pluginRegistry);
  }

  private normalizeLoadedConfig(config = CONFIG) {
    plugin.data[config] = normalizeConfigData(
      plugin.data[config],
      this.pluginRegistry.getPluginConfigs(),
    );
    return plugin.data[config];
  }

  //初始化配置文件
  async initData(config = CONFIG) {
    //配置不存在则按照默认值建立配置文件
    if (
      plugin.data[config] === "" ||
      plugin.data[config] === undefined ||
      plugin.data[config] === null
    ) {
      await plugin.saveData(config, JSON.stringify(this.getDefaultConfig()));
    }

    //插件加载时 merge
    if (!mergedFlag) {
      await this.mergeData();
      mergedFlag = true;
    } else {
      await this.load();
      this.normalizeLoadedConfig(config);
    }
  }

  async resetData() {
    // await plugin.removeData(CONFIG);
    // await PluginRegistry.getInstance().reScanPlugins();
    await plugin.saveData(CONFIG, JSON.stringify(this.getDefaultConfig()));
    await this.load();
  }

  async mergeData() {
    plugin.data[CONFIG] = normalizeConfigData(
      plugin.data[CONFIG],
      this.pluginRegistry.getPluginConfigs(),
    );
    await plugin.saveData(CONFIG, plugin.data[CONFIG]);
    await this.load();
  }

  // setFlag(key: any, value: any, config = CONFIG) {
  //   this.setBySpace(key, "enabled", value, config);
  // }

  // getFlag(key: any, config = CONFIG) {
  //   return this.getBySpace(key, "enabled", config);
  // }

  setBySpace(space: any, key: any, value: any, config = CONFIG) {
    if (!plugin.data[config][space]) {
      plugin.data[config][space] = {};
    }
    plugin.data[config][space][key] = value;
  }
  getBySpace(space: any, key: any, config = CONFIG) {
    return plugin.data[config] && plugin.data[config][space]?.[key];
  }

  set(key: any, value: any, config = CONFIG) {
    plugin.data[config][key] = value;
  }

  get(key: any, config = CONFIG) {
    return plugin.data[config]?.[key];
  }

  async load(config = CONFIG) {
    await plugin.loadData(config);
    if (config === CONFIG) {
      this.normalizeLoadedConfig(config);
    }
  }

  async save(config = CONFIG) {
    if (config === CONFIG) {
      this.normalizeLoadedConfig(config);
    }
    await plugin.saveData(config, plugin.data[config]);
    await this.load();
  }

  async saveTo(config: string) {
    plugin.data[config]["docBuilder"] = plugin.data[CONFIG]["docBuilder"];
    await plugin.saveData(CONFIG, plugin.data[config]);
  }

  async remove(config = CONFIG) {
    await plugin.removeData(config);
  }

  async rename(config: string, newname: string) {
    await fetchSyncPost("/api/file/renameFile", {
      path: `/data/storage/petal/siyuan-plugins-index/${config}`,
      newPath: `/data/storage/petal/siyuan-plugins-index/${newname}`,
    });
  }

  loadSettings(data: any) {
    this.set("icon", data.icon);
    this.set("depth", data.depth);
    this.set("listType", data.listType);
    this.set("linkType", data.linkType);
    this.set("fold", data.fold);
    this.set("col", data.col);
    this.set("autoUpdate", data.autoUpdate);
  }

  loadSettingsforOutline(data: any) {
    this.set("at", data.at);
    this.set("outlineType", data.outlineType);
    this.set("outlineAutoUpdate", data.outlineAutoUpdate);
    this.set("listTypeOutline", data.listTypeOutline);
  }
}

export const settings: Settings = new Settings();
