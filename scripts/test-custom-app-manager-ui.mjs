import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const component = readFileSync("src/lets-database-view/custom/CustomAppManager.svelte","utf8");
const names = readFileSync("src/lets-database-view/custom/app-reference-navigation.ts","utf8");
const management = readFileSync("src/lets-database-view/custom/app-management.ts","utf8");
const storage = readFileSync("src/lets-database-view/custom/storage.ts","utf8");
assert(component.includes('{#if loading}正在加载…{:else}共 {apps.length} 个应用{/if}'),
  "Keep automatic count summary while loading or after refresh");
assert(!component.includes('on:click={() => void refresh()}') &&
  !component.includes('>刷新</button>') &&
  !component.includes('      刷新\n'),
  "There should be no manual Refresh button in the app manager");
assert(component.includes('onMount(() => {') &&
  component.includes('void refresh();') &&
  component.includes('await refresh();'),
  "Keep initial auto-load and refresh after mutations");
assert(component.includes('请重新打开设置页后重试。'),
  "Error instructions must not refer to a removed Refresh button");
assert(component.includes("onMount") && !component.includes("mountCustomAppManager("),
  "Use a real Svelte component instead of manually assembled HTML");
assert(component.includes("labelFor(ref)") && component.includes("appName(app)"));
assert(component.includes("viewFor(ref)") && component.includes("viewNames"));
assert(component.includes('class="config-name dodo-custom-app-title">{appName(app)}</div>') &&
  component.includes('viewFor(ref) + " | " + labelFor(ref)') &&
  component.includes("primaryRef(app)"),
  "Main title must show the actual native view name | database name, without appId");
assert(component.includes('class="dodo-custom-app-view-icon"') &&
  component.includes('nativeViewIcon(ref && labels[ref.blockId]?.viewIcons?.[ref.viewId])') &&
  component.includes('href={"#" + icon.value}'),
  "Main row must display the native view icon, with fallback when unavailable");
assert(component.includes('class="fn__flex b3-label config-item dodo-custom-app-history"') &&
  component.includes('class="fn__flex-1 config-item__main"') &&
  component.includes('class="config-name">历史保留数量</div>') &&
  component.includes('data-config-item-id="database-view.custom-history-limit"'),
  "Show one native SiYuan settings row for history retention");
assert(component.indexOf('class="fn__flex b3-label config-item dodo-custom-app-history"') <
  component.indexOf('class="dodo-custom-app-toolbar"'),
  "Retention input remains above the app list");
assert(component.includes('class="b3-text-field fn__flex-center fn__size200"') &&
  component.includes('type="number" min={MIN_HISTORY_LIMIT} max={MAX_HISTORY_LIMIT} step="1"') &&
  component.includes('bind:value={selectedLimit}'),
  "Retention uses a freely editable native numeric field with integer bounds");
assert(component.includes("on:change={applyHistoryLimit}") &&
  component.includes("on:blur={applyHistoryLimit}") &&
  component.includes("on:keydown={onHistoryLimitKeyDown}") &&
  component.includes("event.key === \"Enter\""),
  "Change, blur and Enter commit without an extra Save button");
for(const obsolete of [
  "HISTORY_LIMIT_OPTIONS", "cleanHistoryVersions",
  "pruneCustomAppVersions(app.appId)", "on:click={applyHistoryLimit}",
  'class="dodo-custom-app-history-controls"',
  '<select class="b3-select', '<summary>历史版本设置</summary>',
  'href="#iconTrashcan"', '确认清理吗？'
]) assert(!component.includes(obsolete), "History UI must not contain a selector/Save/Clear button: " + obsolete);
const historySave = component.slice(
  component.indexOf("function applyHistoryLimit(): void"),
  component.indexOf("function onHistoryLimitKeyDown"));
assert(historySave.includes("validCustomHistoryLimit(selectedLimit)") &&
  historySave.includes("await setCustomHistoryLimit(limit)") &&
  historySave.includes("historyLimit = limit") &&
  historySave.includes("selectedLimit = historyLimit") &&
  !historySave.includes("pruneCustomAppVersions(") &&
  !historySave.includes("confirm("),
  "Auto-committing the numeric preference validates and rolls back failures without pruning");
assert(storage.includes("export const DEFAULT_HISTORY_LIMIT = 10;") &&
  storage.includes("export const MIN_HISTORY_LIMIT = 1;") &&
  storage.includes("export const MAX_HISTORY_LIMIT = 10000;") &&
  storage.includes("Number.isSafeInteger(value)") &&
  storage.includes("validCustomHistoryLimit(json.historyLimit)"),
  "New users default to ten; existing saved free integers are validated");
assert(storage.includes("try { await pruneSnapshots(appId,await getCustomHistoryLimit()); }"),
  "Saving a new HTML version still automatically prunes old unpinned snapshots");

assert(!component.includes("data-trash") && !component.includes("回收站") &&
  !component.includes("移入回收站"), "No recycle-bin controls in new UI");
assert(component.includes("deleteUnusedCustomApp(app.appId)"));
assert(component.includes('class="dodo-custom-app-list"') &&
  component.includes("{#each apps as app (app.appId)}"),
  "Every app must render in one naturally expanding list without pagination");
for (const oldScrollBehavior of [
  "VISIBLE_APP_ROWS", "listHeight", "listElement", "ResizeObserver",
  "rowObserver", "afterUpdate", "class:scrollable", "style:max-height",
  "dodo-custom-app-list.scrollable", "overflow-y: auto",
  "scrollbar-gutter: stable"
]) assert(!component.includes(oldScrollBehavior),
  "App manager must not use a row threshold or nested scrolling: " + oldScrollBehavior);
assert(component.includes("getCustomHistoryLimit") &&
  component.includes("validCustomHistoryLimit"),
  "Numeric history retention remains per-app and uses the saved preference");
assert(!component.includes("window.prompt(") &&
  !component.includes("confirmingAppId") &&
  !component.includes("confirmationInput") &&
  !component.includes("confirmationText") &&
  !component.includes("confirmDelete(") &&
  !component.includes("cancelDelete("),
  "Clicking Delete must require no secondary confirmation input or button");
assert(component.includes('on:click={() => deleteApp(app)}') &&
  component.includes('void runAction("delete:" + app.appId') &&
  component.includes("await deleteUnusedCustomApp(app.appId)") &&
  component.includes("await refresh()"),
  "Single-click Delete must immediately execute permanent deletion and refresh");
assert(component.includes("if (!references || scanError || app.error || appRefs(app.appId).length)"),
  "Deleting a referenced app or a failed scan must remain blocked");
assert(component.includes('notice = "操作失败：" + message') &&
  component.includes('notice = "应用及其历史版本已永久删除"'),
  "Delete failures and successful completion must be visible in the settings page");
assert(names.includes("/api/block/getBlockDOM") && names.includes("/api/av/getAttributeView"),
  "Database title is resolved using native SiYuan AV metadata");
assert(!names.includes("row.id.slice(-7)"), "Do not expose opaque fallback block IDs");
assert(management.includes("await scanCustomAppReferences()") &&
  management.includes("await permanentlyRemoveCustomApp(appId)"));
assert(storage.includes("export async function permanentlyRemoveCustomApp"));
assert(storage.includes("await removeFile(CUSTOM_VIEW_ROOT +"));
console.log("PASS: compact Svelte manager, human-readable names, hidden appId, direct deletion and safety guards");
