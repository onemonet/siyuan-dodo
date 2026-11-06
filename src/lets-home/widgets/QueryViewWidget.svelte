<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import { Protyle } from "siyuan";
  import type { App, Protyle as SiyuanProtyle } from "siyuan";
  import type { HomeWidget } from "../config";
  import type { WidgetConfigChange } from "./types";

  export let widget: HomeWidget;

  const dispatch = createEventDispatcher<{
    configchange: WidgetConfigChange;
  }>();

  const BLOCK_ID_PATTERN = /^\d{14}-[0-9a-z]+$/i;
  const INVALID_ID_MESSAGE =
    "无法识别块 ID：应为形如 20240101120000-abcdefg 的 ID，或包含它的 siyuan:// 链接";

  let hostElement: HTMLDivElement;
  let draftBlockId = widget.config?.content ?? "";
  let protyleInstance: SiyuanProtyle | null = null;
  let readonlyObserver: MutationObserver | null = null;
  let renderedBlockId = "";
  let error = "";

  $: configuredBlockId = widget.config?.content?.trim() ?? "";
  $: queryViewReady =
    typeof (globalThis as any).Query?.DataView === "function";

  function getSiyuanApp(): App {
    const app = (window as any).siyuan?.ws?.app;
    return app ?? ({} as App);
  }

  /**
   * 从任意粘贴文本中提取思源块 ID
   * 支持裸 ID、siyuan://blocks/ 链接、((id '...')) 引用等
   */
  function extractBlockId(raw: string): string {
    const text = raw.trim();
    if (!text) {
      return "";
    }
    if (BLOCK_ID_PATTERN.test(text)) {
      return text;
    }
    const explicit = text.match(/siyuan:\/\/blocks\/(\d{14}-[0-9a-z]+)/i);
    if (explicit) {
      return explicit[1];
    }
    const ref = text.match(/\(\((\d{14}-[0-9a-z]+)\s*['"]/i);
    if (ref) {
      return ref[1];
    }
    const bare = text.match(/(\d{14}-[0-9a-z]+)/);
    return bare ? bare[1] : "";
  }

  function looksLikeScript(text: string): boolean {
    return /\/\/!js/.test(text) || text.trimStart().startsWith("{{");
  }

  function applyDraftBlockId(): void {
    const text = draftBlockId.trim();
    if (!text) {
      return;
    }
    if (looksLikeScript(text)) {
      error =
        "这里应粘贴块 ID 而不是脚本本身：请先把脚本放入文档中的 //!js 嵌入块，点击块左侧图标 → 复制 → 复制块 ID，再粘贴到这里";
      return;
    }
    const id = extractBlockId(text);
    if (!id) {
      error = INVALID_ID_MESSAGE;
      return;
    }
    draftBlockId = id;
    error = "";
    dispatch("configchange", { field: "content", value: id });
  }

  function handleSetupKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      applyDraftBlockId();
    }
  }

  function changeBlockId(): void {
    draftBlockId = configuredBlockId;
    error = "";
    dispatch("configchange", { field: "content", value: "" });
  }

  function applyReadonly(): void {
    const wysiwyg = protyleInstance?.protyle?.wysiwyg?.element;
    if (wysiwyg && wysiwyg.getAttribute("contenteditable") !== "false") {
      wysiwyg.setAttribute("contenteditable", "false");
    }
  }

  function watchReadonly(): void {
    readonlyObserver?.disconnect();
    const wysiwyg = protyleInstance?.protyle?.wysiwyg?.element;
    if (!wysiwyg) {
      readonlyObserver = null;
      return;
    }
    readonlyObserver = new MutationObserver(applyReadonly);
    readonlyObserver.observe(wysiwyg, { childList: true });
  }

  function unmountProtyle(): void {
    readonlyObserver?.disconnect();
    readonlyObserver = null;
    protyleInstance?.destroy();
    protyleInstance = null;
    renderedBlockId = "";
    hostElement?.replaceChildren();
  }

  function mountProtyle(blockId: string): void {
    if (!hostElement) {
      return;
    }

    unmountProtyle();

    try {
      protyleInstance = new Protyle(getSiyuanApp(), hostElement, {
        blockId,
        render: {
          title: false,
          gutter: false,
          scroll: true,
          breadcrumb: false,
        },
        after: () => {
          applyReadonly();
          watchReadonly();
          protyleInstance?.resize();
        },
      });
      renderedBlockId = blockId;
      error = "";
      applyReadonly();
      //容器此前可能处于隐藏状态，补一次布局校正
      requestAnimationFrame(() => protyleInstance?.resize());
    } catch (cause) {
      protyleInstance = null;
      renderedBlockId = "";
      error = cause instanceof Error ? cause.message : "Query 视图加载失败";
    }
  }

  $: if (hostElement && configuredBlockId !== renderedBlockId) {
    if (configuredBlockId && BLOCK_ID_PATTERN.test(configuredBlockId)) {
      mountProtyle(configuredBlockId);
    } else if (configuredBlockId) {
      error = INVALID_ID_MESSAGE;
    } else if (renderedBlockId) {
      unmountProtyle();
    }
  }

  function refresh(): void {
    if (renderedBlockId) {
      protyleInstance?.reload(false);
      applyReadonly();
    }
  }

  onDestroy(() => {
    unmountProtyle();
  });
</script>

<div class="query-view-widget">
  <div class="home-data-toolbar">
    <span>
      {queryViewReady
        ? "Query & View 已就绪"
        : "未检测到 Query & View，将按原生嵌入块渲染"}
    </span>
    <span class="query-view-toolbar-actions">
      {#if configuredBlockId}
        <button
          type="button"
          title="更换查询块"
          on:mousedown|stopPropagation
          on:click={changeBlockId}
        >更换</button>
      {/if}
      <button
        type="button"
        title="重新渲染查询嵌入块"
        on:mousedown|stopPropagation
        on:click={refresh}
      >刷新</button>
    </span>
  </div>

  {#if !configuredBlockId}
    <div class="query-view-setup">
      <p>
        粘贴一个包含 //!js 查询嵌入块的块 ID 或文档 ID
        （支持 siyuan:// 链接），主页会原位渲染它；
        推荐配合 Query & View 插件使用。
      </p>
      <div class="query-view-setup-row">
        <input
          type="text"
          spellcheck="false"
          aria-label="查询嵌入块 ID"
          placeholder="20240101120000-abcdefg"
          bind:value={draftBlockId}
          on:mousedown|stopPropagation
          on:keydown={handleSetupKeydown}
          on:input={() => (error = "")}
        />
        <button
          type="button"
          on:mousedown|stopPropagation
          on:click={applyDraftBlockId}
        >应用</button>
      </div>
      {#if error}
        <p class="query-view-setup-error">{error}</p>
      {/if}
    </div>
  {:else if error}
    <div class="home-widget-state home-widget-error">{error}</div>
  {/if}

  <div
    bind:this={hostElement}
    class="query-view-host"
    class:is-hidden={!configuredBlockId || Boolean(error)}
    on:mousedown|stopPropagation
  ></div>
</div>
