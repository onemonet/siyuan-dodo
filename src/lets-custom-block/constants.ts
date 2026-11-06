/**
 * 自定义块插件 - 常量配置
 */

export const DELAYS = {
  MUTATION_DEBOUNCE: 200,
  DOM_STABLE: 100,
  SLASH_INSERT: 200,
} as const;

export const CSS_CLASSES = {
  MATH: {
    WRAPPER: 'math-wrapper',
    RESULTS: 'math-results',
    CONTENT: 'math-content',
    RESULT_ROW: 'math-result-row',
    EXPRESSION: 'math-expression',
    EQUAL: 'math-equal',
    RESULT: 'math-result',
    EMPTY_HINT: 'math-empty-hint',
    EDIT_BUTTON: 'math-edit-button',
  },
  TOGGLE: {
    BUTTON: 'dodo-toggle-fold-button',
    DISABLED: 'dodo-toggle-disabled',
    FOLDABLE: 'dodo-toggle-foldable',
    LOADING: 'dodo-toggle-loading',
  },
  COMMON: {
    EDIT_MODE: 'edit-mode',
    BLOCKQUOTE: 'bq',
    PARAGRAPH: 'p',
  },
} as const;

export const ATTRIBUTES = {
  CUSTOM_BLOCK_TYPE: 'custom-dodo-block',
  TRIGGER_BY: 'data-trigger-by',
  DATA_TYPE: 'data-type',
  NODE_ID: 'data-node-id',
  FOLD: 'fold',
} as const;

export const SELECTORS = {
  BLOCKQUOTE: '[data-type="NodeBlockquote"]',
  PARAGRAPH_BLOCK: '[data-type="NodeParagraph"]',
  PARAGRAPH: '.p',
  FIRST_PARAGRAPH: '.p:first-child',
  CONTENTEDITABLE: 'div[contenteditable]',
  IMAGE: '.img',
  PROTYLE_ATTR: '.protyle-attr',
} as const;

export const SIYUAN_API = {
  CHECK_BLOCK_FOLD: '/api/block/checkBlockFold',
  FOLD_BLOCK: '/api/block/foldBlock',
  UNFOLD_BLOCK: '/api/block/unfoldBlock',
} as const;

export const MATHJS_CONFIG = {
  LOCAL_PATH: '/plugins/siyuan-dodo/asset/math.min.js',
  CDN_PATH: 'https://cdn.jsdelivr.net/npm/mathjs@15.1.0/lib/browser/math.min.js',
} as const;

export const ERROR_MESSAGES = {
  MATHJS_NOT_LOADED: '⚠️ 计算库加载中...',
  MATHJS_LOAD_FAILED: 'Math.js 加载失败',
} as const;

export const OBSERVER_CONFIG = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'fold'] as string[],
  attributeOldValue: true,
} as const;

export const IGNORED_CLASSES = [
  'edit-mode',
  'folded',
  'has-children',
  'no-children',
  'math',
  'toggle',
  'dodo-toggle-foldable',
  'dodo-toggle-disabled',
  'dodo-toggle-loading',
] as const;

export const DYNAMIC_CONTAINERS = [
  '.math-results',
  '.math-wrapper',
  '.dodo-toggle-fold-button',
] as const;
