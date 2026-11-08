export interface SettingVisibleWhen {
  key: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
  notIn?: unknown[];
}

export type SettingItemType =
  | "checkbox"
  | "color"
  | "select"
  | "textinput"
  | "textarea"
  | "number"
  | "slider"
  | "button"
  | "hint";

export interface SettingItem {
  key: string;
  value?: unknown;
  type: SettingItemType;
  title: string;
  description?: string;
  section?: string;
  sectionDescription?: string;
  sectionAction?: {
    key: string;
    label: string;
    title?: string;
  };
  sectionStatus?: {
    state: "unknown" | "success" | "error";
    label?: string;
    title?: string;
    stateKey?: string;
    messageKey?: string;
    checkedAtKey?: string;
    labels?: Partial<Record<"unknown" | "success" | "error", string>>;
  };
  visibleWhen?: SettingVisibleWhen | SettingVisibleWhen[];
  placeholder?: string;
  preview?: {
    label?: string;
    value: string | ((value: unknown) => string);
  };
  height?: string;
  slider?: {
    min: number;
    max: number;
    step: number;
  };
  options?: Record<string | number, string>;
  button?: {
    label: string;
    callback: () => void;
  };
  hasSetting?: boolean;
}

export interface SettingSection<T extends SettingItem = SettingItem> {
  key: string;
  title: string;
  description?: string;
  action?: NonNullable<SettingItem["sectionAction"]>;
  status?: NonNullable<SettingItem["sectionStatus"]>;
  items: T[];
}

export interface SettingsPluginSchema<T extends SettingItem = SettingItem> {
  name: string;
  settings?: T[];
}

const DEFAULT_SECTION_KEY = "__default__";

function cloneDefaultValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return [...value] as T;
  }
  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) } as T;
  }
  return value;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeOptionValue(
  item: SettingItem,
  value: unknown,
  fallback: unknown,
): string {
  const normalized = value == null ? String(fallback ?? "") : String(value);
  if (!item.options || hasOwn(item.options, normalized)) {
    return normalized;
  }
  const fallbackValue = String(fallback ?? "");
  if (hasOwn(item.options, fallbackValue)) {
    return fallbackValue;
  }
  return Object.keys(item.options)[0] ?? fallbackValue;
}

function normalizeNumberValue(
  value: unknown,
  fallback: unknown,
  range?: { min: number; max: number },
): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  const fallbackValue = typeof fallback === "number" ? fallback : Number(fallback);
  let normalized = Number.isFinite(numberValue)
    ? numberValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : 0;

  if (range) {
    normalized = Math.min(range.max, Math.max(range.min, normalized));
  }

  return normalized;
}

export function getSettingDefaultValue(item: SettingItem): unknown {
  return cloneDefaultValue(item.value);
}

export function coerceSettingValue(item: SettingItem, value: unknown): unknown {
  const fallback = getSettingDefaultValue(item);

  switch (item.type) {
    case "checkbox":
      if (typeof value === "boolean") {
        return value;
      }
      if (value == null) {
        return Boolean(fallback);
      }
      if (value === "true" || value === "1") {
        return true;
      }
      if (value === "false" || value === "0") {
        return false;
      }
      return Boolean(value);
    case "select":
      return normalizeOptionValue(item, value, fallback);
    case "color": {
      const color = typeof value === "string" ? value.trim() : "";
      return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
    }
    case "number":
      return normalizeNumberValue(value, fallback);
    case "slider":
      return normalizeNumberValue(value, fallback, item.slider);
    case "textinput":
    case "textarea":
      return value == null ? String(fallback ?? "") : String(value);
    case "button":
    case "hint":
    default:
      return value ?? fallback;
  }
}

export function normalizeSettingsData<T extends SettingItem>(
  items: T[] | undefined,
  savedData: Record<string, unknown> = {},
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const item of items ?? []) {
    if (item.type === "button" || item.type === "hint") {
      continue;
    }

    normalized[item.key] = coerceSettingValue(
      item,
      hasOwn(savedData, item.key) ? savedData[item.key] : item.value,
    );
  }

  return normalized;
}

export function buildDefaultSettingsConfig<T extends SettingsPluginSchema>(
  pluginSchemas: T[],
): Record<string, Record<string, unknown>> {
  const config: Record<string, Record<string, unknown>> = {};

  for (const pluginSchema of pluginSchemas) {
    if (!pluginSchema.settings) {
      continue;
    }

    config[pluginSchema.name] = normalizeSettingsData(pluginSchema.settings);
  }

  return config;
}

export function normalizeSettingsConfig<T extends SettingsPluginSchema>(
  savedConfig: Record<string, unknown> | null | undefined,
  pluginSchemas: T[],
): Record<string, Record<string, unknown>> {
  const normalized = buildDefaultSettingsConfig(pluginSchemas);

  for (const pluginSchema of pluginSchemas) {
    if (!pluginSchema.settings) {
      continue;
    }

    const savedSpace = savedConfig?.[pluginSchema.name];
    normalized[pluginSchema.name] = normalizeSettingsData(
      pluginSchema.settings,
      savedSpace && typeof savedSpace === "object"
        ? (savedSpace as Record<string, unknown>)
        : {},
    );
  }

  return normalized;
}

export function hydrateSettingItems<T extends SettingItem>(
  items: T[] | undefined,
  savedData: Record<string, unknown> = {},
): T[] {
  return (items ?? []).map((item) => ({
    ...item,
    value: coerceSettingValue(
      item,
      hasOwn(savedData, item.key) ? savedData[item.key] : item.value,
    ),
    sectionStatus: hydrateSectionStatus(item.sectionStatus, savedData),
  }));
}

export function getSettingHydrationKeys<T extends SettingItem>(
  items: T[] | undefined,
): string[] {
  const keys = new Set<string>();

  for (const item of items ?? []) {
    keys.add(item.key);
    addOptionalKey(keys, item.sectionStatus?.stateKey);
    addOptionalKey(keys, item.sectionStatus?.messageKey);
    addOptionalKey(keys, item.sectionStatus?.checkedAtKey);
  }

  return [...keys];
}

function addOptionalKey(keys: Set<string>, key: string | undefined): void {
  if (key) {
    keys.add(key);
  }
}

function hydrateSectionStatus(
  status: SettingItem["sectionStatus"],
  savedData: Record<string, unknown>,
): SettingItem["sectionStatus"] {
  if (!status) {
    return undefined;
  }

  const savedState = status.stateKey ? savedData[status.stateKey] : undefined;
  const state =
    savedState === "success" || savedState === "error" || savedState === "unknown"
      ? savedState
      : status.state;
  const label = status.labels?.[state] ?? status.label;
  const messageValue = status.messageKey ? savedData[status.messageKey] : undefined;
  const checkedAtValue = status.checkedAtKey ? savedData[status.checkedAtKey] : undefined;
  const message = typeof messageValue === "string" ? messageValue : "";
  const checkedAt = typeof checkedAtValue === "string" ? checkedAtValue : "";
  const title = message
    ? checkedAt
      ? `${message}（${checkedAt}）`
      : message
    : status.title ?? label;

  return {
    ...status,
    state,
    label,
    title,
  };
}

function getSettingValue(items: SettingItem[], key: string): unknown {
  return items.find((item) => item.key === key)?.value;
}

export function matchesSettingCondition(
  condition: SettingVisibleWhen,
  items: SettingItem[],
): boolean {
  const value = getSettingValue(items, condition.key);

  if (hasOwn(condition, "equals") && value !== condition.equals) {
    return false;
  }
  if (hasOwn(condition, "notEquals") && value === condition.notEquals) {
    return false;
  }
  if (condition.in && !condition.in.includes(value)) {
    return false;
  }
  if (condition.notIn && condition.notIn.includes(value)) {
    return false;
  }

  return true;
}

export function isSettingVisible(item: SettingItem, items: SettingItem[]): boolean {
  if (!item.visibleWhen) {
    return true;
  }

  const conditions = Array.isArray(item.visibleWhen)
    ? item.visibleWhen
    : [item.visibleWhen];
  return conditions.every((condition) => matchesSettingCondition(condition, items));
}

export function buildSettingSections<T extends SettingItem>(
  items: T[] = [],
): SettingSection<T>[] {
  const sections: SettingSection<T>[] = [];
  const sectionMap = new Map<string, SettingSection<T>>();

  for (const item of items) {
    if (!isSettingVisible(item, items)) {
      continue;
    }

    const title = item.section || "";
    const key = title || DEFAULT_SECTION_KEY;
    let section = sectionMap.get(key);

    if (!section) {
      section = {
        key,
        title,
        description: item.sectionDescription,
        items: [],
      };
      sectionMap.set(key, section);
      sections.push(section);
    }

    if (!section.description && item.sectionDescription) {
      section.description = item.sectionDescription;
    }
    if (!section.action && item.sectionAction) {
      section.action = item.sectionAction;
    }
    if (!section.status && item.sectionStatus) {
      section.status = item.sectionStatus;
    }
    section.items.push(item);
  }

  return sections;
}
