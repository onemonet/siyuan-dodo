import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (file) => readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const index = read("src/index.ts");
const svelte = read("src/setting.svelte");
const section = read("src/libs/setting-panel.svelte");
const item = read("src/libs/setting-item.svelte");
const visual = read("src/lets-database-view/visual/visual-settings.ts");
assert(index.includes('import SettingPannel from "@/setting.svelte"'));
assert(index.includes("new SettingPannel({ target })"));
assert(index.includes("pannel?.$destroy()"));
assert(!index.includes("mountDodoUI") && !index.includes("SettingsApp"));
assert(visual.includes("new CalendarSettingsPanel({ target, props: {"));
assert(visual.includes("new GanttSettingsPanel({ target, props: {"));
assert(visual.includes("panel?.$destroy()"));
assert(!visual.includes("mountDodoUI") && !visual.includes("@heroui/"));
assert(visual.includes("DatabaseViewConfigStore.updateView"));
assert(visual.includes("prepareScheduleMapping") && visual.includes("prepareGanttMapping"));
for (const component of ["b3-switch", "b3-select", "b3-text-field", "b3-slider", "b3-button"])
  assert(item.includes(component) || section.includes(component) || svelte.includes(component), component);
assert(section.includes("getSettingsSections"), "Preserve schema-driven setting groups shared with search");
assert(section.includes("CustomAppManager"), "Preserve database custom app manager");
assert(section.includes('class={"config-group dodo-setting-section"') &&
  section.includes("config-group--first") && section.includes("config-group--last"),
  "Use native SiYuan config-group with native first/last layout classes");
assert(section.includes('class="config-title config-title--action dodo-setting-section__header"') &&
  section.includes('class="config-items dodo-setting-section__content"'),
  "Native SiYuan theme must own title, surface and corner-radius styling");
assert(!section.includes("background: var(--b3-theme-surface)") &&
  !section.includes("border-radius: 12px;") &&
  !section.includes("padding: 18px 0;"),
  "Do not duplicate native title/card/row styling with hardcoded CSS");
assert(section.includes("<h3 class=\"dodo-setting-section__title\">"),
  "Keep accessible setting group headings");
assert(!section.includes("dodo-setting-section__enable") &&
  !section.includes("{@html section.description}"),
  "No first-level enable switches or small section descriptions");
assert(section.includes("visibleItems.length > 0 || hasAppManager"),
  "View sections with no global fields must not render empty gray cards");
assert(section.includes("isSectionActivationItem(group, item.key)"),
  "Only module activation flags must be hidden, not feature-specific options");
assert(section.includes('showDescription={showFieldDescriptions}') &&
  section.includes("const showFieldDescriptions = true"),
  "Each settings field must show the host-style secondary help text");
assert(!section.includes("{@html section.description}"),
  "Do not restore the section-level introductory paragraphs");
assert(item.includes('class="fn__flex b3-label config-item"') &&
  item.includes('class="fn__flex-column b3-label config-item"'),
  "Setting controls must use native b3-label + config-item DOM");
assert(item.includes('data-config-item-id={configItemId || settingKey}') &&
  item.includes('class="fn__flex-1 config-item__main"') &&
  item.includes('class="config-item__main"') &&
  item.includes('<div class="config-name">{@html title}</div>'),
  "Setting labels must match native SiYuan config-item__main/config-name hierarchy");
assert(section.includes('configItemId={group + "." + item.key}'),
  "Cross-category search must give settings stable group-scoped item IDs");
assert(item.includes('class="b3-switch fn__flex-center"') &&
  item.includes('class="b3-select fn__size200"'),
  "Native SiYuan switch and select classes must be preserved");
assert(!item.includes('  .b3-label {') &&
  !item.includes('  .b3-label__text {') &&
  !item.includes('  .b3-select {') &&
  !item.includes('  .b3-switch {'),
  "Do not redefine native control font, spacing, height, border or focus rules");
assert(!/\.b3-text-field,\s*\.b3-select\s*\{/.test(item),
  "Avoid overriding native input/select dimensions and border radii");
assert(item.includes("export let showDescription: boolean = true;"),
  "Other settings must keep existing optional help descriptions");
assert(!section.includes("expandedSection") && !section.includes("toggleSection"),
  "Primary section headings never collapse");
assert(svelte.includes('class="config__side b3-list b3-list--background dodo-settings-sidebar"') &&
  svelte.includes('class="config__tab-head"') &&
  svelte.includes('class="config__tab-title dodo-settings-sidebar__heading"') &&
  svelte.includes('class="config__tab-scroll sidebar-menu"') &&
  svelte.includes("b3-list-item--focus"),
  "Settings sidebar must match SiYuan's exact native hierarchy and selectors");
assert(svelte.includes('class="config__tab-wrap"') &&
  svelte.includes('class="config__tab-container panel-content"'),
  "Main content must use SiYuan's native direct-child scroll hierarchy");
assert(!svelte.includes('.sidebar-item:hover {') &&
  !svelte.includes('.sidebar-item.active {') &&
  !svelte.includes('.sidebar-item {') &&
  !svelte.includes('  .config__tab-wrap {\n    padding:'),
  "Native navigation and content layout must not be overwritten");
const settingsSource = read("src/settings.ts");
assert(settingsSource.includes("ALWAYS_ON_SECTION_FLAGS") &&
  settingsSource.includes("state[key] = true"),
  "Legacy disabled module flags must be enabled once their switches are hidden");
const featureSource = read("src/setting-section-features.ts");
assert(featureSource.includes("export const ALWAYS_ON_SECTION_FLAGS") &&
  featureSource.includes("export function isSectionActivationItem"));
for (const key of [
  "math-enabled", "toggle-enabled", "sql-enabled", "gallery-enabled",
  "map-view-enabled", "chart-view-enabled", "calendar-view-enabled",
  "timeline-view-enabled", "gantt-view-enabled", "custom-view-enabled",
]) assert(featureSource.includes('"' + key + '"'), "Missing module flag " + key);
assert(!featureSource.includes('"map-search-enabled"'),
  "Map search remains an independent setting");
const searchSource = read("src/setting-search.ts");
assert(svelte.includes("searchSettingsGroups(groups, SettingItems, searchQuery, getGroupLabel)"),
  "Search must cover all enabled groups and their setting fields");
assert(svelte.includes("searchSections={result.sections}") &&
  svelte.includes("on:locate={locateSettingSection}"),
  "Right-hand global search results must be editable and locatable");
assert(svelte.includes("const changedItems = SettingItems[detail.group] ?? []"),
  "Edits from cross-category search results must update their actual source group");
assert(searchSource.includes("item.description") &&
  searchSource.includes("isSectionActivationItem(group, item.key)"),
  "Search titles and help text but exclude hidden module flags");
assert(searchSource.includes("getSettingsSections") &&
  searchSource.includes("DATABASE_VIEW_SECTION_TITLES"),
  "Search must cover database view headings even without fields");const sharedRow = read("src/components/ui/SettingRow.svelte");
const mapping = read("src/components/ui/FieldMapping.svelte");
const calendar = read("src/lets-database-view/calendar/CalendarSettingsPanel.svelte");
const gantt = read("src/lets-database-view/gantt/GanttSettingsPanel.svelte");
const file = read("src/lets-custom-block/file/FileSettingsPanel.svelte");
const sql = read("src/lets-custom-block/sql/SqlSettingsPanel.svelte");
const gallery = read("src/lets-custom-block/gallery/GallerySettingsPanel.svelte");
assert(sharedRow.includes("dodo-native-setting-row") && sharedRow.includes("<slot"), "Reusable Svelte SettingRow");
for (const [name, source] of Object.entries({mapping, calendar, gantt}))
  assert(source.includes("<SettingRow"), name + " should share native row");
for (const [name, source] of Object.entries({calendar, gantt, sql, gallery}))
  assert(source.includes("b3-select"), name + " should keep SiYuan selects");
for (const [name, source] of Object.entries({file, sql, gallery}))
  assert(source.includes("b3-button"), name + " should use SiYuan buttons");
assert(file.includes("b3-text-field") && gallery.includes("b3-text-field"),
  "File/Gallery must use SiYuan native text fields");
assert(svelte.includes("--b3-theme-primary"), "Settings should follow SiYuan theme");
assert(svelte.includes("var(--b3-theme-background"), "Follow SiYuan theme background");
for (const name of ["@heroui/react", "@heroui/styles", "tailwindcss", "@tailwindcss/postcss"])
  assert(!pkg.dependencies?.[name] && !pkg.devDependencies?.[name], name + " still installed");
for (const name of ["dev:ui", "build:ui", "typecheck:ui", "test:react-settings"])
  assert(!pkg.scripts[name], "Obsolete React settings script " + name);
assert(!existsSync("src/shared/react-ui") && !existsSync("postcss.config.cjs"));
assert(pkg.dependencies.react && pkg.dependencies["react-dom"],
  "Keep React/ReactDOM for Excalidraw; only settings UI reverted");
console.log("PASS: SiYuan native two-column settings, grouped surfaces, section toggles removed, feature migration preserved");