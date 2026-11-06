import { Scan } from "lucide-react";
import React from "react";
import type { ToolbarTool } from "../toolbar/types";

const focusSelection: ToolbarTool = {
  id: "focus-selection",
  label: "缩放至选区",
  icon: <Scan size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when: context => context.elements.length > 0,
  run: context => { context.api.scrollToContent(context.elements, { fitToContent: true, animate: true }); },
};
export default focusSelection;
