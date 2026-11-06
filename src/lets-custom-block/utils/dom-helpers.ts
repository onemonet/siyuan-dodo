/**
 * DOM 操作辅助函数
 */

/**
 * 检查块是否有子块
 * @param block 块元素
 * @returns 是否有子块
 */
export function hasChildBlocks(block: HTMLElement): boolean {
  const children = block.children;
  if (children.length <= 1) return false;

  // 检查是否有实际的子块内容（排除空的或只有换行的元素）
  for (let i = 1; i < children.length; i++) {
    const child = children[i];
    if (child.tagName.toLowerCase() === "p") {
      const textDiv = child.querySelector("div[contenteditable]");
      if (textDiv && textDiv.textContent?.trim()) {
        return true;
      }
    } else if (child.children.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * 获取块的第一个段落元素
 * @param block 块元素
 * @returns 第一个段落元素或 null
 */
export function getFirstParagraph(block: HTMLElement): HTMLElement | null {
  return block.querySelector('.p:first-child') as HTMLElement | null;
}

/**
 * 获取可编辑内容 div
 * @param element 元素
 * @returns 可编辑 div 或 null
 */
export function getContentEditableDiv(element: HTMLElement): HTMLElement | null {
  return element.querySelector('div[contenteditable]:not(.protyle-attr)') as HTMLElement | null;
}
