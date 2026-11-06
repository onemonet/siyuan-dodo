import type { ComponentType, ReactNode } from "react";
import type { ToolbarPreferences } from "../../toolbar-preferences";

export interface SelectionContext {
  api: any;
  elements: readonly any[];
  appState: any;
}

export interface ToolAction {
  id: string;
  label: string;
  icon?: ReactNode;
  when?: (context: SelectionContext) => boolean;
  separatorBefore?: boolean;
  run: (context: SelectionContext) => void | Promise<void>;
}

export interface ToolbarTool extends Omit<ToolAction, "run" | "icon"> {
  icon?: ReactNode | ((context: SelectionContext) => ReactNode);
  run?: ToolAction["run"];
  items?: readonly ToolAction[];
  layout?: "list" | "grid";
  columns?: number | ((context: SelectionContext) => number);
  Panel?: ComponentType<{ context: SelectionContext; close: () => void }>;
}

export const resolveToolIcon = (tool: ToolbarTool, context: SelectionContext): ReactNode =>
  typeof tool.icon === "function" ? tool.icon(context) : tool.icon;

export interface InteractionFeature {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  mount: (api: any) => () => void;
}

export type SavePreferences = (patch: Partial<ToolbarPreferences>) => Promise<ToolbarPreferences>;
