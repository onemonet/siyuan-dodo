import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { ExcalidrawEyedropperIcon } from "./excalidraw-core-icons";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { SelectionContext } from "../toolbar/types";
import { randomNonce } from "./scene-commands";

export const TRANSPARENT = "transparent";
export const DEFAULT_COLOR = "#1e1e1e";
const PALETTE: Record<string, string[]> = {
  gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
  red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
  pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
  grape: ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
  violet: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
  blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
  cyan: ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
  teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
  green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
  yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
  orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
  bronze: ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"],
};
const RAMP_KEYS = ["cyan", "blue", "violet", "grape", "pink", "green", "teal", "yellow", "orange", "red"];
export const palette = (index: number) => ["#ffffff", PALETTE.gray[index], DEFAULT_COLOR, PALETTE.bronze[index], ...RAMP_KEYS.map(key => PALETTE[key][index])];
const currentShades = (color: string) => Object.values(PALETTE).find(shades => shades.includes(color.toLowerCase())) || [];
export const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isNaN(number) ? fallback : Math.max(min, Math.min(max, number));
};
export const visibleColor = (elements: readonly any[], key: string, fallback: string) =>
  elements.find(element => element[key] && element[key] !== TRANSPARENT)?.[key] || fallback;
export const colorForInput = (color: string) => /^#([\da-f]{3}|[\da-f]{6})$/i.test(color) ? color : DEFAULT_COLOR;
/** Matches the original toolbar: a shared color is shown, mixed/transparent uses default. */
export const toolbarColor = (elements: readonly any[], key: string, fallback = DEFAULT_COLOR) => {
  const colors = new Set(elements.map(element => element[key] && element[key] !== TRANSPARENT ? colorForInput(element[key]) : TRANSPARENT));
  return colors.size === 1 && !colors.has(TRANSPARENT) ? [...colors][0] : fallback;
};
export function ColorCircleIcon({ color, filled }: { color: string; filled?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r={filled ? 10 : 8} fill={filled ? colorForInput(color) : "none"} stroke={filled ? "var(--dt-color-icon-outline, #b8b8c2)" : colorForInput(color)} strokeWidth={filled ? 1.5 : 4}/>
  </svg>;
}

/** Patch selected objects once and preserve the original default-tool app-state keys. */
export function applyStylePatch(context: SelectionContext, targets: readonly any[], patch: Record<string, any> | ((element: any) => Record<string, any>), defaults: Record<string, unknown> = {}) {
  const ids = new Set(targets.map(element => element.id));
  if (!ids.size) return false;
  let changed = false;
  const now = Date.now();
  const elements = context.api.getSceneElements().map((element: any) => {
    if (!ids.has(element.id)) return element;
    const next = typeof patch === "function" ? patch(element) : patch;
    if (!next || !Object.keys(next).some(key => element[key] !== next[key])) return element;
    changed = true;
    return { ...element, ...next, version: (element.version || 0) + 1, versionNonce: randomNonce(), updated: now };
  });
  if (!changed && !Object.keys(defaults).length) return false;
  context.api.updateScene({ ...(changed ? { elements } : {}),
    ...(Object.keys(defaults).length ? { appState: { ...context.api.getAppState(), ...defaults } } : {}),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return true;
}
export function Field({ name, value, action, children }: { name: string; value?: string | number; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="dt-style-field"><div className="dt-style-label"><span>{name}</span>{action}{value !== undefined && <span className="dt-muted">{value}</span>}</div>{children}</div>;
}
export function Segmented<T extends string | number>({ items, active, onChange }: { items: readonly { value: T; label: string; icon?: React.ReactNode }[]; active: T; onChange: (value: T) => void }) {
  return <div className="dt-style-segments" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
    {items.map(item => <button type="button" key={item.value} title={item.label} aria-label={item.label} aria-pressed={item.value === active} onClick={() => onChange(item.value)}>{item.icon || item.label}</button>)}
  </div>;
}
export function Range({ name, value, min, max, step, onChange, suffix = "" }: { name: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; suffix?: string }) {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return <Field name={name}>
    <div className="dt-range-wrapper">
      <input aria-label={name} className="dt-range-input" type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))}
        style={{ background: `linear-gradient(to right, var(--dt-slider-fill) ${percentage}%, var(--dt-slider-track) ${percentage}%)` }}/>
      {value !== min && <span className="dt-range-zero">{min}</span>}
      <span className="dt-range-value" style={{ left: `calc(${percentage}% + ${(0.5 - percentage / 100) * 16}px)` }}>{value}{suffix}</span>
    </div>
  </Field>;
}
/** Shared color popover inside the enhancement layer (outside the scroll-clipped menu). */
function CustomColorPopover({ label, value, onChange, anchor, close, popupClassName }: {
  label: string; value: string; onChange: (color: string) => void;
  anchor: HTMLButtonElement; close: () => void; popupClassName?: string;
}) {
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [picking, setPicking] = useState(false);
  const eyeDropperSupported = typeof (window as any).EyeDropper === "function" && window.isSecureContext;
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = popover.current?.offsetWidth || 230;
      const height = popover.current?.offsetHeight || 280;
      const left = Math.max(8, Math.min(rect.right + 8 + width <= innerWidth - 8 ? rect.right + 8 : rect.left - width - 8, innerWidth - width - 8));
      const top = Math.max(8, Math.min(rect.top, innerHeight - height - 8));
      setPosition(current => current.left === left && current.top === top ? current : { left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
      anchor.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (popover.current?.contains(event.target as Node) || anchor.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onPointer, true); };
  }, [anchor, close]);
  const pickScreen = async () => {
    if (!eyeDropperSupported || picking) return;
    setPicking(true);
    try {
      const picker = new (window as any).EyeDropper();
      const result = await picker.open();
      if (result?.sRGBHex) onChange(result.sRGBHex.toLowerCase());
    } catch (error: any) {
      // User-initiated Escape / cancel is expected and should not show an error.
      if (error?.name !== "AbortError") console.warn("EyeDropper unavailable:", error);
    } finally { setPicking(false); }
  };
  return <div ref={popover} className={["dt-custom-color-popover", popupClassName].filter(Boolean).join(" ")} role="dialog" aria-label={`${label}取色器`} style={position}>
    <HexColorPicker color={colorForInput(value)} onChange={onChange}/>
    <div className="dt-custom-color-controls">
      <span className="dt-custom-color-preview" style={{ backgroundColor: colorForInput(value) }} aria-hidden="true"/>
      <label className="dt-custom-color-hex">HEX <HexColorInput color={colorForInput(value)} onChange={onChange} prefixed aria-label={`${label} HEX`}/></label>
      {eyeDropperSupported && <button type="button" className="dt-custom-eyedropper" title="从屏幕取色" aria-label="从屏幕取色" disabled={picking} onClick={() => void pickScreen()}>
        <ExcalidrawEyedropperIcon/>
      </button>}
      <button type="button" className="dt-custom-color-close" aria-label="关闭取色器" title="关闭取色器" onClick={close}>×</button>
    </div>
  </div>;
}

export function ColorField({ name, color, allowTransparent, index, onChange, popupClassName }: { name: string; color: string; allowTransparent?: boolean; index: number; onChange: (color: string) => void; popupClassName?: string }) {
  const [shade, setShade] = useState(index);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const shades = currentShades(color);
  const swatches = [...(allowTransparent ? [TRANSPARENT] : []), ...palette(shades.length ? shades.indexOf(color.toLowerCase()) : shade)];
  return <Field name={name} action={<button ref={trigger} className="dt-color-trigger-button" type="button" aria-label={`打开${name}取色器`} title="自定义取色" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <ExcalidrawEyedropperIcon/>
    </button>}>
    <div className="dt-style-swatches">{swatches.map((item, i) => <button key={`${i}-${item}`} aria-label={item} title={item} type="button" aria-pressed={color === item} className={item === TRANSPARENT ? "dt-transparent-swatch" : ""} style={item === TRANSPARENT ? undefined : { backgroundColor: item }} onClick={() => { onChange(item); if (shades.length) setShade(shades.indexOf(color.toLowerCase())); }}/>)}</div>
    <div className="dt-style-shade-area"><div className="dt-style-shade-title">色调明暗</div>
      {shades.length > 0 ? <div className="dt-style-swatches dt-style-shades">{shades.map((item, i) => <button key={item} type="button" title={item} aria-label={`色调 ${i+1}`} aria-pressed={color === item} data-tone-contrast={i < 3 ? "dark" : "light"} style={{ backgroundColor: item }} onClick={() => {setShade(i); onChange(item);}}><span className="dt-shade-number" aria-hidden="true">{i+1}</span></button>)}</div>
        : <div className="dt-style-shade-empty">此颜色没有可用的明暗变化</div>}
    </div>
    {open && trigger.current && createPortal(<CustomColorPopover label={name} value={color} anchor={trigger.current} onChange={onChange} close={() => setOpen(false)} popupClassName={popupClassName}/>, trigger.current.closest(".dt-layer") || document.body)}
  </Field>;
}
