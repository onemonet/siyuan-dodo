import React, { useId } from "react";

/** SVG paths from the bundled Excalidraw 0.18.1 Fill*Icon components.
 * The upstream icons are private runtime exports; keep their paths local so
 * this plugin does not import an unsupported internal Excalidraw subpath.
 */
const outline = "M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z";
const hachure = "M2.258 15.156 15.156 2.258M7.324 20.222 20.222 7.325m-20.444 5.35L12.675-.222m-8.157 18.34L17.416 5.22";
const crossHatch = "M2.426 15.044 15.044 2.426M7.383 20 20 7.383M0 12.617 12.617 0m-7.98 17.941L17.256 5.324m-2.211 12.25L2.426 4.956M20 12.617 7.383 0m5.234 20L0 7.383m17.941 7.98L5.324 2.745";

export function ExcalidrawFillIcon({ variant }: { variant: "hachure" | "cross-hatch" | "solid" }) {
  const id = useId().replace(/:/g, "");
  const mask = `dt-fill-mask-${id}`;
  if (variant === "solid") return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" stroke="currentColor" strokeWidth="1.25"/>
  </svg>;
  if (variant === "hachure") return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d={outline} stroke="currentColor" strokeWidth="1.25"/>
    <mask id={mask} maskUnits="userSpaceOnUse" x="2" y="2" width="16" height="16">
      <path d={outline} fill="white" stroke="white" strokeWidth="1.25"/>
    </mask>
    <path mask={`url(#${mask})`} d={hachure} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
  const clip = `dt-fill-clip-${id}`;
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <defs><clipPath id={clip}><path d="M0 0h20v20H0z"/></clipPath></defs>
    <g clipPath={`url(#${clip})`}>
      <path d={outline} stroke="currentColor" strokeWidth="1.25"/>
      <mask id={mask} maskUnits="userSpaceOnUse" x="-1" y="-1" width="22" height="22">
        <path d={crossHatch} stroke="white" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
      </mask>
      <path mask={`url(#${mask})`} d="M14.121 2H5.88A3.879 3.879 0 0 0 2 5.879v8.242A3.879 3.879 0 0 0 5.879 18h8.242A3.879 3.879 0 0 0 18 14.121V5.88A3.879 3.879 0 0 0 14.121 2Z" fill="currentColor"/>
    </g>
  </svg>;
}
