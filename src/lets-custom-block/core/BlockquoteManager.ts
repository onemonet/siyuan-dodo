import { settings } from "../../settings";
import { ToggleBlockquoteHandler } from "../handlers/ToggleBlockquoteHandler";
import { MathParagraphHandler } from "../handlers/MathParagraphHandler";
import {
  ATTRIBUTES,
  CSS_CLASSES,
  DELAYS,
  DYNAMIC_CONTAINERS,
  IGNORED_CLASSES,
  OBSERVER_CONFIG,
  SELECTORS,
} from "../constants";
import { BlockquoteHandler, BlockquoteRule } from "../types";
import {
  isCustomBlockDebugEnabled,
  logCustomBlockDebug,
  startCustomBlockTimer,
} from "../utils/debug";

export class BlockquoteManager {
  private handlers: Map<string, BlockquoteHandler> = new Map();
  private rules: BlockquoteRule[] = [];
  private observer: MutationObserver | null = null;
  private flushTimer: number | null = null;
  private readonly pendingElements = new Set<HTMLElement>();
  private readonly relevantSelector = [
    SELECTORS.BLOCKQUOTE,
    `${SELECTORS.PARAGRAPH_BLOCK}[${ATTRIBUTES.CUSTOM_BLOCK_TYPE}="math"]`,
  ].join(", ");
  private readonly dynamicContainerSelector = DYNAMIC_CONTAINERS.join(", ");

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers() {
    this.registerHandler(new MathParagraphHandler());
    this.registerHandler(new ToggleBlockquoteHandler());
  }

  registerHandler(handler: BlockquoteHandler) {
    this.handlers.set(handler.type, handler);

    const rule = this.getHandlerRule(handler);
    if (!rule) {
      return;
    }

    this.rules.push(rule);
    this.rules.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  }

  private getHandlerRule(handler: BlockquoteHandler): BlockquoteRule | null {
    const getConfig = (key: string, defaultValue: any) => {
      return settings.getBySpace("custom-block", key) ?? defaultValue;
    };

    const isEnabled = (type: string) => {
      return getConfig(`${type}-enabled`, true);
    };

    if (!isEnabled(handler.type)) {
      return null;
    }

    const ruleMap: Record<string, BlockquoteRule> = {
      math: {
        type: "math",
        className: "math",
        regex: /(?!)/,
        priority: 1,
      },
      toggle: {
        type: "toggle",
        className: "toggle",
        regex: /(?!)/,
        priority: 2,
      },
    };

    return ruleMap[handler.type] || null;
  }

  async initialize() {
    if (isCustomBlockDebugEnabled()) {
      logCustomBlockDebug("debug.enabled", {
        feature: "custom-block",
      });
    }

    for (const handler of this.handlers.values()) {
      handler.initialize?.();
    }

    this.startObserver();
  }

  private startObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (isCustomBlockDebugEnabled()) {
        logCustomBlockDebug("observer.batch", {
          mutationCount: mutations.length,
        });
      }

      const candidates = new Set<HTMLElement>();

      for (const mutation of mutations) {
        this.collectMutationTargets(mutation, candidates);
      }

      if (!candidates.size) {
        return;
      }

      for (const element of candidates) {
        this.pendingElements.add(element);
      }

      logCustomBlockDebug("observer.candidates", {
        candidateCount: candidates.size,
        pendingCount: this.pendingElements.size,
      });

      this.scheduleFlush();
    });

    this.observer.observe(document.body, OBSERVER_CONFIG);
  }

  private collectMutationTargets(
    mutation: MutationRecord,
    candidates: Set<HTMLElement>
  ) {
    const target = mutation.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (this.isInsideDynamicContainer(target)) {
      return;
    }

    if (mutation.type === "attributes") {
      if (mutation.attributeName === ATTRIBUTES.FOLD) {
        this.addRelevantAncestor(target, candidates);
        return;
      }

      if (mutation.attributeName !== "class") {
        return;
      }

      if (!this.hasMeaningfulClassChange(target, mutation.oldValue || "")) {
        return;
      }

      this.addRelevantAncestor(target, candidates);
      return;
    }

    if (mutation.type !== "childList" || this.isManagedChildMutation(mutation)) {
      return;
    }

    this.addRelevantAncestor(target, candidates);

    mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        this.collectRelevantElements(node, candidates);
      }
    });
  }

  private hasMeaningfulClassChange(element: HTMLElement, oldValue: string): boolean {
    if (!this.isRelevantElement(element)) {
      return false;
    }

    const oldClasses = oldValue
      .split(" ")
      .filter((className) => className && !IGNORED_CLASSES.includes(className as any))
      .sort()
      .join(" ");
    const newClasses = element.className
      .split(" ")
      .filter((className) => className && !IGNORED_CLASSES.includes(className as any))
      .sort()
      .join(" ");

    return oldClasses !== newClasses;
  }

  private isManagedChildMutation(mutation: MutationRecord): boolean {
    const managedElements = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
      .filter((node): node is HTMLElement => node instanceof HTMLElement);

    if (!managedElements.length) {
      return false;
    }

    return managedElements.every((element) => this.isManagedElement(element));
  }

  private isManagedElement(element: HTMLElement): boolean {
    if (element.classList.contains(CSS_CLASSES.TOGGLE.BUTTON)) {
      return true;
    }

    return this.isInsideDynamicContainer(element);
  }

  private isInsideDynamicContainer(element: HTMLElement): boolean {
    return !!(
      this.dynamicContainerSelector &&
      element.closest(this.dynamicContainerSelector)
    );
  }

  private collectRelevantElements(root: HTMLElement, candidates: Set<HTMLElement>) {
    if (this.isInsideDynamicContainer(root)) {
      return;
    }

    if (this.isRelevantElement(root)) {
      candidates.add(root);
    }

    root.querySelectorAll(this.relevantSelector).forEach((element) => {
      candidates.add(element as HTMLElement);
    });
  }

  private addRelevantAncestor(element: HTMLElement, candidates: Set<HTMLElement>) {
    if (this.isRelevantElement(element)) {
      candidates.add(element);
      return;
    }

    const relevantAncestor = element.closest(this.relevantSelector);
    if (relevantAncestor instanceof HTMLElement) {
      candidates.add(relevantAncestor);
    }
  }

  private isRelevantElement(element: HTMLElement): boolean {
    if (element.getAttribute(ATTRIBUTES.DATA_TYPE) === "NodeBlockquote") {
      return true;
    }

    return (
      element.getAttribute(ATTRIBUTES.DATA_TYPE) === "NodeParagraph" &&
      element.getAttribute(ATTRIBUTES.CUSTOM_BLOCK_TYPE) === "math"
    );
  }

  private scheduleFlush() {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
    }

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flushPendingElements();
    }, DELAYS.DOM_STABLE);
  }

  private flushPendingElements() {
    const stopTimer = startCustomBlockTimer("observer.flush", {
      pendingCount: this.pendingElements.size,
    });
    const elements = Array.from(this.pendingElements);
    this.pendingElements.clear();

    elements.forEach((element) => {
      if (element.isConnected) {
        this.processBlock(element);
      }
    });

    stopTimer({ processedCount: elements.length });
  }

  applyToAll() {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.pendingElements.clear();

    document.querySelectorAll(SELECTORS.BLOCKQUOTE).forEach((element) => {
      this.processBlock(element as HTMLElement);
    });

    document
      .querySelectorAll(
        `${SELECTORS.PARAGRAPH_BLOCK}[${ATTRIBUTES.CUSTOM_BLOCK_TYPE}="math"]`
      )
      .forEach((element) => {
        this.processBlock(element as HTMLElement);
      });
  }

  private processBlock(element: HTMLElement) {
    const blockType = element.getAttribute(ATTRIBUTES.DATA_TYPE);

    if (blockType === "NodeParagraph") {
      const customType = element.getAttribute(ATTRIBUTES.CUSTOM_BLOCK_TYPE);
      if (customType === "math") {
        const mathEnabled = settings.getBySpace("custom-block", "math-enabled") ?? true;
        if (!mathEnabled) {
          const handler = this.handlers.get("math");
          handler?.cleanup?.(element);
          return;
        }

        this.handlers.get("math")?.process(element);
      }
      return;
    }

    const customType = element.getAttribute(ATTRIBUTES.CUSTOM_BLOCK_TYPE);
    let matchedRule: BlockquoteRule | null = null;

    if (customType) {
      matchedRule = this.rules.find((rule) => rule.type === customType) || null;
    }

    if (!matchedRule) {
      const firstParagraph = element.querySelector(SELECTORS.PARAGRAPH);
      const textDiv = firstParagraph?.querySelector(SELECTORS.CONTENTEDITABLE);
      if (!textDiv) {
        return;
      }

      const text = (textDiv.textContent || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();

      for (const rule of this.rules) {
        if (rule.regex.test(text)) {
          matchedRule = rule;
          break;
        }
      }
    }

    const currentClasses = Array.from(element.classList);
    const shouldHaveClass = matchedRule?.className || null;
    const hasMatchedClass = !!shouldHaveClass && currentClasses.includes(shouldHaveClass);

    const hasRuleClass = currentClasses.some((className) =>
      this.rules.some((rule) => rule.className === className)
    );
    const needsUpdate =
      hasRuleClass !== !!shouldHaveClass || (!!shouldHaveClass && !hasMatchedClass);

    if (!needsUpdate && hasMatchedClass) {
      const handler = this.handlers.get(matchedRule!.type);
      if (handler && this.checkNeedsReprocess(element, matchedRule!.type)) {
        handler.process(element);
      }
      return;
    }

    for (const rule of this.rules) {
      if (!element.classList.contains(rule.className)) {
        continue;
      }

      this.handlers.get(rule.type)?.cleanup?.(element);
      element.classList.remove(rule.className);
    }

    if (!matchedRule) {
      return;
    }

    element.classList.add(matchedRule.className);
    this.handlers.get(matchedRule.type)?.process(element);
  }

  private checkNeedsReprocess(element: HTMLElement, type: string): boolean {
    if (type === "math") {
      return element.getAttribute(ATTRIBUTES.DATA_TYPE) === "NodeParagraph";
    }

    if (type === "toggle") {
      return element.getAttribute(ATTRIBUTES.DATA_TYPE) === "NodeBlockquote";
    }

    return false;
  }

  destroy() {
    this.observer?.disconnect();
    this.observer = null;

    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.pendingElements.clear();

    for (const handler of this.handlers.values()) {
      handler.destroy?.();
    }

    document.querySelectorAll(SELECTORS.BLOCKQUOTE).forEach((element) => {
      const blockquote = element as HTMLElement;
      for (const rule of this.rules) {
        if (!blockquote.classList.contains(rule.className)) {
          continue;
        }

        this.handlers.get(rule.type)?.cleanup?.(blockquote);
        blockquote.classList.remove(rule.className);
      }
    });

    this.handlers.clear();
    this.rules = [];
  }
}
