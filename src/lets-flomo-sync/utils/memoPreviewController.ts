import {
  blurMemoImageContainer,
  collectMemoImageSources,
  getMemoImageSource,
  getTargetMemoPreviewImage,
} from "./memoDom";

const KEYBOARD = {
  enter: "Enter",
  space: " ",
} as const;

export interface MemoPreviewState {
  imageSources: string[];
  isVisible: boolean;
  activeIndex: number;
}

export interface MemoPreviewController {
  updateImages: () => MemoPreviewState;
  close: () => MemoPreviewState;
  handleClick: (event: MouseEvent) => MemoPreviewState | null;
  handleKeyDown: (event: KeyboardEvent) => MemoPreviewState | null;
}

export function createMemoPreviewController(
  getRootElement: () => HTMLElement | null,
): MemoPreviewController {
  let state: MemoPreviewState = {
    imageSources: [],
    isVisible: false,
    activeIndex: 0,
  };

  function updateImages(): MemoPreviewState {
    const rootElement = getRootElement();
    if (!rootElement) {
      state = { ...state, imageSources: [] };
      return state;
    }

    const imageSources = collectMemoImageSources(rootElement);
    if (!imageSources.length) {
      state = {
        ...state,
        imageSources,
        isVisible: false,
        activeIndex: 0,
      };
      return state;
    }

    state = {
      ...state,
      imageSources,
      activeIndex: Math.min(state.activeIndex, imageSources.length - 1),
    };
    return state;
  }

  function close(): MemoPreviewState {
    state = {
      ...state,
      isVisible: false,
    };
    return state;
  }

  function openFromImageElement(imageElement: HTMLImageElement): MemoPreviewState {
    blurMemoImageContainer(imageElement);
    const imageSource = getMemoImageSource(imageElement).trim();
    if (!imageSource) {
      return state;
    }

    updateImages();
    const matchedIndex = state.imageSources.indexOf(imageSource);
    state = {
      ...state,
      activeIndex: matchedIndex >= 0 ? matchedIndex : 0,
      isVisible: true,
    };
    return state;
  }

  function handleClick(event: MouseEvent): MemoPreviewState | null {
    const imageElement = getTargetMemoPreviewImage(event.target);
    if (!imageElement) {
      return null;
    }

    event.preventDefault();
    event.stopPropagation();
    return openFromImageElement(imageElement);
  }

  function handleKeyDown(event: KeyboardEvent): MemoPreviewState | null {
    if (event.key !== KEYBOARD.enter && event.key !== KEYBOARD.space) {
      return null;
    }

    const imageElement = getTargetMemoPreviewImage(event.target);
    if (!imageElement) {
      return null;
    }

    event.preventDefault();
    event.stopPropagation();
    return openFromImageElement(imageElement);
  }

  return {
    updateImages,
    close,
    handleClick,
    handleKeyDown,
  };
}
