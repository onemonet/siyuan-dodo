<script lang="ts">
  import { onMount } from "svelte";
  import type { HomeWidget } from "../config";
  import {
    loadHomeStatistics,
    type HomeStatistics,
  } from "./shared/home-data";

  export let widget: HomeWidget;

  let stats: HomeStatistics = {
    documents: 0,
    openTasks: 0,
    updatedToday: 0,
    totalBlocks: 0,
  };
  let loading = true;
  let error = "";

  async function refresh(): Promise<void> {
    loading = true;
    error = "";
    try {
      stats = await loadHomeStatistics();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "加载统计失败";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="home-data-widget statistics-widget">
  <div class="home-data-toolbar">
    <span>{loading ? "正在统计…" : "本地知识库概览"}</span>
    <button type="button" on:mousedown|stopPropagation on:click={() => void refresh()}>刷新</button>
  </div>

  {#if error}
    <div class="home-widget-state home-widget-error">{error}</div>
  {:else}
    <div class="statistics-grid statistics-grid-{widget.w}">
      <div class="statistic-cell">
        <span>文档</span>
        <strong>{stats.documents.toLocaleString()}</strong>
      </div>
      <div class="statistic-cell">
        <span>待办</span>
        <strong>{stats.openTasks.toLocaleString()}</strong>
      </div>
      <div class="statistic-cell">
        <span>今日更新</span>
        <strong>{stats.updatedToday.toLocaleString()}</strong>
      </div>
      <div class="statistic-cell">
        <span>块总数</span>
        <strong>{stats.totalBlocks.toLocaleString()}</strong>
      </div>
    </div>
  {/if}
</div>
