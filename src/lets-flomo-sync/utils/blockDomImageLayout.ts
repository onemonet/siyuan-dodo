const CONSTANTS = {
  maxPreviewImages: 9,
  gridGap: 4,
  singleColumn: 1,
  twoColumn: 2,
  threeColumn: 3,
  overlayClassName: "memo-image-overlay",
  singleClassName: "memo-image-grid--single",
  twoClassName: "memo-image-grid--two",
  threeClassName: "memo-image-grid--three",
  fourClassName: "memo-image-grid--four",
  moreClassName: "memo-image-grid--more",
  imageSelector: '[data-type="img"]',
  paragraphSelector: '[data-type="NodeParagraph"]',
  editableSelector: "div[contenteditable]",
  groupedContainerClassName: "memo-image-group",
  imageBlockClassName: "memo-image-block",
  imageItemClassName: "memo-image-item",
  singleImageItemClassName: "memo-image-item--single",
} as const;

export interface ImageGridLayout {
  columns: number;
  rows: number;
  visibleCount: number;
  hiddenCount: number;
  className: string;
}

function getColumnCount(count: number): number {
  if (count <= 1) {
    return CONSTANTS.singleColumn;
  }

  if (count === 2 || count === 3) {
    return count;
  }

  if (count === 4) {
    return CONSTANTS.twoColumn;
  }

  return CONSTANTS.threeColumn;
}

function getLayoutClassName(count: number): string {
  if (count <= 1) {
    return CONSTANTS.singleClassName;
  }

  if (count === 2 || count === 3) {
    return CONSTANTS.twoClassName;
  }

  if (count === 4) {
    return CONSTANTS.fourClassName;
  }

  return CONSTANTS.threeClassName;
}

export function getImageGridLayout(count: number): ImageGridLayout {
  const visibleCount = Math.min(count, CONSTANTS.maxPreviewImages);
  const hiddenCount = Math.max(count - visibleCount, 0);
  const columns = getColumnCount(visibleCount);
  const rows = Math.ceil(visibleCount / columns);
  const className = getLayoutClassName(visibleCount);

  return {
    columns,
    rows,
    visibleCount,
    hiddenCount,
    className,
  };
}

function isImageOnlyEditableBlock(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const images = element.querySelectorAll(CONSTANTS.imageSelector);
  if (!images.length) {
    return false;
  }

  const clonedElement = element.cloneNode(true) as HTMLElement;
  clonedElement.querySelectorAll(CONSTANTS.imageSelector).forEach((image) => image.remove());
  const normalizedText = (clonedElement.textContent || "")
    .replace(/[\u200B\uFEFF\s]/g, "")
    .trim();

  return normalizedText.length === 0;
}

function createGroupedContainer(referenceParagraph: HTMLElement): HTMLElement | null {
  const parentElement = referenceParagraph.parentElement;
  if (!parentElement) {
    return null;
  }

  const groupedContainer = document.createElement("div");
  groupedContainer.className = CONSTANTS.groupedContainerClassName;
  parentElement.insertBefore(groupedContainer, referenceParagraph);
  return groupedContainer;
}

function collectParagraphImages(paragraphElement: HTMLElement): HTMLElement[] {
  return Array.from(
    paragraphElement.querySelectorAll<HTMLElement>(CONSTANTS.imageSelector),
  );
}

function moveImagesIntoGroup(groupedContainer: HTMLElement, paragraphElement: HTMLElement): void {
  const images = collectParagraphImages(paragraphElement);
  images.forEach((image) => {
    groupedContainer.appendChild(image);
  });
  paragraphElement.remove();
}

function groupConsecutiveImageParagraphs(root: ParentNode): void {
  const paragraphElements = Array.from(
    root.querySelectorAll<HTMLElement>(CONSTANTS.paragraphSelector),
  );

  let currentGroup: HTMLElement | null = null;
  let currentParent: HTMLElement | null = null;

  paragraphElements.forEach((paragraphElement) => {
    const editableElement = paragraphElement.querySelector<HTMLElement>(
      CONSTANTS.editableSelector,
    );
    const isImageParagraph = isImageOnlyEditableBlock(editableElement);
    const paragraphParent = paragraphElement.parentElement;
    const parentChanged = paragraphParent !== currentParent;

    if (!isImageParagraph || !paragraphParent) {
      currentGroup = null;
      currentParent = null;
      return;
    }

    if (!currentGroup || parentChanged) {
      currentGroup = createGroupedContainer(paragraphElement);
      currentParent = paragraphParent;
    }

    if (!currentGroup) {
      return;
    }

    moveImagesIntoGroup(currentGroup, paragraphElement);
  });
}

function setImageWrapperStyle(element: HTMLElement, layout: ImageGridLayout): void {
  element.style.setProperty("--memo-image-columns", String(layout.columns));
  element.style.setProperty("--memo-image-gap", `${CONSTANTS.gridGap}px`);
  element.classList.add(CONSTANTS.imageBlockClassName);
  element.classList.add("memo-image-grid");
  element.classList.add(layout.className);

  if (layout.hiddenCount > 0) {
    element.classList.add(CONSTANTS.moreClassName);
  }
}

function appendOverlay(element: HTMLElement, hiddenCount: number): void {
  if (hiddenCount <= 0) {
    return;
  }

  const images = element.querySelectorAll<HTMLElement>(CONSTANTS.imageSelector);
  const lastVisibleImage = images[images.length - 1];
  if (!lastVisibleImage) {
    return;
  }

  const overlay = document.createElement("span");
  overlay.className = CONSTANTS.overlayClassName;
  overlay.textContent = `+${hiddenCount}`;
  lastVisibleImage.appendChild(overlay);
}

function normalizeImageGroup(groupedContainer: HTMLElement): void {
  const images = Array.from(
    groupedContainer.querySelectorAll<HTMLElement>(CONSTANTS.imageSelector),
  );
  if (!images.length) {
    return;
  }

  const layout = getImageGridLayout(images.length);
  const visibleImages = images.slice(0, layout.visibleCount);
  const hiddenImages = images.slice(layout.visibleCount);

  setImageWrapperStyle(groupedContainer, layout);
  hiddenImages.forEach((image) => image.remove());
  appendOverlay(groupedContainer, layout.hiddenCount);

  visibleImages.forEach((image) => {
    image.classList.add(CONSTANTS.imageItemClassName);
    if (layout.visibleCount === 1) {
      image.classList.add(CONSTANTS.singleImageItemClassName);
    }
  });
}

export function normalizeMemoImageLayout(root: ParentNode): void {
  groupConsecutiveImageParagraphs(root);

  const groupedContainers = root.querySelectorAll<HTMLElement>(
    `.${CONSTANTS.groupedContainerClassName}`,
  );

  groupedContainers.forEach((groupedContainer) => {
    normalizeImageGroup(groupedContainer);
  });
}
