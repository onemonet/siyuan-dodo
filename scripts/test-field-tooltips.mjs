import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ configFile:false,server:{middlewareMode:true},appType:"custom" });
try {
  const { TIMELINE_FIELD_DEFINITIONS } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/field-mapping.ts");
  const { MAP_FIELD_DEFINITIONS } = await server.ssrLoadModule("/src/lets-database-view/map/map-field-schema.ts");
  assert.equal(TIMELINE_FIELD_DEFINITIONS.length,10,"Timeline shows 10 mapping fields, after media simplification");
  assert.equal(MAP_FIELD_DEFINITIONS.length,2);
  for (const item of [...TIMELINE_FIELD_DEFINITIONS,...MAP_FIELD_DEFINITIONS]) {
    assert.ok(typeof item.description === "string" && item.description.trim() !== "", `${item.label} must have a tooltip`);
    assert.ok([...item.description].length <= 34, `${item.label}: tooltip should be short, not a paragraph`);
    assert.ok(!item.description.includes("\n"), `${item.label}: tooltip must remain on a single line`);
  }
  assert.match(TIMELINE_FIELD_DEFINITIONS.find(item=>item.key==="endDate")?.description || "",/同列/,
    "Explain that one AV date range column can supply both date endpoints");
  assert.match(TIMELINE_FIELD_DEFINITIONS.find(item=>item.key==="displayDate")?.description || "",/不改变实际日期/);
  const helper=await readFile("src/components/ui/FieldHelp.svelte","utf8");
  assert.match(helper,/class="dodo-field-help"/,
    "The info button must not use SiYuan pseudo-element tooltips inside a clipped panel");
  assert.match(helper,/document\.body\.appendChild\(tooltip\)/,
    "Tooltip must be portal-mounted outside any scrollable or clipped ancestor");
  assert.match(helper,/position: fixed/, "Tooltip is positioned relative to the viewport");
  assert.match(helper,/window\.innerWidth - bounds\.width - margin/,
    "Tooltip must be clamped within viewport horizontally");
  assert.match(helper,/window\.innerHeight - margin/,
    "Tooltip must choose an onscreen vertical placement");
  assert.match(helper,/onDestroy\(hideTooltip\)/,
    "Tooltip and global event listeners must be cleaned up when dialog closes");
  assert.match(helper,/on:focus=\{showTooltip\} on:blur=\{hideTooltip\}/,
    "Keyboard focus shows and hides the help popup");
  assert.match(helper,/aria-label=\{description\}/,"Native SiYuan tooltip text comes from aria-label");
  assert.match(helper,/href="#iconInfo"/,"Use native SiYuan outlined info glyph");
  assert.match(helper,/type="button"/,"Info icon must not submit forms");
  assert.match(helper,/:focus-visible/,"Keyboard users should see focus feedback");
  const mapping=await readFile("src/components/ui/FieldMapping.svelte","utf8");
  assert.match(mapping,/\{#if field\.description\}<FieldHelp description=\{field\.description\}\/>/,
    "Help icon appears immediately after the mapping field name");
  assert.match(mapping,/mapping\?\.\[field\.key\] \|\| ""/,"Do not regress reactive empty keyID selection");
  assert.match(mapping,/allowEmpty=\{!field\.required\}/);
  const timeline=await readFile("src/lets-custom-block/timeline/ui/TimelineSettingsPanel.svelte","utf8");
  assert.ok((timeline.match(/<FieldHelp description=/g)||[]).length>=6,
    "Timeline source and appearance field labels also receive short information tooltips");
  assert.match(timeline,/悬浮信息图标可查看各字段的作用/);
  assert.match(mapping,/align-items: center; gap: 5px; line-height: 20px;/,
    "Field name and tooltip info icon must share an explicitly centered line height");
  console.log("PASS: field help portal escapes clipped panels, clamps viewport edges, aligns labels and info icons, cleans up on dialog close");
} finally { await server.close(); }
