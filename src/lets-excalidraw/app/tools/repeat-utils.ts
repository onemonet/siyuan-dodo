import { newId, randomNonce } from "./scene-commands";

type Color = { h: number; s: number; l: number; a: number };
function hexToHsla(hex?: string): Color {
  if (!hex || hex === "transparent") return { h: 0, s: 0, l: 0, a: 0 };
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  let hue = 0, saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
    if (max === green) hue = ((blue - red) / delta + 2) / 6;
    if (max === blue) hue = ((red - green) / delta + 4) / 6;
  }
  return { h: hue * 360, s: saturation * 100, l: lightness * 100, a: alpha };
}
function hslaToHex(h: number, s: number, l: number, a: number) {
  if (a <= 0) return "transparent";
  const saturation = s / 100, lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1)), match = lightness - chroma / 2;
  const channels = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x]
    : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  const color = channels.map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("");
  const alphaHex = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
  return a < 1 ? `#${color}${alphaHex}` : `#${color}`;
}
function colorDelta(fromColor: string, toColor: string) {
  const from = hexToHsla(fromColor), to = hexToHsla(toColor);
  return { isTransparent: from.a === 0 || to.a === 0, base: to,
    delta: { h: to.h - from.h, s: to.s - from.s, l: to.l - from.l, a: to.a - from.a } };
}
function nextColor(change: ReturnType<typeof colorDelta>, step: number) {
  if (change.isTransparent) return "transparent";
  const { base, delta } = change;
  return hslaToHex(base.h + delta.h * step,
    Math.max(0, Math.min(100, base.s + delta.s * step)),
    Math.max(0, Math.min(100, base.l + delta.l * step)),
    Math.max(0, Math.min(1, base.a + delta.a * step)));
}
function scaleLinearPoints(element: any, initialWidth: number, initialHeight: number, nextWidth: number, nextHeight: number) {
  if (!Array.isArray(element.points) || !element.points.length) return;
  const minX = Math.min(...element.points.map((point: number[]) => point[0]));
  const minY = Math.min(...element.points.map((point: number[]) => point[1]));
  element.points = element.points.map(([x, y]: [number, number]) => [
    initialWidth > 0 && x > minX ? x + (x - minX) / initialWidth * (nextWidth - initialWidth) : x,
    initialHeight > 0 && y > minY ? y + (y - minY) / initialHeight * (nextHeight - initialHeight) : y,
  ]);
}
export const repeatSelection = (elements: readonly any[]) => [...elements].filter(element => element && !element.isDeleted)
  .sort((a,b) => a.x - b.x || a.y - b.y || (a.width || 0) - (b.width || 0) || (a.height || 0) - (b.height || 0));
export const canRepeat = (elements: readonly any[]) => {
  const sorted = repeatSelection(elements);
  return sorted.length === 2 && sorted[0].type === sorted[1].type;
};
export function clampRepeatCount(value: string | number) {
  const count = parseInt(String(value), 10);
  return Number.isFinite(count) ? Math.max(1, Math.min(99, count)) : 1;
}
export function createRepeatElements(source: readonly any[], count: number) {
  const [first, second] = repeatSelection(source);
  if (!first || !second || first.type !== second.type) return [];
  const posX = second.x - first.x, posY = second.y - first.y;
  const sizeX = (second.width || 0) - (first.width || 0), sizeY = (second.height || 0) - (first.height || 0);
  const angle = (second.angle || 0) - (first.angle || 0);
  const background = colorDelta(first.backgroundColor, second.backgroundColor);
  const stroke = colorDelta(first.strokeColor, second.strokeColor);
  return Array.from({ length: clampRepeatCount(count) }, (_, index) => {
    const step = index + 1, now = Date.now();
    const clone = structuredClone(second);
    Object.assign(clone, { id: newId(), seed: randomNonce(), version: 1, versionNonce: randomNonce(),
      updated: now, isDeleted: false, boundElements: null, x: second.x + posX * step, y: second.y + posY * step,
      angle: (second.angle || 0) + angle * step });
    const initialWidth = clone.width || 0, initialHeight = clone.height || 0;
    const nextWidth = initialWidth + sizeX * step, nextHeight = initialHeight + sizeY * step;
    if (nextWidth >= 0 && nextHeight >= 0) {
      if (["arrow", "line", "freedraw"].includes(clone.type)) scaleLinearPoints(clone, initialWidth, initialHeight, nextWidth, nextHeight);
      else { if (typeof clone.width === "number") clone.width = nextWidth; if (typeof clone.height === "number") clone.height = nextHeight; }
    }
    clone.backgroundColor = nextColor(background, step);
    clone.strokeColor = nextColor(stroke, step);
    return clone;
  });
}
