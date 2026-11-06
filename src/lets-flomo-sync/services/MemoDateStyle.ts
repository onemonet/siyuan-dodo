export const MEMO_DATE_STYLE_ID = "dodo-flomo-memo-date-style";
export const MEMO_DATE_LABEL_ATTR = "data-dodo-memo-label";

export function getMemoDateDecorationCss(memoAttr: string): string {
  const memoSelector = `[${memoAttr}]`;

  return `
.protyle-wysiwyg ${memoSelector}[${MEMO_DATE_LABEL_ATTR}] {
  position: relative;
  background-color: var(--b3-theme-surface) !important;
  color: var(--b3-theme-on-background);
  margin-bottom: 0.5em;
  padding: 28px 8px 12px 8px;
}

.protyle-wysiwyg ${memoSelector}[${MEMO_DATE_LABEL_ATTR}]::before {
  content: attr(${MEMO_DATE_LABEL_ATTR});
  position: absolute;
  top: 6px;
  left: 0;
  font-size: 14px;
  color: var(--b3-theme-on-surface);
  background-color: var(--b3-theme-surface);
  white-space: nowrap;
  padding-left: 10px;
  opacity: 0.5;
  pointer-events: none;
}

.protyle-wysiwyg ${memoSelector}[${MEMO_DATE_LABEL_ATTR}] .img {
  display: inline-flex !important;
  overflow: hidden;
  margin: 4px 0;
  flex-grow: 1;
  flex-basis: 150px;
  max-width: 200px;
}

.mobile .protyle-wysiwyg ${memoSelector}[${MEMO_DATE_LABEL_ATTR}] .img {
  display: inline-flex !important;
  overflow: hidden;
  margin: 4px 0;
  flex-grow: 1;
  flex-basis: 100px;
  max-width: 200px;
}

.protyle-wysiwyg ${memoSelector}[${MEMO_DATE_LABEL_ATTR}] .img > span:nth-child(2) {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 6px;
  display: flex;
}

.protyle-wysiwyg ${memoSelector}[${MEMO_DATE_LABEL_ATTR}] div[contenteditable]:has(> .img) {
  display: flex;
  flex-wrap: wrap;
}

.protyle-wysiwyg ${memoSelector}[${MEMO_DATE_LABEL_ATTR}] .img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  aspect-ratio: 1 / 1;
}
`;
}
