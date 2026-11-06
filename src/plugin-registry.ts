import { settings } from "./settings";
import { createLogger } from "./logger";
import { PluginMetadata, SubPlugin } from "./types/plugin";
import { showMessage } from "siyuan";

const logger = createLogger("PluginRegistry");

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, SubPlugin> = new Map();
  private pluginConfigs: Map<string, PluginMetadata> = new Map();
  private loadedPluginNames: Set<string> = new Set();

  private constructor() {}

  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  async reScanPlugins() {
    await this.unloadAllPlugins();
    if (this.loadedPluginNames.size) throw new Error("部分子模块未能停用，请处理保存错误后重试扫描。");
    this.plugins.clear();
    this.pluginConfigs.clear();
    this.loadedPluginNames.clear();
    logger.debug("重新扫描插件");
    await this.scanPlugins();
  }

  async scanPlugins() {
    logger.debug("开始扫描插件");
    // 读取所有符合模式的文件
    const pluginFiles = import.meta.glob(
      ["./lets-*/index.ts", "./lets-*/plugin.ts"],
      {
        eager: true,
        import: "default",
      }
    );

    // 使用 Map 按插件名分组
    const pluginMap = new Map<string, { config?: any; plugin?: any }>();

    Object.entries(pluginFiles).forEach(([path, module]) => {
      // 注意这里的正则：lets- 后面是插件名
      const match = path.match(/\.\/lets-([^\/]+)\/(index|plugin)\.ts$/);
      if (match) {
        const [, pluginName, fileType] = match;

        if (!pluginMap.has(pluginName)) {
          pluginMap.set(pluginName, {});
        }

        const pluginData = pluginMap.get(pluginName)!;
        if (fileType === "index") {
          pluginData.config = module;
        } else {
          pluginData.plugin = module;
        }
      }
    });

    // 注册所有插件
    for (const [pluginName, { config, plugin }] of pluginMap) {
      if (config && plugin) {
        // 同时有 index.ts 和 plugin.ts
        // config 是插件类，plugin 是元数据对象
        this.registerPluginWithConfig(pluginName, plugin, config);
      } else if (config && !plugin) {
        // 只有 index.ts（config 是插件类）
        this.registerPluginWithConfig(pluginName, {
          name: pluginName,
          displayName: pluginName,
          enabled: false,
        }, config);
      } else {
        console.warn(`插件 ${pluginName} 缺少必要文件`, {
          hasConfig: !!config,
          hasPlugin: !!plugin,
        });
      }
    }
  }

  private registerPluginWithConfig(
    name: string,
    config: PluginMetadata,
    PluginClass: any
  ) {
    try {
      // Register configuration
      this.registerPluginConfig(name, config);

      // Instantiate plugin
      const pluginInstance = new PluginClass();

      // Copy metadata from config to plugin instance
      pluginInstance.name = config.name;
      pluginInstance.displayName = config.displayName;
      pluginInstance.description = config.description;
      pluginInstance.version = config.version;
      pluginInstance.enabled =
        settings.getBySpace(pluginInstance.name, "enabled") ??
        config.enabled ??
        false;
      // enabled will be read from settings when needed

      // Register plugin
      this.registerPlugin(pluginInstance);
    } catch (error) {
      console.warn(`Failed to load plugin ${name}:`, error);
    }
  }

  // Initialize enabled plugins
  async initializeEnabledPlugins() {
    const plugins = this.getAllPlugins();
    for (const plugin of plugins) {
      if (plugin.enabled) {
        await this.loadPlugin(plugin);
      }
    }
  }

  // Unload disabled plugins
  async unloadDisabledPlugins() {
    const plugins = this.getAllPlugins();
    for (const plugin of plugins) {
      if (!plugin.enabled) {
        await this.unloadPluginInstance(plugin);
      }
    }
  }

  async beginPlugin(key: string) {
    logger.debug("启用插件", { key });
    const plugin = this.getPlugin(key);
    if (plugin) {
      plugin.enabled = true;
      await this.loadPlugin(plugin);
      if (plugin.enabled) await plugin.onLayoutReady?.();
    }
  }

  async unloadPlugin(key: string) {
    const plugin = this.getPlugin(key);
    if (plugin) {
      plugin.enabled = false;
      await this.unloadPluginInstance(plugin);
    }
  }

  async unloadAllPlugins() {
    const plugins = this.getAllPlugins();
    for (const plugin of plugins) {
      await this.unloadPluginInstance(plugin);
    }
  }

  registerPlugin(plugin: SubPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  registerPluginConfig(name: string, config: PluginMetadata): void {
    this.pluginConfigs.set(name, config);
  }

  getPlugin(name: string): SubPlugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): SubPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginConfigs(): PluginMetadata[] {
    return Array.from(this.pluginConfigs.values());
  }

  getPluginConfig(name: string): PluginMetadata | undefined {
    return this.pluginConfigs.get(name);
  }

  isPluginEnabled(name: string): boolean {
    const plugin = this.plugins.get(name);
    return plugin ? plugin.enabled : false;
  }

  enablePlugin(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = true;
    }
  }

  disablePlugin(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
    }
  }

  private async loadPlugin(plugin: SubPlugin) {
    const pluginName = plugin.name;
    if (!pluginName) {
      console.warn("Skip loading plugin without name", plugin);
      return;
    }

    if (this.loadedPluginNames.has(pluginName)) {
      return;
    }

    try {
      await plugin.onload();
      this.loadedPluginNames.add(pluginName);
    } catch (error) {
      console.error(`Error in onload for plugin ${pluginName}:`, error);
      plugin.enabled = false;
      settings.setBySpace(pluginName, "enabled", false);
      showMessage(`${plugin.displayName || pluginName} 启用失败：${error instanceof Error ? error.message : error}`, 6000, "error");
    }
  }

  private async unloadPluginInstance(plugin: SubPlugin) {
    const pluginName = plugin.name;
    if (!pluginName || !this.loadedPluginNames.has(pluginName)) {
      return;
    }

    try {
      await plugin.onunload();
      this.loadedPluginNames.delete(pluginName);
    } catch (error) {
      console.error(`Error in onunload for plugin ${pluginName}:`, error);
      plugin.enabled = true;
      settings.setBySpace(pluginName, "enabled", true);
      showMessage(`${plugin.displayName || pluginName} 停用失败：${error instanceof Error ? error.message : error}`, 6000, "error");
    }
  }
}
