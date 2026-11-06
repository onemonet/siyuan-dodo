export type SwipeDirection = "previous" | "next";

export interface ImagePreviewInteractionConfig {
  minScale: number;
  maxScale: number;
  wheelSensitivity: number;
  touchSwipeThreshold: number;
  dragThreshold: number;
  mobileBreakpoint: number;
}

export const DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG: ImagePreviewInteractionConfig = {
  minScale: 1,
  maxScale: 4,
  wheelSensitivity: 0.0015,
  touchSwipeThreshold: 48,
  dragThreshold: 6,
  mobileBreakpoint: 768,
};

export function getBoundedPreviewIndex(index: number, sourceCount: number): number {
  if (!sourceCount) {
    return 0;
  }

  return Math.min(Math.max(index, 0), sourceCount - 1);
}

export function clampPreviewScale(
  nextScale: number,
  config: ImagePreviewInteractionConfig = DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
): number {
  return Math.min(config.maxScale, Math.max(config.minScale, nextScale));
}

export function buildPreviewTransform(
  translateX: number,
  translateY: number,
  scale: number,
): string {
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
}

export function getWheelScaleDelta(
  deltaY: number,
  config: ImagePreviewInteractionConfig = DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
): number {
  return -deltaY * config.wheelSensitivity;
}

export function getTouchDistance(
  firstTouch: Touch,
  secondTouch: Touch,
): number {
  const deltaX = firstTouch.clientX - secondTouch.clientX;
  const deltaY = firstTouch.clientY - secondTouch.clientY;
  return Math.hypot(deltaX, deltaY);
}

export function hasMovedBeyondDragThreshold(
  deltaX: number,
  deltaY: number,
  config: ImagePreviewInteractionConfig = DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
): boolean {
  return (
    Math.abs(deltaX) >= config.dragThreshold ||
    Math.abs(deltaY) >= config.dragThreshold
  );
}

export function getHorizontalSwipeDirection(
  deltaX: number,
  deltaY: number,
  config: ImagePreviewInteractionConfig = DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
): SwipeDirection | null {
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);
  if (absDeltaX < config.touchSwipeThreshold || absDeltaX <= absDeltaY) {
    return null;
  }

  return deltaX > 0 ? "previous" : "next";
}

export function isMobileViewportWidth(
  width: number,
  config: ImagePreviewInteractionConfig = DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
): boolean {
  return width <= config.mobileBreakpoint;
}
