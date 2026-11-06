import React from "react";

/** Shared vertical menu row for toolbar submenus (e.g. 切换形状) and property picks. */
export function ToolbarMenuOption({ icon, label, onSelect, disabled, selected }: {
  icon: React.ReactNode; label: string; onSelect: () => void;
  disabled?: boolean; selected?: boolean;
}) {
  return <button type="button" role="menuitem" aria-label={label} data-selected={selected || undefined}
    disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onSelect}>
    {icon}<span>{label}</span>
  </button>;
}
