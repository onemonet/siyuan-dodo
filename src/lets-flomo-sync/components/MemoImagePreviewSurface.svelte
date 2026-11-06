<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import { MEMO_IMAGE_PREVIEW_LABEL } from "../utils/memoDom";

  export let currentPreviewImage = "";
  export let showDesktopPreviewNavigation = false;
  export let previousLabel = "上一张";
  export let nextLabel = "下一张";
  export let imageElement: HTMLImageElement | null = null;

  const dispatch = createEventDispatcher<{
    backdropclick: void;
    previous: { sourceEvent: MouseEvent };
    next: { sourceEvent: MouseEvent };
    imageclick: { sourceEvent: MouseEvent };
    imagemousedown: { sourceEvent: MouseEvent };
    imagewheel: { sourceEvent: WheelEvent };
    imagetouchstart: { sourceEvent: TouchEvent };
    imagetouchmove: { sourceEvent: TouchEvent };
    imagetouchend: { sourceEvent: TouchEvent };
  }>();

  function stopClickPropagation(node: HTMLElement): { destroy: () => void } {
    const handleClick = (event: MouseEvent): void => {
      event.stopPropagation();
    };

    node.addEventListener("click", handleClick);

    return {
      destroy() {
        node.removeEventListener("click", handleClick);
      },
    };
  }
</script>

<div
  class="memo-preview"
  role="presentation"
  on:click={() => dispatch("backdropclick")}
>
  {#if showDesktopPreviewNavigation}
    <button
      class="memo-preview__nav memo-preview__nav--prev"
      type="button"
      aria-label={previousLabel}
      title={previousLabel}
      on:click={(sourceEvent) => dispatch("previous", { sourceEvent })}
    >
      <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
    </button>
  {/if}

  <div class="memo-preview__viewport" use:stopClickPropagation>
    <button
      class="memo-preview__image-button"
      type="button"
      aria-label={MEMO_IMAGE_PREVIEW_LABEL}
      on:click={(sourceEvent) => dispatch("imageclick", { sourceEvent })}
      on:mousedown={(sourceEvent) => dispatch("imagemousedown", { sourceEvent })}
      on:wheel={(sourceEvent) => dispatch("imagewheel", { sourceEvent })}
      on:touchstart={(sourceEvent) =>
        dispatch("imagetouchstart", { sourceEvent })}
      on:touchmove={(sourceEvent) =>
        dispatch("imagetouchmove", { sourceEvent })}
      on:touchend={(sourceEvent) => dispatch("imagetouchend", { sourceEvent })}
      on:touchcancel={(sourceEvent) =>
        dispatch("imagetouchend", { sourceEvent })}
    >
      <img
        class="memo-preview__image"
        bind:this={imageElement}
        src={currentPreviewImage}
        alt={MEMO_IMAGE_PREVIEW_LABEL}
        draggable="false"
      />
    </button>
  </div>

  {#if showDesktopPreviewNavigation}
    <button
      class="memo-preview__nav memo-preview__nav--next"
      type="button"
      aria-label={nextLabel}
      title={nextLabel}
      on:click={(sourceEvent) => dispatch("next", { sourceEvent })}
    >
      <ChevronRight size={22} strokeWidth={1.8} aria-hidden="true" />
    </button>
  {/if}
</div>

<style>
  .memo-preview {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: transparent;
    touch-action: none;
  }

  .memo-preview__viewport {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .memo-preview__image-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    padding: 0;
    max-width: min(92vw, 1280px);
    max-height: min(92vh, 92vh);
    background: transparent;
    cursor: zoom-out;
    touch-action: none;
  }

  .memo-preview__image-button:focus-visible {
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: 4px;
  }

  .memo-preview__image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transform: translate3d(0, 0, 0) scale(1);
    transform-origin: center center;
    will-change: transform;
    cursor: zoom-out;
    user-select: none;
    -webkit-user-drag: none;
  }

  .memo-preview__image-button:active {
    cursor: grabbing;
  }

  .memo-preview__nav {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10000;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-background) 72%, transparent);
    color: var(--b3-theme-on-background);
    cursor: pointer;
    backdrop-filter: blur(8px);
  }

  .memo-preview__nav--prev {
    left: 20px;
  }

  .memo-preview__nav--next {
    right: 20px;
  }

  @media (max-width: 768px) {
    .memo-preview {
      padding: 12px;
    }

    .memo-preview__image-button {
      max-width: 100%;
      max-height: 100%;
    }
  }
</style>
