import {
  DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
  buildPreviewTransform,
  clampPreviewScale,
  getHorizontalSwipeDirection,
  getTouchDistance,
  getWheelScaleDelta,
  hasMovedBeyondDragThreshold,
  type ImagePreviewInteractionConfig,
  type SwipeDirection,
} from "./imagePreviewInteraction";

export interface ImagePreviewTransformState {
  scale: number;
  translateX: number;
  translateY: number;
}

export class ImagePreviewGestureController {
  private readonly config: ImagePreviewInteractionConfig;
  private transformState: ImagePreviewTransformState;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private isSwipeTracking = false;
  private pinchStartDistance = 0;
  private pinchStartScale: number;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginX = 0;
  private dragOriginY = 0;
  private isPreviewDragging = false;
  private hasPreviewDragMoved = false;

  constructor(
    config: ImagePreviewInteractionConfig = DEFAULT_IMAGE_PREVIEW_INTERACTION_CONFIG,
  ) {
    this.config = config;
    this.pinchStartScale = config.minScale;
    this.transformState = this.createDefaultTransformState();
  }

  getTransformStyle(): string {
    return buildPreviewTransform(
      this.transformState.translateX,
      this.transformState.translateY,
      this.transformState.scale,
    );
  }

  resetTransform(): void {
    this.transformState = this.createDefaultTransformState();
  }

  resetInteractionState(): void {
    this.resetTransform();
    this.isSwipeTracking = false;
    this.pinchStartDistance = 0;
    this.pinchStartScale = this.config.minScale;
    this.isPreviewDragging = false;
    this.hasPreviewDragMoved = false;
  }

  updateScale(nextScale: number): void {
    const scale = clampPreviewScale(nextScale, this.config);
    const shouldResetTranslation = scale === this.config.minScale;
    this.transformState = {
      scale,
      translateX: shouldResetTranslation ? 0 : this.transformState.translateX,
      translateY: shouldResetTranslation ? 0 : this.transformState.translateY,
    };
  }

  updateScaleByWheelDelta(deltaY: number): void {
    this.updateScale(
      this.transformState.scale + getWheelScaleDelta(deltaY, this.config),
    );
  }

  startDrag(clientX: number, clientY: number): void {
    if (!this.isZoomed()) {
      return;
    }

    this.isPreviewDragging = true;
    this.hasPreviewDragMoved = false;
    this.dragStartX = clientX;
    this.dragStartY = clientY;
    this.dragOriginX = this.transformState.translateX;
    this.dragOriginY = this.transformState.translateY;
  }

  updateDrag(clientX: number, clientY: number): void {
    if (!this.isPreviewDragging) {
      return;
    }

    const deltaX = clientX - this.dragStartX;
    const deltaY = clientY - this.dragStartY;
    if (hasMovedBeyondDragThreshold(deltaX, deltaY, this.config)) {
      this.hasPreviewDragMoved = true;
    }

    this.transformState = {
      scale: this.transformState.scale,
      translateX: this.dragOriginX + deltaX,
      translateY: this.dragOriginY + deltaY,
    };
  }

  stopDrag(): void {
    this.isPreviewDragging = false;
  }

  isDragging(): boolean {
    return this.isPreviewDragging;
  }

  isZoomed(): boolean {
    return this.transformState.scale > this.config.minScale;
  }

  handleTouchStart(touches: TouchList): void {
    if (touches.length === 2) {
      const [firstTouch, secondTouch] = Array.from(touches);
      this.pinchStartDistance = getTouchDistance(firstTouch, secondTouch);
      this.pinchStartScale = this.transformState.scale;
      this.isSwipeTracking = false;
      return;
    }

    if (touches.length === 1) {
      const [touch] = Array.from(touches);
      this.swipeStartX = touch.clientX;
      this.swipeStartY = touch.clientY;
      this.isSwipeTracking = true;
      this.startDrag(touch.clientX, touch.clientY);
    }
  }

  shouldPreventDefaultForTouchMove(touches: TouchList): boolean {
    if (touches.length === 2) {
      return this.handlePinchMove(touches);
    }

    if (touches.length === 1 && this.isZoomed()) {
      const [touch] = Array.from(touches);
      this.updateDrag(touch.clientX, touch.clientY);
      return true;
    }

    return false;
  }

  handleTouchEnd(
    touches: TouchList,
    changedTouches: TouchList,
  ): SwipeDirection | null {
    if (touches.length === 2) {
      const [firstTouch, secondTouch] = Array.from(touches);
      this.pinchStartDistance = getTouchDistance(firstTouch, secondTouch);
      this.pinchStartScale = this.transformState.scale;
      return null;
    }

    if (touches.length === 1) {
      const [touch] = Array.from(touches);
      this.pinchStartDistance = 0;
      this.pinchStartScale = this.transformState.scale;
      this.startDrag(touch.clientX, touch.clientY);
      return null;
    }

    this.stopDrag();
    this.pinchStartDistance = 0;
    this.pinchStartScale = this.transformState.scale;

    if (!this.isSwipeTracking || this.isZoomed()) {
      this.isSwipeTracking = false;
      return null;
    }

    const changedTouch = changedTouches[0];
    if (!changedTouch) {
      this.isSwipeTracking = false;
      return null;
    }

    const swipeDirection = getHorizontalSwipeDirection(
      changedTouch.clientX - this.swipeStartX,
      changedTouch.clientY - this.swipeStartY,
      this.config,
    );
    this.isSwipeTracking = false;
    return swipeDirection;
  }

  consumeDragMoved(): boolean {
    const hasDragMoved = this.hasPreviewDragMoved;
    this.hasPreviewDragMoved = false;
    return hasDragMoved;
  }

  private handlePinchMove(touches: TouchList): boolean {
    const [firstTouch, secondTouch] = Array.from(touches);
    const nextDistance = getTouchDistance(firstTouch, secondTouch);
    if (!this.pinchStartDistance) {
      this.pinchStartDistance = nextDistance;
      this.pinchStartScale = this.transformState.scale;
      return false;
    }

    this.updateScale(
      this.pinchStartScale * (nextDistance / this.pinchStartDistance),
    );
    this.stopDrag();
    return true;
  }

  private createDefaultTransformState(): ImagePreviewTransformState {
    return {
      scale: this.config.minScale,
      translateX: 0,
      translateY: 0,
    };
  }
}
