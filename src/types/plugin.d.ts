import type { SettingItem, SettingVisibleWhen } from "@/setting-schema";

export type PluginSettingVisibleWhen = SettingVisibleWhen;

export interface PluginSettingItem extends SettingItem {}

export interface PluginSettings {
  [groupName: string]: PluginSettingItem[];
}

export interface SubPlugin {
  // Core properties (will be set from PluginMetadata)
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  enabled?: boolean;

  onload(): void;
  onunload(): void;
  onLayoutReady?(): void;
  onDataChanged?(context?: { group?: string; key?: string; value?: unknown }): void | Promise<void>;
  onSettingAction?(actionKey: string, context?: { group?: string; value?: unknown }): void | Promise<void>;

  // Event handlers
  addMenuItem?(menu: Menu): void;
  editortitleiconEvent?(detail: any): void;
  mobilekeyboardshowEvent?(detail: any): void;
  mobilekeyboardhideEvent?(detail: any): void;
  switchProtyleEvent?(detail: any): void;
  openSiyuanUrlPluginEvent?(detail: any): void;
  blockIconEvent?(detail: any): void;
  linkMenuEvent?(detail: any): void;
  updateProtyleToolbar?(toolbar: any[]): any[];
  onProtyleLoaded?(event): void;
}

export interface PluginMetadata {
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  author?: string;
  enabled?: boolean;
  defaultConfig?: Record<string, any>;
  settings?: PluginSettingItem[];
  reference?: string;
}
