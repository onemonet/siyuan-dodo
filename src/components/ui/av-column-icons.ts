/** Mirrors SiYuan app/src/protyle/render/av/col.ts#getColIconByType.
 * SVG symbols are already mounted by SiYuan; no icon assets are bundled. */
export const SIYUAN_AV_TYPE_ICONS: Readonly<Record<string, string>> = {
  text: "iconAlignLeft",
  block: "iconKey",
  number: "iconNumber",
  select: "iconListItem",
  mSelect: "iconList",
  relation: "iconOpen",
  rollup: "iconSearch",
  date: "iconCalendar",
  updated: "iconClock",
  created: "iconClock",
  url: "iconLink",
  mAsset: "iconImage",
  email: "iconEmail",
  phone: "iconPhone",
  location: "iconMapPin",
  template: "iconMath",
  checkbox: "iconCheck",
  lineNumber: "iconOrderedList",
};

export function siyuanAvIcon(type: string): string {
  return SIYUAN_AV_TYPE_ICONS[type] || "iconAttr";
}

/** SiYuan iconListItem is a solid-filled <path> (unlike stroked AV symbols). */
export function siyuanAvIconIsSolid(type: string): boolean {
  return type === "select";
}
