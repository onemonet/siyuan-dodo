import type {
  SettingItem,
  SettingItemType,
  SettingVisibleWhen,
} from "@/setting-schema";

declare global {
  type ISettingVisibleWhen = SettingVisibleWhen;
  type TSettingItemType = SettingItemType;
  interface ISettingItem extends SettingItem {}
}

export {};
