import { BlockquoteHandler } from "../types";
import { ATTRIBUTES } from "../constants";
import { CalculatorFactory } from "../calculators/CalculatorFactory";
import { MathJsLoader } from "../utils/mathjs-loader";
import { getContentEditableDiv } from "../utils/dom-helpers";
import { settings } from "../../settings";

/**
 * 段落块 Math 类型处理器
 * 处理 custom-dodo-block="math" 的段落块，使用伪元素显示计算结果
 */
export class MathParagraphHandler implements BlockquoteHandler {
  readonly type = "math";

  initialize() {
    MathJsLoader.load().then(() => {
      CalculatorFactory.initialize();
      this.processAllMathParagraphs();
    });
  }

  process(element: HTMLElement) {
    const contentDiv = getContentEditableDiv(element);
    if (!contentDiv) return;
    
    const expression = contentDiv.textContent?.trim() || '';
    if (!expression) {
      this.clearResult(element, contentDiv);
      return;
    }
    
    const result = CalculatorFactory.calculate(expression);
    
    contentDiv.setAttribute('data-math-result', result);
    element.setAttribute('data-math-result', result);
  }

  private clearResult(element: HTMLElement, contentDiv: HTMLElement) {
    contentDiv.removeAttribute('data-math-result');
    element.removeAttribute('data-math-result');
  }

  cleanup(element: HTMLElement) {
    const contentDiv = getContentEditableDiv(element);
    if (contentDiv) {
      contentDiv.removeAttribute('data-math-result');
    }
    element.removeAttribute('data-math-result');
    element.removeAttribute(ATTRIBUTES.CUSTOM_BLOCK_TYPE);
  }

  destroy() {
  }

  private processAllMathParagraphs() {
    const mathEnabled = settings.getBySpace("custom-block", "math-enabled") ?? true;
    if (!mathEnabled) {
      const mathBlocks = document.querySelectorAll('[data-type="NodeParagraph"][custom-dodo-block="math"]');
      mathBlocks.forEach(block => {
        const contentDiv = getContentEditableDiv(block as HTMLElement);
        if (contentDiv) {
          contentDiv.removeAttribute('data-math-result');
        }
        (block as HTMLElement).removeAttribute('data-math-result');
      });
      return;
    }
    
    const mathBlocks = document.querySelectorAll('[data-type="NodeParagraph"][custom-dodo-block="math"]');
    mathBlocks.forEach(block => this.process(block as HTMLElement));
  }
}
