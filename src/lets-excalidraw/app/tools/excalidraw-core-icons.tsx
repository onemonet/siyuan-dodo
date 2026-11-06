import React from "react";

/**
 * Icon geometry copied from the installed @excalidraw/excalidraw 0.18.1 icons.
 * These internal SVG components are not exported through the public package
 * entrypoint. Local React wrappers avoid brittle deep imports into Vite chunks.
 * Normal toolbar icons use the 17px dimensions supplied by toolbar.css.
 */
export function ExcalidrawEyedropperIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 7l6 6"/>
    <path d="M4 16l11.7 -11.7a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4l-11.7 11.7h-4v-4z"/>
  </svg>;
}
export function ExcalidrawTrashIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.333 5.833h13.334M8.333 9.167v5M11.667 9.167v5M4.167 5.833l.833 10c0 .92.746 1.667 1.667 1.667h6.666c.92 0 1.667-.746 1.667-1.667l.833-10M7.5 5.833v-2.5c0-.46.373-.833.833-.833h3.334c.46 0 .833.373.833.833v2.5"/>
  </svg>;
}
export function ExcalidrawDuplicateIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.375 6.458H8.958a2.5 2.5 0 0 0-2.5 2.5v5.417a2.5 2.5 0 0 0 2.5 2.5h5.417a2.5 2.5 0 0 0 2.5-2.5V8.958a2.5 2.5 0 0 0-2.5-2.5Z"/>
    <path clipRule="evenodd" d="M11.667 3.125c.517 0 .986.21 1.325.55.34.338.55.807.55 1.325v1.458H8.333c-.485 0-.927.185-1.26.487-.343.312-.57.75-.609 1.24l-.005 5.357H5a1.87 1.87 0 0 1-1.326-.55 1.87 1.87 0 0 1-.549-1.325V5c0-.518.21-.987.55-1.326.338-.34.807-.549 1.325-.549h6.667Z"/>
  </svg>;
}
export function ExcalidrawTextIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="20" x2="7" y2="20"/>
    <line x1="14" y1="20" x2="21" y2="20"/>
    <line x1="6.9" y1="15" x2="13.8" y2="15"/>
    <line x1="10.2" y1="6.3" x2="16" y2="20"/>
    <polyline points="5 20 11 4 13 4 20 20"/>
  </svg>;
}
export function ExcalidrawArrowIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.16602 10H15.8327"/>
    <path d="M12.5 13.3333L15.8333 10"/>
    <path d="M12.5 6.66666L15.8333 9.99999"/>
  </svg>;
}
export function ExcalidrawRectangleIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>;
}
export function ExcalidrawFrameIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7l16 0M4 17l16 0M7 4l0 16M17 4l0 16"/>
  </svg>;
}

export function ExcalidrawDiamondIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.5 20.4l-6.9 -6.9c-.781 -.781 -.781 -2.219 0 -3l6.9 -6.9c.781 -.781 2.219 -.781 3 0l6.9 6.9c.781 .781 .781 2.219 0 3l-6.9 6.9c-.781 .781 -2.219 .781 -3 0z"/>
  </svg>;
}
export function ExcalidrawEllipseIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/>
  </svg>;
}
export function ExcalidrawImageIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.5 6.667h.01"/>
    <path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z"/>
    <path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166"/>
    <path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667"/>
  </svg>;
}
export function ExcalidrawLineIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M4.167 10h11.666"/></svg>;
}
export function ExcalidrawFreedrawIcon() {
  return <svg data-icon-source="excalidraw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path clipRule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z"/>
    <path d="m11.25 5.417 3.333 3.333"/>
  </svg>;
}
