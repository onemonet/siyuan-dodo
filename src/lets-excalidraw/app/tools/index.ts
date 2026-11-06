import focusSelection from "./focus-selection";
import mindMapTool from "./mind-map";
import align from "./align";
import arrange from "./arrange";
import shapeSwitch from "./shape-switch";
import booleanTool from "./boolean";
import editSvg from "./edit-svg";
import repeat from "./repeat";
import elementFilter from "./element-filter";
import textTransform from "./text-transform";
import deleteSelection from "./delete-selection";
import graphTidy from "./graph-tidy";
import copyMermaid from "./copy-mermaid";
import background from "./background";
import stroke from "./stroke";
import textStyle from "./text-style";
import arrowStyle from "./arrow-style";
import type { InteractionFeature, ToolbarTool } from "../toolbar/types";
import rightDrag from "../interactions/right-drag";
import spacingHandles from "../interactions/spacing-handles";
import toolStatePersistence from "../interactions/tool-state-persistence";
import minimap from "../interactions/minimap";
import autoDeleteBoundArrows from "../interactions/auto-delete-bound-arrows";
import leftAppMenuToggle from "../interactions/left-panel-toggle";
import siyuanLinkSearch from "../interactions/siyuan-link-search";
import siyuanBlockMention from "../interactions/siyuan-block-mention";
import iconLibrary from "../interactions/icon-library";
import mindMap from "../interactions/mind-map";

export const toolbarTools: readonly ToolbarTool[] = [focusSelection, mindMapTool, align, arrange, elementFilter, repeat, shapeSwitch, booleanTool, editSvg, graphTidy, copyMermaid, textStyle, arrowStyle, background, stroke, textTransform, deleteSelection];
/** Each module is independently mountable and switchable; opt-in on first migration. */
export const interactionFeatures: readonly InteractionFeature[] = [
  rightDrag, spacingHandles, toolStatePersistence, minimap,
  autoDeleteBoundArrows, leftAppMenuToggle, siyuanLinkSearch, siyuanBlockMention, iconLibrary, mindMap,
];
