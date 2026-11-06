/** Official Open Color hues (https://yeun.github.io/open-color/).
 * The chart UI mixes these swatches with a neutral surface to reduce saturation
 * without introducing a custom hue system. Hex values work on ECharts canvas.
 */
const HUES: Record<string, readonly string[]> = {
  red: ["#f03e3e", "#fa5252", "#ff6b6b", "#ff8787", "#ffa8a8", "#ffc9c9"],
  pink: ["#d6336c", "#e64980", "#f06595", "#f783ac", "#faa2c1", "#fcc2d7"],
  grape: ["#ae3ec9", "#be4bdb", "#cc5de8", "#da77f2", "#e599f7", "#eebefa"],
  violet: ["#7048e8", "#7950f2", "#845ef7", "#9775fa", "#b197fc", "#d0bfff"],
  indigo: ["#4263eb", "#4c6ef5", "#5c7cfa", "#748ffc", "#91a7ff", "#bac8ff"],
  blue: ["#1c7ed6", "#228be6", "#339af0", "#4dabf7", "#74c0fc", "#a5d8ff"],
  cyan: ["#1098ad", "#15aabf", "#22b8cf", "#3bc9db", "#66d9e8", "#99e9f2"],
  teal: ["#0ca678", "#12b886", "#20c997", "#38d9a9", "#63e6be", "#96f2d7"],
  green: ["#37b24d", "#40c057", "#51cf66", "#69db7c", "#8ce99a", "#b2f2bb"],
  lime: ["#74b816", "#82c91e", "#94d82d", "#a9e34b", "#c0eb75", "#d8f5a2"],
  yellow: ["#f59f00", "#fab005", "#fcc419", "#ffd43b", "#ffe066", "#ffec99"],
  orange: ["#f76707", "#fd7e14", "#ff922b", "#ffa94d", "#ffc078", "#ffd8a8"],
  gray: ["#495057", "#868e96", "#adb5bd", "#ced4da", "#dee2e6", "#e9ecef"],
};

/** Favor distinctive Open Color 5 swatches; preserve the established series order. */
const COLORFUL = ["blue", "orange", "teal", "grape", "cyan", "yellow", "green", "pink", "red", "violet", "indigo", "lime"];

export const CHART_PALETTE_HUES: Record<string, readonly string[]> = {
  colorful: COLORFUL.map(hue => HUES[hue][2]),
  bw: HUES.gray,
  blue: HUES.blue,
  yellow: HUES.yellow,
  green: HUES.green,
  purple: HUES.violet,
  teal: HUES.teal,
  orange: HUES.orange,
  pink: HUES.pink,
  red: HUES.red,
};

export function mixHexColor(foreground: string, background: string, ratio: number): string {
  const parse = (hex: string, index: number) => parseInt(hex.slice(index, index + 2), 16);
  const color = [1, 3, 5].map(i => {
    const value = Math.round(parse(foreground, i) * ratio + parse(background, i) * (1 - ratio));
    return value.toString(16).padStart(2, "0");
  });
  return "#" + color.join("");
}

export function chartPalette(key: string | undefined, isDark = false): string[] {
  const base = CHART_PALETTE_HUES[key && CHART_PALETTE_HUES[key] ? key : "colorful"];
  const bg = isDark ? "#343a40" : "#f8f9fa"; // Open Color gray-8 / gray-0
  if (key === "bw") {
    // Dark UI needs light gray series, not charcoal marks on charcoal canvas.
    return isDark
      ? ["#f1f3f5", "#dee2e6", "#ced4da", "#adb5bd", "#868e96", "#e9ecef"]
      : ["#343a40", "#495057", "#868e96", "#adb5bd", "#ced4da", "#dee2e6"];
  }
  // Lower chroma than Open Color's 5-6 steps; dark mode avoids light pastel
  // strokes that can appear fluorescent on #212529.
  return base.map(color => mixHexColor(color, bg, 0.72));
}