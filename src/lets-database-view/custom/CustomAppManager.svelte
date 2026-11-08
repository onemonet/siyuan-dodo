<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import {
    deleteUnusedCustomApp, detachInactiveCustomAppReferences,
    scanCustomAppReferences,
  } from "./app-management";
  import type { CustomAppReference, CustomAppReferenceScan } from "./app-management";
  import {
    loadAppReferenceLabels, nativeViewIcon, openAppDatabaseBlock,
  } from "./app-reference-navigation";
  import type { DatabaseBlockLabel } from "./app-reference-navigation";
  import {
    DEFAULT_HISTORY_LIMIT, MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT,
    getCustomHistoryLimit, listCustomApps, setCustomHistoryLimit,
    validCustomHistoryLimit,
  } from "./storage";
  import type { CustomAppSummary } from "./storage";

  let apps: CustomAppSummary[] = [];
  let references: CustomAppReferenceScan | null = null;
  let labels: Record<string, DatabaseBlockLabel> = Object.create(null);
  let loading = true;
  let scanError = "";
  let busy = "";
  let notice = "";
  let historyLimit = DEFAULT_HISTORY_LIMIT;
  let selectedLimit = DEFAULT_HISTORY_LIMIT;
  let refreshSequence = 0;
  let destroyed = false;

  onMount(() => {
    void refresh();
    return () => {
      destroyed = true;
      refreshSequence++;
    };
  });

  const appRefs = (appId: string): CustomAppReference[] =>
    references?.byApp[appId] || [];

  function labelFor(ref: CustomAppReference): string {
    return labels[ref.blockId]?.title || "未命名数据库";
  }

  function viewFor(ref: CustomAppReference): string {
    const named = labels[ref.blockId]?.viewNames?.[ref.viewId];
    if (named) return named;
    return ref.mode === "custom" ? "自定义视图" :
      ref.mode === "table" ? "表格视图" : "其他视图";
  }

  function primaryRef(app: CustomAppSummary): CustomAppReference | undefined {
    const refs = appRefs(app.appId);
    // Prefer the active custom view with verified native metadata; fall back
    // to the first valid reference when an app is attached to multiple views.
    return refs.find(ref => ref.mode === "custom" &&
      labels[ref.blockId]?.viewNames?.[ref.viewId]) ||
      refs.find(ref => labels[ref.blockId]?.viewNames?.[ref.viewId]) ||
      refs.find(ref => ref.mode === "custom") || refs[0];
  }

  function iconFor(ref: CustomAppReference | undefined) {
    return nativeViewIcon(ref && labels[ref.blockId]?.viewIcons?.[ref.viewId]);
  }

  function appName(app: CustomAppSummary): string {
    const ref = primaryRef(app);
    return ref ? viewFor(ref) + " | " + labelFor(ref) : "未关联应用";
  }

  function appMeta(app: CustomAppSummary): string {
    if (app.error) return "文件异常";
    const refs = appRefs(app.appId);
    if (!refs.length) return "版本 " + app.version + " · 未使用";
    if (refs.length === 1) return viewFor(refs[0]) + " · 版本 " + app.version;
    return "关联 " + refs.length + " 个视图 · 版本 " + app.version;
  }

  async function refresh(): Promise<void> {
    const sequence = ++refreshSequence;
    loading = true;
    scanError = "";
    notice = "";
    try {
      const [nextApps, limit] = await Promise.all([
        listCustomApps(), getCustomHistoryLimit(),
      ]);
      let scan: CustomAppReferenceScan | null = null;
      let error = "";
      let nextLabels: Record<string, DatabaseBlockLabel> = Object.create(null);
      try { scan = await scanCustomAppReferences(); }
      catch (err) { error = err instanceof Error ? err.message : String(err); }
      if (scan) {
        try { nextLabels = await loadAppReferenceLabels(scan); }
        catch (err) { console.warn("[Dodo] 数据库名称读取失败", err); }
      }
      if (destroyed || sequence !== refreshSequence) return;
      apps = nextApps;
      references = scan;
      labels = nextLabels;
      historyLimit = limit;
      selectedLimit = limit;
      scanError = error;
    } catch (err) {
      if (destroyed || sequence !== refreshSequence) return;
      scanError = err instanceof Error ? err.message : String(err);
      references = null;
      notice = "读取应用失败：" + scanError;
    } finally {
      if (!destroyed && sequence === refreshSequence) loading = false;
    }
  }

  async function runAction(key: string, task: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = key;
    try { await task(); }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notice = "操作失败：" + message;
      showMessage("应用管理失败：" + message, 6500, "error");
    }
    finally { busy = ""; }
  }

  function openReference(ref: CustomAppReference): void {
    void runAction("open:" + ref.blockId, async () => {
      await openAppDatabaseBlock(ref);
    });
  }

  /** Delete immediately when clicked; the service repeats the full reference
   * scan and refuses deletion if an open or indexed view still uses the App. */
  function deleteApp(app: CustomAppSummary): void {
    if (busy) return;
    if (!references || scanError || app.error || appRefs(app.appId).length) {
      notice = "当前无法删除：应用仍有引用，或引用检查未通过。请重新打开设置页后重试。";
      return;
    }
    void runAction("delete:" + app.appId, async () => {
      await deleteUnusedCustomApp(app.appId);
      await refresh();
      notice = "应用及其历史版本已永久删除";
    });
  }

  function detach(app: CustomAppSummary): void {
    const refs = appRefs(app.appId);
    if (!references || scanError || !refs.length ||
        refs.some(ref => ref.mode === "custom" || ref.mode === "unknown")) return;
    if (!window.confirm("解除「" + appName(app) + "」在 " + refs.length +
        " 个非自定义视图中的保留关联？\n此操作不删除 HTML。")) return;
    void runAction("detach:" + app.appId, async () => {
      await detachInactiveCustomAppReferences(app.appId);
      await refresh();
    });
  }

  /** The numeric input commits on change/blur, without a Save button.
   * Changing the preference never prunes existing snapshots immediately. */
  function applyHistoryLimit(): void {
    if (loading || busy) return;
    const limit = Number(selectedLimit);
    if (!validCustomHistoryLimit(selectedLimit)) {
      selectedLimit = historyLimit;
      notice = "请输入 " + MIN_HISTORY_LIMIT + "～" + MAX_HISTORY_LIMIT + " 的整数";
      return;
    }
    if (limit === historyLimit) return;
    void runAction("history", async () => {
      try {
        await setCustomHistoryLimit(limit);
        historyLimit = limit;
        notice = "历史保留数量已自动保存，后续保存应用时将自动清理超额历史";
      } catch (error) {
        selectedLimit = historyLimit;
        throw error;
      }
    });
  }

  function onHistoryLimitKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      (event.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<div class="dodo-custom-app-manager">
  <!-- Native SiYuan config-item: free numeric retention, auto-saved. -->
  <label class="fn__flex b3-label config-item dodo-custom-app-history"
    data-config-item-id="database-view.custom-history-limit">
    <div class="fn__flex-1 config-item__main">
      <div class="config-name">历史保留数量</div>
      <div class="b3-label__text">
        每个应用保留最近的历史版本；保存视图时自动清理超额版本，固定版本不受影响。
      </div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200"
      type="number" min={MIN_HISTORY_LIMIT} max={MAX_HISTORY_LIMIT} step="1"
      aria-label="每个应用历史版本保留数量"
      bind:value={selectedLimit}
      disabled={loading || !!busy}
      on:change={applyHistoryLimit}
      on:blur={applyHistoryLimit}
      on:keydown={onHistoryLimitKeyDown}
    />
  </label>
  <div class="dodo-custom-app-toolbar">
    <span class="dodo-custom-app-count">
      {#if loading}正在加载…{:else}共 {apps.length} 个应用{/if}
    </span>

  </div>

  {#if scanError}
    <p class="dodo-custom-app-alert" role="alert">
      无法确认数据库引用，已禁用删除和解除关联操作。
    </p>
  {/if}
  {#if notice}<p class="dodo-custom-app-note" role="status">{notice}</p>{/if}

  {#if !loading}
    {#if !apps.length}
      <p class="dodo-custom-app-empty">暂无自定义视图应用</p>
    {:else}
      <div class="dodo-custom-app-list">
        {#each apps as app (app.appId)}
          {@const refs = appRefs(app.appId)}
          {@const activeRefs = refs.filter(ref => ref.mode === "custom")}
          {@const icon = iconFor(primaryRef(app))}
          <div class="dodo-custom-app-row">
            <div class="dodo-custom-app-details" title={app.appId}>
              <div class="dodo-custom-app-heading">
                <span class="dodo-custom-app-view-icon" aria-hidden="true">
                  {#if icon.kind === "emoji"}
                    <span>{icon.value}</span>
                  {:else if icon.kind === "asset"}
                    <img src={icon.value} alt="" loading="lazy" />
                  {:else}
                    <svg><use href={"#" + icon.value}/></svg>
                  {/if}
                </span>
                <div class="config-name dodo-custom-app-title">{appName(app)}</div>
              </div>
              <div class="dodo-custom-app-meta" title={app.error || ""}>
                {appMeta(app)}
              </div>
              {#if refs.length > 1}
                <details class="dodo-custom-app-references">
                  <summary>查看关联视图</summary>
                  <div class="dodo-custom-app-ref-list">
                    {#each refs as ref (ref.blockId + ":" + ref.viewId + ":" + ref.mode)}
                      <button type="button" class="dodo-custom-app-ref"
                        title={[labels[ref.blockId]?.path, ref.blockId, ref.viewId].filter(Boolean).join("\n")}
                        aria-label={"打开" + labelFor(ref) + "的" + viewFor(ref)}
                        on:click={() => openReference(ref)}>
                        {viewFor(ref)} | {labelFor(ref)}
                      </button>
                    {/each}
                  </div>
                </details>
              {/if}
              {#if app.error}<span class="dodo-custom-app-error">{app.error}</span>{/if}
            </div>
            <div class="dodo-custom-app-actions">
              {#if refs.length === 1}
                <button type="button" class="b3-button b3-button--outline"
                  title={"打开" + labelFor(refs[0]) + " · " + viewFor(refs[0])}
                  disabled={!!busy} on:click={() => openReference(refs[0])}>打开</button>
              {/if}
              {#if !refs.length && references && !scanError && !app.error}
                <button type="button" class="b3-button b3-button--outline dodo-custom-app-delete"
                  title="永久删除应用及历史版本，无法恢复"
                  disabled={!!busy} on:click={() => deleteApp(app)}>删除</button>
              {:else if refs.length && !activeRefs.length && refs.every(ref => ref.mode !== "unknown") && !scanError}
                <button type="button" class="b3-button b3-button--outline"
                  title="解除表格等模式中保留的旧引用，不删除应用"
                  disabled={!!busy} on:click={() => detach(app)}>解除关联</button>
              {/if}
            </div>

          </div>
        {/each}
      </div>
    {/if}
  {/if}

</div>

<style>
  .dodo-custom-app-manager {
    min-width: 0;
    padding-bottom: 12px;
    box-sizing: border-box;
    color: var(--b3-theme-on-background);
  }
  .dodo-custom-app-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 10px;
  }
  .dodo-custom-app-count, .dodo-custom-app-meta,
  .dodo-custom-app-note {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    line-height: 1.6;
  }
  .dodo-custom-app-list {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin: 0 16px;
  }
  .dodo-custom-app-heading {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
  }
  .dodo-custom-app-view-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    font-size: 16px;
    color: var(--b3-theme-on-surface);
  }
  .dodo-custom-app-view-icon svg,
  .dodo-custom-app-view-icon img {
    width: 18px;
    height: 18px;
    display: block;
    flex: none;
  }

  .dodo-custom-app-row {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: space-between;
    min-width: 0;
    padding: 12px 0;
    border-bottom: 1px solid var(--b3-theme-outline-variant, var(--b3-border-color));
  }

  .dodo-custom-app-details { flex: 1; min-width: 0; }
  .dodo-custom-app-title {
    min-width: 0;
    font-weight: 500;
    line-height: 1.5;
    color: var(--b3-theme-on-background);
    overflow-wrap: anywhere;
  }
  .dodo-custom-app-meta { margin-top: 3px; }
  .dodo-custom-app-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }
  .dodo-custom-app-actions .b3-button { font-size: 12px; }
  .dodo-custom-app-delete { color: var(--b3-theme-error); }
  .dodo-custom-app-references summary {
    cursor: pointer;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.6;
  }
  .dodo-custom-app-references { margin-top: 4px; }
  .dodo-custom-app-ref-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 6px 0;
  }
  .dodo-custom-app-ref {
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--b3-theme-primary);
    cursor: pointer;
    text-align: left;
    font-size: 12px;
  }
  .dodo-custom-app-ref:hover { text-decoration: underline; }
  .dodo-custom-app-ref:focus-visible {
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: 2px;
  }
  .dodo-custom-app-alert, .dodo-custom-app-error {
    color: var(--b3-theme-error);
    font-size: 12px;
  }
  .dodo-custom-app-empty {
    margin: 10px 0 14px;
    color: var(--b3-theme-on-surface-light);
  }
  @media (max-width: 520px) {

    .dodo-custom-app-row { align-items: flex-start; flex-wrap: wrap; }
    .dodo-custom-app-actions { width: 100%; justify-content: flex-end; }
  }
</style>