<script lang="ts">
  import { onMount } from "svelte";
  import type { HomeWidget } from "../config";
  import {
    formatCompactDate,
    loadOpenTasks,
    openSiyuanBlock,
    type HomeTaskItem,
  } from "./shared/home-data";

  export let widget: HomeWidget;

  let items: HomeTaskItem[] = [];
  let loading = true;
  let error = "";

  async function refresh(): Promise<void> {
    loading = true;
    error = "";
    try {
      items = await loadOpenTasks(widget.h >= 4 ? 14 : 8);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "加载任务失败";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="home-data-widget tasks-widget">
  <div class="home-data-toolbar">
    <span>{loading ? "正在读取…" : `${items.length} 个未完成任务`}</span>
    <button type="button" on:mousedown|stopPropagation on:click={() => void refresh()}>刷新</button>
  </div>

  {#if error}
    <div class="home-widget-state home-widget-error">{error}</div>
  {:else if !loading && items.length === 0}
    <div class="home-widget-state">没有未完成任务</div>
  {:else}
    <div class="home-list-widget">
      {#each items as item (item.id)}
        <button
          class="home-list-row home-task-row"
          type="button"
          on:mousedown|stopPropagation
          on:click={() => openSiyuanBlock(item.rootId)}
        >
          <span class="home-task-check" aria-hidden="true"></span>
          <span class="home-list-row-main">
            <strong>{item.content}</strong>
            <small>{item.hpath || "任务"}</small>
          </span>
          <time>{formatCompactDate(item.updated)}</time>
        </button>
      {/each}
    </div>
  {/if}
</div>
