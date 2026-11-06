---
name: dodo-toolbox-excalidraw
description: Draw, inspect, modify, or delete Excalidraw diagram elements in SiYuan through the plugin's native Agent tools.
---

# SiYuan Excalidraw

Use the native capabilities registered by `siyuan-dodo-excalidraw`. The model and conversation belong to the SiYuan Agent. Open the target Excalidraw editor before calling canvas tools.

## Fast workflow

The native capabilities include their own schemas and this guide via `dodo-excalidraw.read_me`. Load this guide once only when needed; native canvas operations do not depend on a generic Skill load. Observe the host's approval rules for any Skill loading. Reuse sufficient content from the conversation rather than fetching it again.

1. Call `dodo-excalidraw.canvas.read` once. Retain `canvasId` for all writes. Default output is compact geometry, text, `labelId`, `version`, and arrow `startId/endId`. Empty `ids: []` means no filter; `selectedOnly` and `nextOffset` support focused/paged reads. Use `detail: "full"` only for style, routing, or binding diagnostics.
2. Submit the related diagram in one `canvas.add` call with `finalize: true` (the default). This creates the elements, returns their actual coordinates and dimensions, focuses them, and confirms the file write in one call. On `saved: true`, finish with a brief result; a separate read/viewport/save cycle is unnecessary unless the returned geometry reveals a problem.
3. If correction is needed, batch it in `canvas.update` with the last read versions and `finalize: true`. The response includes the actual geometry and save status. Limit each add/update/delete to 100 inputs. For intermediate batches use `finalize: false`, then finalize the last batch.

Changes and file writes have separate outcomes: on a save error, retain `created`/`updated` IDs and retry `canvas.save`, rather than recreating content. Embedded pages keep cached previews during background saves (`previewUpdated: false`); focus and save to refresh their preview. `canvas.delete` does not auto-save; use `canvas.save` after deletion.

All `canvas.*` names above have the prefix `dodo-excalidraw.`. Discover their actual callable identifiers through SiYuan's native capability catalog. Compact geometry confirms scene state, not screenshot-level layout quality.

## Additional canvas Agent capabilities

- `canvas.screenshot({canvasId, ids?, maxSize?})`: return image content (PNG, up to 2048 px and 4 MB) for visual validation. Read the active canvas first; review overlaps, arrow crossings, contrast, and text clipping. Returned metadata contains dimensions and element counts, while the image itself is provided as an Agent image content block. Screenshot is read-only.
- `canvas.align({canvasId, ids, alignment, finalize?})`: align at least 2 nodes using `left`, `center-x`, `right`, `top`, `center-y`, `bottom`. Ignore direct arrow alignment; connected arrows and bound labels follow the moved nodes.
- `canvas.distribute({canvasId, ids, axis, gap?, finalize?})`: distribute at least 3 nodes; axis `horizontal` or `vertical`, optional gap in scene units.
- `canvas.group({canvasId, ids, finalize?})`, `canvas.ungroup({canvasId, ids, finalize?})`: group / ungroup elements while carrying bound text.
- `canvas.duplicate({canvasId, ids, dx?, dy?, finalize?})`: clone selected nodes, labels and internal connectors as one batch; returns an old-to-new ID map. Internal arrow bindings follow cloned nodes, external bindings are cleared.
- `canvas.from_mermaid({canvasId, definition, x?, y?, finalize?})`: render a Mermaid diagram into native editable Excalidraw elements. Complex Mermaid feature parity is limited by the official converter.
- `canvas.add_image({canvasId, dataURL, x, y, width?, height?, finalize?})`: add PNG/JPEG/WebP/GIF from a bounded base64 data URL. Image remains a raster element, not a vector shape.

All write tools require `canvasId`, form undoable scene updates and default to `finalize: true` (focus/save). If final save fails, do not rerun the mutation; call `canvas.save`. Perform screenshot after each major drawing batch when the Agent can consume image content. For long diagrams use focused `ids` or reduce `maxSize`.

## Creating elements

`canvas.add` accepts Excalidraw ElementSkeleton objects. Supported types: rectangle, ellipse, diamond, text, arrow, line, frame. Provide `id`, `type`, and `x/y` except for frames, whose bounds can be calculated from their children.

Use `label: {text, fontSize: 20}` for node and arrow labels. The plugin creates native text elements and bindings. Separate `text` elements are for titles, notes, and legends. `label` is a supported input to the converter, rather than a property stored directly on raw Excalidraw elements.

```json
[
  {"id":"input","type":"rectangle","x":100,"y":100,"width":200,"height":80,"backgroundColor":"#a5d8ff","label":{"text":"输入"}},
  {"id":"output","type":"rectangle","x":440,"y":100,"width":200,"height":80,"backgroundColor":"#b2f2bb","label":{"text":"输出"}},
  {"id":"flow","type":"arrow","x":0,"y":0,"start":{"id":"input"},"end":{"id":"output"},"label":{"text":"处理"}},
  {"id":"diagram","type":"frame","name":"流程","children":["input","output","flow"]}
]
```

Arrow `start/end` may reference same-batch or existing rectangle/ellipse/diamond IDs. With both ends and no `points`, the plugin connects node edges. For routed arrows, supply local offsets `points: [[0,0],[dx,dy],...]`; x/y is the starting scene position. Right-angle routes use `elbowed: true`, `roughness: 0`, `roundness: null`. Keep routes outside unrelated nodes. Self-loops require explicit routing points. Frames reference same-batch member IDs and should come last in the batch.

## Editing

- `canvas.read` returns `version`, `labelId`, selection state, endpoint IDs, and `bounds: [minX,minY,maxX,maxY]`. Request `detail: "full"` for raw binding and style fields.
- `canvas.update` accepts `{id, version, ...changedFields}`. Supply the read version to reject intervening edits atomically. To rename a node, update its `labelId` text element; setting `text` on a labeled shape also updates its label. A node's font styles belong to its text element.
- Moving/resizing nodes moves bound text and arrow endpoints. Interior waypoints stay in place; include explicit updated `points` for complex rerouting. Elbowed or rotated arrows require explicit points when their target nodes move.
- `canvas.delete` requires an explicit deletion request. It deletes requested IDs plus their bound labels. Connected arrows remain and detach from removed nodes; delete those arrows explicitly when requested. Deleting a frame releases its remaining members.
- Each mutation forms an immediate native undo step. Edits to elements currently being typed in or dragged are rejected; retry after the user finishes.

## Layout

Place new diagrams beyond existing bounds with at least 100 units of spacing. Use roughly 200×80 nodes, 40–60 gaps within a row, and 80–120 between rows. Body text is normally 20; titles 28–36. For Chinese, budget about one font-size unit per character. Grow or split nodes when text is dense.

Use 3–4 semantic colors: pale blue inputs, purple processing, green outputs, yellow notes, red errors. Adapt fills and text to the canvas background returned by read. Default strokes are clean (`roughness: 0`); use roughness 1 when requested. Shape labels and arrows should remain readable without overlapping existing content.
