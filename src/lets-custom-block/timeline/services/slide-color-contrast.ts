/** Return true when dark text contrasts better than white text on a solid slide. */
type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Rgba | null {
  const color = value.trim().toLowerCase();
  if (color === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(color);
  if (hex) {
    const short = hex[1].length <= 4;
    const parts = short ? hex[1].split("").map(c => parseInt(c + c, 16)) :
      (hex[1].match(/../g) || []).map(c => parseInt(c, 16));
    return { r: parts[0], g: parts[1], b: parts[2], a: (parts[3] ?? 255) / 255 };
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/.exec(color);
  if (!rgb) return null;
  const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const a = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if ([r, g, b].some(v => v > 255) || a < 0 || a > 1) return null;
  return { r, g, b, a };
}

export function isLightTimelineColor(color: string, canvas: string): boolean {
  // The canvas is the actual theme background when a slide is transparent.
  const base = parseColor(canvas) ?? { r: 255, g: 255, b: 255, a: 1 };
  const foreground = parseColor(color) ?? base;
  const blended = [foreground.r, foreground.g, foreground.b].map((channel, index) => {
    const backgroundChannel = [base.r, base.g, base.b][index];
    const srgb = (channel * foreground.a + backgroundChannel * (1 - foreground.a)) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * blended[0] + 0.7152 * blended[1] + 0.0722 * blended[2];
  // WCAG relative luminance: black has better contrast than white above ~0.179.
  return luminance >= 0.179;
}