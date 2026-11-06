<script lang="ts">
  import { tick } from "svelte";
  import "./memoReadonlyDOM.css";
  import { normalizeMemoImageLayout } from "../utils/blockDomImageLayout";
  import {
    getMemoNavigationTarget,
    normalizeMemoInlineNavigationTargets,
    normalizeMemoPreviewImageTargets,
    normalizeReadonlyMemoDOM,
  } from "../utils/memoDom";
  import {
    createMemoPreviewController,
    type MemoPreviewState,
  } from "../utils/memoPreviewController";
  import MemoImagePreview from "./MemoImagePreview.svelte";

  const CONSTANTS = {
    emptyContentLabel: "暂无可渲染内容",
    loadingText: "正在恢复原生渲染...",
  } as const;

  export let domContent = "";
  export let error = "";
  export let loading = true;

  let memoDOMElement: HTMLDivElement | null = null;
  let previewImageSources: string[] = [];
  let previewVisible = false;
  let previewIndex = 0;
  let lastNormalizedContent = "";
  const previewController = createMemoPreviewController(() => memoDOMElement);

  function applyPreviewState(state: MemoPreviewState): void {
    previewImageSources = state.imageSources;
    previewVisible = state.isVisible;
    previewIndex = state.activeIndex;
  }

  function closeImagePreview(): void {
    applyPreviewState(previewController.close());
  }

  function handleMemoDOMClick(event: MouseEvent): void {
    const nextState = previewController.handleClick(event);
    if (nextState) {
      applyPreviewState(nextState);
      return;
    }

    const navigationTarget = getMemoNavigationTarget(event.target);
    if (!navigationTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.open(navigationTarget.href, navigationTarget.target);
  }

  function handleMemoDOMKeyDown(event: KeyboardEvent): void {
    const nextState = previewController.handleKeyDown(event);
    if (nextState) {
      applyPreviewState(nextState);
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const navigationTarget = getMemoNavigationTarget(event.target);
    if (!navigationTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.open(navigationTarget.href, navigationTarget.target);
  }

  function attachMemoDOMPreview(node: HTMLDivElement): { destroy: () => void } {
    node.addEventListener("click", handleMemoDOMClick);
    node.addEventListener("keydown", handleMemoDOMKeyDown);

    return {
      destroy() {
        node.removeEventListener("click", handleMemoDOMClick);
        node.removeEventListener("keydown", handleMemoDOMKeyDown);
      },
    };
  }

  async function normalizeRenderedDOM(content: string): Promise<void> {
    if (!content || error || loading) {
      lastNormalizedContent = "";
      return;
    }

    if (content === lastNormalizedContent) {
      return;
    }

    lastNormalizedContent = content;
    await tick();
    if (!memoDOMElement) {
      return;
    }

    normalizeReadonlyMemoDOM(memoDOMElement);
    normalizeMemoPreviewImageTargets(memoDOMElement);
    normalizeMemoInlineNavigationTargets(memoDOMElement);
    normalizeMemoImageLayout(memoDOMElement);
    applyPreviewState(previewController.updateImages());
  }

  $: void normalizeRenderedDOM(domContent);
</script>

{#if loading}
  <div class="memo-status">{CONSTANTS.loadingText}</div>
{:else if error}
  <div class="memo-status error">{error}</div>
{:else if domContent}
  <div class="memo-dom" bind:this={memoDOMElement} use:attachMemoDOMPreview>
    {@html domContent}
  </div>
{:else}
  <div class="memo-status">{CONSTANTS.emptyContentLabel}</div>
{/if}

{#if previewVisible}
  <MemoImagePreview
    imageSources={previewImageSources}
    initialIndex={previewIndex}
    on:close={closeImagePreview}
  />
{/if}
