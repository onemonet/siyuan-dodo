<script lang="ts">
  import { onMount } from "svelte";
  import type { HomeWidget } from "../config";
  import {
    formatCompactDate,
    loadRecentDocuments,
    openSiyuanBlock,
    type RecentDocumentItem,
  } from "./shared/home-data";

  export let widget: HomeWidget;

  let items: RecentDocumentItem[] = [];
  let loading = true;
  let error = "";

  async function refresh(): Promise<void> {
    loading = true;
    error = "";
    try {
      items = await loadRecentDocuments(widget.h >= 4 ? 10 : 6);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "加载最近文档失败";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="home-data-widget recent-documents-widget">
  <div class="home-data-toolbar">
    <span>{loading ? "正在读取…" : `${items.length} 个最近文档`}</span>
    <button type="button" on:mousedown|stopPropagation on:click={() => void refresh()}>刷新</button>
  </div>

  {#if error}
    <div class="home-widget-state home-widget-error">{error}</div>
  {:else if !loading && items.length === 0}
    <div class="home-widget-state">暂无最近文档</div>
  {:else}
    <div class="home-list-widget">
      {#each items as item (item.id)}
        <button
          class="home-list-row"
          type="button"
          on:mousedown|stopPropagation
          on:click={() => openSiyuanBlock(item.id)}
        >
          <span class="home-list-row-main">
            <strong>{item.title}</strong>
            <small>{item.hpath || "文档"}</small>
          </span>
          <time>{formatCompactDate(item.updated)}</time>
        </button>
      {/each}
    </div>
  {/if}
</div>
