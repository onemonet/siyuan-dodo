import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { ToolbarMenuOption } from "../toolbar/ToolbarMenuOption";

/** Keep property portals inside the canvas enhancement layer, above scrollable menus. */
const layerContainer = () => document.querySelector<HTMLElement>(".dt-layer") || document.body;

/** Compact property trigger; reuses the exact toolbar secondary-menu list, rows and CSS. */
export function CompactSelect<T extends string>({ name, value, options, onChange }: {
  name: string; value: T; options: readonly { value: T; label: string; icon: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  const selected = options.find(option => option.value === value) ?? options[0];
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      const popup = menu.current;
      if (!rect || !popup) return;
      const width = popup.offsetWidth, height = popup.offsetHeight;
      const below = innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const placeBelow = below >= height || below >= above;
      popup.style.maxHeight = `${Math.max(32, placeBelow ? below : above)}px`;
      popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
      popup.style.top = `${placeBelow ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`;
    };
    place();
    menu.current.querySelector<HTMLButtonElement>('[data-selected="true"]')?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (trigger.current?.contains(event.target as Node) || menu.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  const moveFocus = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const items = [...menu.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') || []];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  };
  return <div className="dt-compact-field">
    <span className="dt-compact-field-label">{name}</span>
    <div className="dt-compact-property dt-compact-select">
      <button ref={trigger} type="button" className="dt-select-trigger" aria-label={name}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(previous => !previous)}
        onKeyDown={event => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) && !open) {
            event.preventDefault(); event.stopPropagation(); setOpen(true);
          }
        }}>
        <span className="dt-compact-symbol" aria-hidden="true">{selected.icon}</span>
        <span className="dt-compact-selected-label">{selected.label}</span>
        <ChevronDown className="dt-compact-chevron" size={12} strokeWidth={1.5} aria-hidden="true"/>
      </button>
    </div>
    {open && createPortal(<div ref={menu} className="dt-popover dt-property-menu" data-layout="list" role="menu" aria-label={name}
      onKeyDown={moveFocus}>
      {options.map(option => <ToolbarMenuOption key={option.value} icon={option.icon} label={option.label}
        selected={option.value === value} onSelect={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}/>) }
    </div>, layerContainer())}
  </div>;
}

function constrain(value: number, min: number, max: number, step: number) {
  const decimalPlaces = (String(step).split(".")[1] ?? "").length;
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(decimalPlaces));
}

/**
 * Click and type for precision; drag the icon horizontally for continuous adjustment.
 * Selection / app-state writes remain with each owning panel, not this component.
 */
export function CompactNumber({ name, value, min, max, step, unit, icon, onChange }: {
  name: string; value: number; min: number; max: number; step: number;
  unit?: string; icon: React.ReactNode; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const edit = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);
  const scrub = useRef<{ pointerId: number; x: number; value: number; last: number } | null>(null);
  useEffect(() => {
    if (document.activeElement !== edit.current) setDraft(String(value));
  }, [value]);
  const update = (value: number) => {
    const next = constrain(value, min, max, step);
    setDraft(String(next));
    if (next !== scrub.current?.last) onChange(next);
    if (scrub.current) scrub.current.last = next;
  };
  const commit = () => {
    const parsed = Number(draft.trim());
    if (!draft.trim() || !Number.isFinite(parsed)) { setDraft(String(value)); return; }
    const next = constrain(parsed, min, max, step);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return <div className="dt-compact-field">
    <span className="dt-compact-field-label">{name}</span>
    <div className="dt-compact-property dt-compact-number">
    <button type="button" className="dt-compact-scrub" aria-label={`拖动调整${name}`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        scrub.current = { pointerId: event.pointerId, x: event.clientX, value, last: value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const state = scrub.current;
        if (!state || state.pointerId !== event.pointerId) return;
        event.stopPropagation();
        // Seven pixels per step; Shift for fine and Alt for accelerated scrubbing.
        const pixelsPerStep = event.shiftKey ? 20 : event.altKey ? 2 : 7;
        update(state.value + Math.round((event.clientX - state.x) / pixelsPerStep) * step);
      }}
      onPointerUp={event => {
        if (!scrub.current || scrub.current.pointerId !== event.pointerId) return;
        scrub.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { scrub.current = null; }}>
      {icon}
    </button>
    <input ref={edit} type="text" inputMode="decimal" aria-label={name} value={draft}
      onChange={event => setDraft(event.target.value)}
      onFocus={event => event.currentTarget.select()}
      onBlur={() => {
        if (skipBlurCommit.current) { skipBlurCommit.current = false; setDraft(String(value)); return; }
        commit();
      }}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        else if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); skipBlurCommit.current = true;
          setDraft(String(value)); event.currentTarget.blur();
        }
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const base = Number(draft.trim());
          const current = Number.isFinite(base) ? base : value;
          const delta = step * (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
          const next = constrain(current + delta, min, max, step);
          setDraft(String(next));
          if (next !== value) onChange(next);
        }
      }}/>
    {unit && <span className="dt-compact-unit" aria-hidden="true">{unit}</span>}
    </div>
  </div>;
}
