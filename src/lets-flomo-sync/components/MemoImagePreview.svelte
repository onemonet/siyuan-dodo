<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import MemoImagePreviewSurface from "./MemoImagePreviewSurface.svelte";
  import {
    DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
    getBoundedPreviewIndex,
    isMobileViewportWidth,
  } from "../utils/imagePreviewInteraction";
  import { ImagePreviewGestureController } from "../utils/imagePreviewGestureController";

  const CONSTANTS = {
    keyboardEscape: "Escape",
    keyboardArrowLeft: "ArrowLeft",
    keyboardArrowRight: "ArrowRight",
    previousLabel: "上一张",
    nextLabel: "下一张",
  } as const;

  const INTERACTION_CONFIG = DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();
  type PreviewMouseEvent = CustomEvent<{ sourceEvent: MouseEvent }>;
  type PreviewTouchEvent = CustomEvent<{ sourceEvent: TouchEvent }>;
  type PreviewWheelEvent = CustomEvent<{ sourceEvent: WheelEvent }>;

  export let imageSources: string[] = [];
  export let initialIndex = 0;

  let previewImageElement: HTMLImageElement | null = null;
  let activeIndex = 0;
  let lastInitialIndex = Number.NaN;
  let lastImageSourceKey = "";
  const gestureController = new ImagePreviewGestureController(INTERACTION_CONFIG);

  function applyPreviewTransform(): void {
    if (!previewImageElement) {
      return;
    }

    previewImageElement.style.transform = gestureController.getTransformStyle();
  }

  function resetPreviewTransform(): void {
    gestureController.resetTransform();
    applyPreviewTransform();
  }

  function resetInteractionState(): void {
    gestureController.resetInteractionState();
    applyPreviewTransform();
  }

  function closeImagePreview(): void {
    resetInteractionState();
    dispatch("close");
  }

  function showPreviewImage(nextIndex: number): void {
    if (!imageSources.length) {
      return;
    }

    activeIndex = (nextIndex + imageSources.length) % imageSources.length;
    resetPreviewTransform();
  }

  function showPreviousImage(): void {
    showPreviewImage(activeIndex - 1);
  }

  function showNextImage(): void {
    showPreviewImage(activeIndex + 1);
  }

  function stopPreviewDrag(): void {
    gestureController.stopDrag();
  }

  function handlePreviewWheel(event: PreviewWheelEvent): void {
    const sourceEvent = event.detail.sourceEvent;
    sourceEvent.preventDefault();
    gestureController.updateScaleByWheelDelta(sourceEvent.deltaY);
    applyPreviewTransform();
  }

  function handlePreviewMouseDown(event: PreviewMouseEvent): void {
    const sourceEvent = event.detail.sourceEvent;
    if (sourceEvent.button !== 0) {
      return;
    }

    sourceEvent.preventDefault();
    sourceEvent.stopPropagation();
    gestureController.startDrag(sourceEvent.clientX, sourceEvent.clientY);
  }

  function handlePreviewMouseMove(event: MouseEvent): void {
    if (!gestureController.isDragging()) {
      return;
    }

    event.preventDefault();
    gestureController.updateDrag(event.clientX, event.clientY);
    applyPreviewTransform();
  }

  function handlePreviewTouchStart(event: PreviewTouchEvent): void {
    gestureController.handleTouchStart(event.detail.sourceEvent.touches);
  }

  function handlePreviewTouchMove(event: PreviewTouchEvent): void {
    const sourceEvent = event.detail.sourceEvent;
    if (gestureController.shouldPreventDefaultForTouchMove(sourceEvent.touches)) {
      sourceEvent.preventDefault();
    }

    applyPreviewTransform();
  }

  function handlePreviewTouchEnd(event: PreviewTouchEvent): void {
    const sourceEvent = event.detail.sourceEvent;
    const swipeDirection = gestureController.handleTouchEnd(
      sourceEvent.touches,
      sourceEvent.changedTouches,
    );
    if (swipeDirection === "previous") {
      showPreviousImage();
    } else if (swipeDirection === "next") {
      showNextImage();
    }

    applyPreviewTransform();
  }

  function handlePreviewBackdropClick(): void {
    if (gestureController.consumeDragMoved()) {
      return;
    }

    closeImagePreview();
  }

  function handlePreviewImageClick(event: PreviewMouseEvent): void {
    preventPreviewMouseEvent(event.detail.sourceEvent);

    if (gestureController.consumeDragMoved()) {
      return;
    }

    closeImagePreview();
  }

  function handlePreviewKeyDown(event: KeyboardEvent): void {
    const handlers: Record<string, () => void> = {
      [CONSTANTS.keyboardEscape]: closeImagePreview,
      [CONSTANTS.keyboardArrowLeft]: showPreviousImage,
      [CONSTANTS.keyboardArrowRight]: showNextImage,
    };
    const matchedHandler = handlers[event.key];
    if (matchedHandler) {
      event.preventDefault();
      matchedHandler();
    }
  }

  function handlePreviewPrevious(event: PreviewMouseEvent): void {
    preventPreviewMouseEvent(event.detail.sourceEvent);
    showPreviousImage();
  }

  function handlePreviewNext(event: PreviewMouseEvent): void {
    preventPreviewMouseEvent(event.detail.sourceEvent);
    showNextImage();
  }

  function preventPreviewMouseEvent(sourceEvent: MouseEvent): void {
    sourceEvent.preventDefault();
    sourceEvent.stopPropagation();
  }

  $: imageSourceKey = imageSources.join("\n");
  $: if (
    imageSourceKey !== lastImageSourceKey ||
    initialIndex !== lastInitialIndex
  ) {
    lastImageSourceKey = imageSourceKey;
    lastInitialIndex = initialIndex;
    activeIndex = getBoundedPreviewIndex(initialIndex, imageSources.length);
    resetInteractionState();
  }
  $: currentPreviewImage = imageSources[activeIndex] || "";
  $: showPreviewNavigation = imageSources.length > 1;
  $: showDesktopPreviewNavigation =
    showPreviewNavigation &&
    isMobileViewportWidth(window.innerWidth, INTERACTION_CONFIG) === false;
  $: if (currentPreviewImage && previewImageElement) {
    applyPreviewTransform();
  }
</script>

<svelte:window
  on:keydown={handlePreviewKeyDown}
  on:mousemove={handlePreviewMouseMove}
  on:mouseup={stopPreviewDrag}
/>

{#if currentPreviewImage}
  <MemoImagePreviewSurface
    {currentPreviewImage}
    {showDesktopPreviewNavigation}
    previousLabel={CONSTANTS.previousLabel}
    nextLabel={CONSTANTS.nextLabel}
    bind:imageElement={previewImageElement}
    on:backdropclick={handlePreviewBackdropClick}
    on:previous={handlePreviewPrevious}
    on:next={handlePreviewNext}
    on:imageclick={handlePreviewImageClick}
    on:imagemousedown={handlePreviewMouseDown}
    on:imagewheel={handlePreviewWheel}
    on:imagetouchstart={handlePreviewTouchStart}
    on:imagetouchmove={handlePreviewTouchMove}
    on:imagetouchend={handlePreviewTouchEnd}
  />
{/if}
