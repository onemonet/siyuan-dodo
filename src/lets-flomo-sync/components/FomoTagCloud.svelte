<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { sql } from "@/api";
  import "./fomoTagCloud.css";
  import { TagCloudService } from "../services/TagCloudService";
  import type { MemoFilter } from "../utils/sql";
  import {
    buildTagCloudFilterKey,
    getVisibleTagItems,
    TAG_CLOUD_VISIBLE_LIMIT,
    toggleSelectedTag,
    type TagCloudItem,
    type TagMode,
  } from "../utils/tagCloud";

  export let selectedTags: string[] = [];
  export let mode: TagMode = "include_and";
  export let filter: MemoFilter;

  const dispatch = createEventDispatcher<{
    tagchange: { tags: string[]; mode: TagMode };
  }>();

  const tagCloudService = new TagCloudService({ querySQL: sql });

  let expanded = false;
  let loading = true;
  let error = "";
  let tagItems: TagCloudItem[] = [];

  function emitChange(nextTags: string[] = selectedTags): void {
    dispatch("tagchange", { tags: nextTags, mode });
  }

  async function loadTags(): Promise<void> {
    loading = true;
    error = "";

    const result = await tagCloudService.queryTagItems(filter);
    tagItems = result.data;
    error = result.error || "";
    loading = false;
  }

  function toggleTag(tagName: string): void {
    selectedTags = toggleSelectedTag(selectedTags, tagName);
    emitChange(selectedTags);
  }

  function setMode(nextMode: TagMode): void {
    mode = nextMode;
    emitChange();
  }

  $: visibleTags = getVisibleTagItems(tagItems, expanded);
  $: filterKey = buildTagCloudFilterKey(filter);
  $: if (filterKey) {
    void loadTags();
  }
</script>

<div class="tag-cloud">
  <div class="header">
    <div class="title-group">
      <span class="title">标签筛选</span>
      <span class="meta"
        >{selectedTags.length
          ? `已选 ${selectedTags.length} 个`
          : "点击标签筛选"}</span
      >
    </div>

    <div class="mode-switch">
      <button
        class:active={mode === "include_and"}
        on:click={() => setMode("include_and")}>AND</button
      >
      <button
        class:active={mode === "include_or"}
        on:click={() => setMode("include_or")}>OR</button
      >
      <button
        class:active={mode === "exclude"}
        on:click={() => setMode("exclude")}>排除</button
      >
    </div>
  </div>

  {#if loading}
    <div class="status">标签加载中...</div>
  {:else if error}
    <div class="status error">{error}</div>
  {:else if tagItems.length === 0}
    <div class="status">暂无标签数据</div>
  {:else}
    <div class="tags">
      {#each visibleTags as tag}
        <button
          class="tag-chip"
          class:selected={selectedTags.includes(tag.name)}
          on:click={() => toggleTag(tag.name)}
          title={`${tag.name} · ${tag.count} 条`}
        >
          <span class="tag-name">#{tag.name}</span>
          <span class="tag-count">{tag.count}</span>
        </button>
      {/each}
    </div>

    {#if tagItems.length > TAG_CLOUD_VISIBLE_LIMIT}
      <button class="expand-toggle" on:click={() => (expanded = !expanded)}>
        {expanded ? "收起" : "展开全部"}
      </button>
    {/if}
  {/if}
</div>
