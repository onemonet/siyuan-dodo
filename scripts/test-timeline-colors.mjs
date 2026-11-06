import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLightTimelineColor } from "../dist/preview/timeline/services/slide-color-contrast.js";

// Foreground text must remain readable on white, gray, black and translucent slides.
assert.equal(isLightTimelineColor("#ffffff", "#212529"), true);
assert.equal(isLightTimelineColor("#fff", "#212529"), true);
assert.equal(isLightTimelineColor("rgb(255, 255, 255)", "#212529"), true);
assert.equal(isLightTimelineColor("#e9ecef", "#ffffff"), true);
assert.equal(isLightTimelineColor("#777777", "#ffffff"), true);
assert.equal(isLightTimelineColor("#212529", "#ffffff"), false);
assert.equal(isLightTimelineColor("rgb(0, 0, 0)", "#ffffff"), false);
assert.equal(isLightTimelineColor("rgba(255, 255, 255, 0)", "#212529"), false);
assert.equal(isLightTimelineColor("rgba(255, 255, 255, 0)", "#ffffff"), true);

const css = readFileSync("dist/preview/timeline/iframe/app.css", "utf8");
assert.match(css, /#timeline \.tl-timegroup \.tl-timegroup-message/);
// 8 Open Color tints: blue, orange, teal, grape, cyan, yellow, green, pink.
const lightPalette = ["#e7f5ff", "#fff4e6", "#e6fcf5", "#f8f0fc", "#e3fafc", "#fff9db", "#ebfbee", "#fff0f6"];
const darkPalette = ["#1864ab", "#d9480f", "#087f5b", "#862e9c", "#0b7285", "#e67700", "#2b8a3e", "#a61e4d"];
for (let i = 0; i < 8; i++) {
  assert.match(css, new RegExp('--tl-group-palette-' + i + ': ' + lightPalette[i], 'i'));
  assert.match(css, new RegExp('color-mix\\(in srgb, ' + darkPalette[i], 'i'));
  assert.match(css, new RegExp('data-dodo-group-color="' + i + '"'));
}
assert.doesNotMatch(css, /--tl-group-palette-8:/);
assert.match(css, /text-shadow: none !important/);
assert.match(css, /\.dodo-timeline-light-bg/);
assert.match(css, /color: var\(--tl-on-light-bg\) !important/);
assert.match(css, /color: var\(--tl-on-light-muted\) !important/);
const entry = readFileSync("dist/preview/timeline/iframe/main.js", "utf8");
assert.match(entry, /\.tl-timegroup-message/);
assert.match(entry, /setProperty\("color",\s*groupTextColor,\s*"important"\)/);
assert.match(entry, /index % 8/);
assert.match(entry, /dataset\.dodoGroupColor/);
assert.match(entry, /setProperty\("text-shadow",\s*"none",\s*"important"\)/);
const html = readFileSync("dist/preview/timeline/iframe/index.html", "utf8");
assert.match(html, /app\.css\?v=20261019-opencolor8-restore/);
assert.match(html, /main\.js\?v=20261019-unified-views/);
console.log("PASS: timeline groups (CSS + runtime override) and slide text contrast");