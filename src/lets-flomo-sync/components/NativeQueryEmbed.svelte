<script lang="ts">
  import type { App, Protyle as SiyuanProtyle } from "siyuan";
  import { Protyle } from "siyuan";
  import { onMount } from "svelte";
  import { updateBlock } from "../../api";

  export let app: App;
  export let blockId = "";
  export let sqlStatement = "";
  export let sqlError = "";

  let hostElement: HTMLDivElement;
  let protyle: SiyuanProtyle | null = null;
  let errorMessage = "";
  let mounted = false;
  let destroyed = false;
  let lastRequestedKey = "";
  let lastAppliedKey = "";
  let updateChain = Promise.resolve();

  function buildEmbedContent(statement: string): string {
    const normalizedStatement = statement.replace(/\r?\n/g, " ").trim();
    return normalizedStatement ? `{{ ${normalizedStatement} }}` : "";
  }

  function getQueryUpdate():
    | { blockId: string; content: string; key: string }
    | null {
    const normalizedBlockId = blockId.trim();
    const content = buildEmbedContent(sqlStatement);
    if (!normalizedBlockId || !content || sqlError) {
      return null;
    }

    return {
      blockId: normalizedBlockId,
      content,
      key: `${normalizedBlockId}\u0000${content}`,
    };
  }

  function mountProtyle(normalizedBlockId: string): void {
    if (protyle) {
      protyle.reload(false);
      return;
    }

    try {
      protyle = new Protyle(app, hostElement, {
        blockId: normalizedBlockId,
        render: {
          title: false,
          gutter: false,
          scroll: true,
          breadcrumb: false,
        },
      });
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : "原生查询嵌入块加载失败";
    }
  }

  function scheduleQueryBlockUpdate(): void {
    const update = getQueryUpdate();
    if (!update) {
      return;
    }

    if (update.key === lastRequestedKey && update.key === lastAppliedKey) {
      return;
    }

    lastRequestedKey = update.key;
    if (update.key === lastAppliedKey) {
      return;
    }

    updateChain = updateChain
      .then(async () => {
        if (destroyed || update.key !== lastRequestedKey) {
          return;
        }

        await updateBlock("markdown", update.content, update.blockId, false);
        if (destroyed || update.key !== lastRequestedKey) {
          return;
        }

        lastAppliedKey = update.key;
        errorMessage = "";
        mountProtyle(update.blockId);
      })
      .catch((error) => {
        if (update.key === lastRequestedKey) {
          errorMessage =
            error instanceof Error ? error.message : "原生查询嵌入块更新失败";
        }
      });
  }

  onMount(() => {
    mounted = true;

    return () => {
      destroyed = true;
      protyle?.destroy();
      protyle = null;
    };
  });

  $: if (mounted && (blockId || sqlStatement || sqlError)) {
    scheduleQueryBlockUpdate();
  }

</script>

<div class="native-query-embed">
  {#if !blockId.trim()}
    <div class="native-query-embed__message">
      请在“Flomo 同步 → 仪表盘”设置中填写用于仪表盘的块 ID。
      打开仪表盘时，该块会转换为原生 SQL 查询嵌入块。
    </div>
  {:else if errorMessage}
    <div class="native-query-embed__message native-query-embed__message--error">
      {errorMessage}
    </div>
  {/if}
  <div
    bind:this={hostElement}
    class="native-query-embed__host"
    class:is-hidden={!blockId.trim() || Boolean(errorMessage)}
  ></div>
</div>

<style>
  .native-query-embed {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .native-query-embed__host {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .native-query-embed__host.is-hidden {
    display: none;
  }

  .native-query-embed__message {
    padding: 24px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .native-query-embed__message--error {
    color: var(--b3-theme-error);
  }
</style>
