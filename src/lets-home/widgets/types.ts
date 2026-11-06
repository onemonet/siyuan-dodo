import type { HomeWidgetConfig } from "../config";

export type WidgetConfigChange = {
  field: keyof HomeWidgetConfig;
  value: string;
};
