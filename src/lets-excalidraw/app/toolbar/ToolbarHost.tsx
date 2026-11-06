import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCommonBounds, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import { Grip, Pin, Link2, Pencil, RefreshCw, Check } from "lucide-react";
import { MAX_PINNED_TOOLS, type ToolbarPreferences } from "../../toolbar-preferences";
import { toolbarTools, interactionFeatures } from "../tools";
import { partitionTools, placeToolbar, selectionKey } from "./model";
import { PreferenceClient, type ToolbarPreferenceConnection, type ToolbarPreferenceFactory } from "./preference-client";
import { startDrawingStyleSession, type DrawingStyleSession } from "../interactions/tool-state-persistence";
import { ToolbarSettings } from "./ToolbarSettings";
import { ToolbarMenuOption } from "./ToolbarMenuOption";
import { resolveToolIcon, type SelectionContext, type ToolAction, type ToolbarTool } from "./types";
import "./toolbar.css";

const contextFor = (api: any): SelectionContext => {
  const appState = api.getAppState();
  return { api, appState, elements: api.getSceneElements().filter((element: any) => !element.isDeleted && appState.selectedElementIds?.[element.id]) };
};

export function ToolbarHost({ api, tools = toolbarTools, features = interactionFeatures, createPreferenceClient, resetDefaults }: {
  api: any; tools?: typeof toolbarTools; features?: typeof interactionFeatures;
  createPreferenceClient?: ToolbarPreferenceFactory; resetDefaults?: ToolbarPreferences;
}) {
  const [preferences, setPreferences] = useState<ToolbarPreferences | null>(null);
  const [snapshot, setSnapshot] = useState(() => ({ context: contextFor(api), signature: "", busy: false, width: innerWidth, height: innerHeight }));
  const [menu, setMenu] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"toolbar" | "other">("toolbar");
  const openSettings = (tab: "toolbar" | "other" = "toolbar") => {
    setMenu(null);
    setSettingsTab(tab);
    setSettingsOpen(true);
  };
  const [nativeEditId, setNativeEditId] = useState<string | null>(null);
  useEffect(() => {
    const onNativeEdit = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      let message: { event?: string; elementId?: string; active?: boolean };
      try { message = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
      catch { return; }
      if (message.event !== "dodoSiyuanNativeEditorState" || !message.elementId) return;
      setNativeEditId(previous =>
        message.active ? message.elementId : previous === message.elementId ? null : previous);
    };
    window.addEventListener("message", onNativeEdit);
    return () => window.removeEventListener("message", onNativeEdit);
  }, []);
  const [running, setRunning] = useState("");
  const [dragPosition, setDragPosition] = useState<{ left: number; top: number } | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 64 });
  const client = useRef<ToolbarPreferenceConnection | null>(null);
  const drawingSession = useRef<DrawingStyleSession | null>(null);
  const rememberDrawingStyle = preferences?.interactionEnabled.toolStatePersistence === true;
  // Initialization occurs once when SiYuan preferences arrive. Subsequent
  // preference broadcasts never reset the active canvas's current tool state.
  useEffect(() => {
    if (!preferences || typeof api.updateScene !== "function") return;
    if (!drawingSession.current) {
      drawingSession.current = startDrawingStyleSession(
        api, preferences.drawingInitialStyle, rememberDrawingStyle,
      );
    } else {
      drawingSession.current.setRememberLastUsed(rememberDrawingStyle);
    }
  }, [api, preferences, rememberDrawingStyle]);
  useEffect(() => () => {
    drawingSession.current?.destroy();
    drawingSession.current = null;
  }, []);
  const toolbar = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const menuAnchor = useRef<{ left: number; bottom: number } | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  const hoverMenus = new Set(["align", "arrange", "shape-switch", "boolean"]);
  const clearHoverClose = () => { if (hoverCloseTimer.current !== null) { window.clearTimeout(hoverCloseTimer.current); hoverCloseTimer.current = null; } };
  const scheduleHoverClose = () => { clearHoverClose(); hoverCloseTimer.current = window.setTimeout(() => setMenu(previous => hoverMenus.has(previous || "") ? null : previous), 180); };
  useEffect(() => () => { if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current); }, []);
  const layer = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const report = useCallback((error: unknown) => api.setToast({ message: error instanceof Error ? error.message : String(error) }), [api]);
  const save = useCallback(async (patch: Partial<ToolbarPreferences>) => {
    if (!client.current) throw new Error("工具栏尚未连接到插件。");
    return client.current.request(patch);
  }, []);

  useEffect(() => {
    let alive = true;
    const bridge = createPreferenceClient
      ? createPreferenceClient(value => { if (alive) setPreferences(value); })
      : new PreferenceClient(value => { if (alive) setPreferences(value); });
    client.current = bridge;
    bridge.request().catch(error => { if (alive) report(error); });
    const open = () => openSettings("toolbar");
    const message = (event: MessageEvent) => {
      if (event.source !== parent || event.origin !== location.origin) return;
      let data: any; try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (data?.event === "enhancementOpenSettings") {
        openSettings(data.tab === "other" ? "other" : "toolbar");
      }
    };
    window.addEventListener("dodo-enhancement-settings", open);
    window.addEventListener("message", message);
    return () => { alive = false; bridge.destroy(); client.current = null; window.removeEventListener("dodo-enhancement-settings", open); window.removeEventListener("message", message); };
  }, [report, createPreferenceClient]);

  useEffect(() => {
    const update = () => {
      if (document.hidden) return;
      const context = contextFor(api), state = context.appState;
      const active = document.activeElement;
      const editing = Boolean(state.editingTextElement || state.editingElement || active?.matches("input, textarea, select, [contenteditable=true]")) && !layer.current?.contains(active);
      const busy = editing || pointerDown.current || state.isResizing || state.isRotating || state.selectedElementsAreBeingDragged || !["selection", "hand"].includes(state.activeTool?.type || "selection");
      const signature = JSON.stringify([selectionKey(context), context.elements.map(element => [element.version, element.versionNonce]), state.scrollX, state.scrollY, state.zoom?.value, state.offsetLeft, state.offsetTop, state.theme, busy, innerWidth, innerHeight]);
      setSnapshot(previous => previous.signature === signature ? previous : { context, signature, busy, width: innerWidth, height: innerHeight });
    };
    const down = (event: PointerEvent) => { if (!layer.current?.contains(event.target as Node)) { pointerDown.current = true; setMenu(null); update(); } };
    const up = () => { pointerDown.current = false; update(); };
    const unsubscribe = api.onChange(update);
    // ponytail: selection-only changes may omit onChange; poll until the API exposes a selection event.
    const timer = window.setInterval(update, 200);
    window.addEventListener("resize", update);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => { unsubscribe?.(); clearInterval(timer); window.removeEventListener("resize", update); document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true); document.removeEventListener("focusin", update); document.removeEventListener("focusout", update); };
  }, [api]);

  const context = snapshot.context, targetKey = selectionKey(context);
  useEffect(() => { setMenu(null); }, [targetKey]);
  useEffect(() => { if (!preferences?.toolbarEnabled || snapshot.busy) setMenu(null); }, [preferences?.toolbarEnabled, snapshot.busy]);
  const partition = partitionTools(tools, context, preferences?.toolbarPinnedIds ?? []);
  const capacity = Math.min(MAX_PINNED_TOOLS, Math.max(0, Math.floor((snapshot.width - (preferences?.toolbarMode === "fixed" ? 164 : 130)) / (preferences?.toolbarShowLabels ? 150 : 34))));
  const pinned = partition.pinned.slice(0, capacity);
  const more = [...partition.pinned.slice(capacity), ...partition.more];
  const emptyWebEmbed = context.elements.length === 1 &&
    context.elements[0].type === "embeddable" &&
    !String(context.elements[0].link || "").trim() &&
    !context.elements[0].customData?.embedMarkdown;
  const selectedSiyuan = context.elements.length === 1 &&
    context.elements[0].type === "embeddable" &&
    /^siyuan:\/\/blocks\/\d{14}-[a-z0-9]{7}$/i.test(String(context.elements[0].link || ""));
  const selectedSiyuanId = selectedSiyuan ? context.elements[0].id : null;
  const editingSiyuan = Boolean(nativeEditId && nativeEditId === selectedSiyuanId);
  const requestEmbed = (action: "edit" | "refresh" | "done" | "link", id: string) => {
    if (editingSiyuan) {
      window.parent.postMessage(JSON.stringify({
        event: "dodoSiyuanNativeToolbarAction", elementId: id, action,
      }), location.origin);
      return;
    }
    if (action === "link") {
      // Match the empty Web-Embed: the actual URL field, native focus and
      // SiYuan @ reference search all belong to Excalidraw's Hyperlink.
      api.updateScene({
        appState: { selectedElementIds: { [id]: true }, showHyperlinkPopup: "editor" },
      });
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>(".excalidraw-hyperlinkContainer-input")?.focus()
      );
      return;
    }
    const frame = [...document.querySelectorAll<HTMLIFrameElement>('.dodo-siyuan-embed iframe')]
      .find(node => {
        try {
          const url = new URL(node.src, location.href);
          return url.searchParams.get("elementId") === id &&
            url.pathname.includes("/excalidraw/embed/siyuan/");
        } catch { return false; }
      });
    frame?.contentWindow?.postMessage(JSON.stringify({
      event: action === "edit" ? "dodoSiyuanRequestEdit" : "dodoSiyuanRequestRefresh",
      elementId: id,
    }), location.origin);
  };
  const nativeLinkEditorOpen = context.appState.showHyperlinkPopup === "editor";
  // The native URL editor and the custom selection toolbar are mutually
  // exclusive, so neither can obscure the other's inputs.
  const show = Boolean(preferences?.toolbarEnabled &&
    (!snapshot.busy || editingSiyuan) &&
    !nativeLinkEditorOpen && (context.elements.length || preferences.toolbarMode === "fixed"));

  const place = useCallback(() => {
    if (!preferences || !toolbar.current) return;
    const rect = toolbar.current.getBoundingClientRect();
    let bounds = null;
    if (context.elements.length) {
      const [x1, y1, x2, y2] = getCommonBounds(context.elements as any);
      const a = sceneCoordsToViewportCoords({ sceneX: x1, sceneY: y1 }, api.getAppState());
      const b = sceneCoordsToViewportCoords({ sceneX: x2, sceneY: y2 }, api.getAppState());
      bounds = { left: a.x, top: a.y, right: b.x, bottom: b.y };
    }
    const next = placeToolbar(bounds, rect, { width: innerWidth, height: innerHeight }, dragPosition ? { ...preferences, toolbarMode: "fixed", toolbarPosition: dragPosition } : preferences);
    setPosition(previous => previous.left === next.left && previous.top === next.top ? previous : next);
  }, [api, context, preferences, dragPosition]);
  useLayoutEffect(place, [place, show, pinned.length]);
  useEffect(() => { const observer = new ResizeObserver(place); if (toolbar.current) observer.observe(toolbar.current); return () => observer.disconnect(); }, [place, show]);
  useLayoutEffect(() => {
    if (!popup.current) return;
    // Reset the previous menu's constraint before measuring the current panel.
    popup.current.style.maxHeight = "";
    const rect = popup.current.getBoundingClientRect();
    const trigger = menu === "more"
      ? toolbar.current?.querySelector<HTMLButtonElement>("[data-more]")
      : [...toolbar.current?.querySelectorAll<HTMLButtonElement>("[data-tool-id]") || []].find(button => button.dataset.toolId === menu)
        ?? toolbar.current?.querySelector<HTMLButtonElement>("[data-more]");
    // A nested tool opened from "More" must stay anchored to the toolbar,
    // not the menu-row that disappeared, or tall panels can cover the trigger.
    const triggerRect = trigger?.getBoundingClientRect();
    const anchor = triggerRect ?? menuAnchor.current;
    const anchorTop = triggerRect?.top ?? (anchor?.bottom ?? position.top) - (toolbar.current?.offsetHeight || 36);
    const anchorBottom = anchor?.bottom ?? position.top + (toolbar.current?.offsetHeight || 36);
    const below = Math.max(0, innerHeight - anchorBottom - 14);
    const above = Math.max(0, anchorTop - 14);
    const placeBelow = below >= rect.height || below >= above;
    const available = Math.max(0, placeBelow ? below : above);
    const panelHeight = Math.min(rect.height, available);
    popup.current.style.maxHeight = `${Math.max(40, available)}px`;
    popup.current.style.left = `${Math.max(8, Math.min(anchor?.left ?? position.left, innerWidth - rect.width - 8))}px`;
    popup.current.style.top = `${placeBelow ? anchorBottom + 6 : anchorTop - 6 - panelHeight}px`;
    popup.current.querySelector<HTMLElement>("button, input, select")?.focus();
  }, [menu, position, snapshot.width, snapshot.height]);

  const run = async (action: ToolAction | ToolbarTool) => {
    if (running) return;
    const current = contextFor(api);
    if (action.when && !action.when(current)) { setMenu(null); return; }
    setRunning(action.id);
    try { await action.run?.(current); setMenu(null); toolbar.current?.querySelector<HTMLButtonElement>(`[data-tool-id="${action.id}"]`)?.focus(); }
    catch (error) { report(error); }
    finally { setRunning(""); }
  };
  const setMenuAt = (element: HTMLButtonElement, id: string) => {
    const { left, bottom } = element.getBoundingClientRect();
    menuAnchor.current = { left, bottom };
    setMenu(id);
  };
  const toggleMenu = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    clearHoverClose();
    const { left, bottom } = event.currentTarget.getBoundingClientRect();
    menuAnchor.current = { left, bottom };
    setMenu(previous => previous === id ? null : id);
  };
  const toolButton = (tool: ToolbarTool, inMenu = false) => {
    const hasMenu = Boolean(tool.items || tool.Panel);
    const noChevron = new Set(["background", "stroke", "align", "arrange", "shape-switch", "boolean", "repeat"]);
    const hover = hoverMenus.has(tool.id) && !inMenu;
    return <button key={tool.id} type="button" data-tooltip={(inMenu || preferences?.toolbarShowLabels) ? undefined : tool.label} data-tool-id={tool.id} aria-label={tool.label} aria-haspopup={hasMenu ? "menu" : undefined} aria-expanded={hasMenu ? menu === tool.id : undefined} disabled={Boolean(running)}
      onPointerEnter={hover ? event => { clearHoverClose(); setMenuAt(event.currentTarget, tool.id); } : undefined}
      onPointerLeave={hover ? scheduleHoverClose : undefined}
      onFocus={hover ? event => { clearHoverClose(); setMenuAt(event.currentTarget, tool.id); } : undefined}
      onMouseDown={event => event.preventDefault()} onClick={event => hasMenu ? (hover ? setMenuAt(event.currentTarget, tool.id) : toggleMenu(event, tool.id)) : void run(tool)}>
      <span className="dt-tool-icon">{resolveToolIcon(tool, context) || "◇"}</span>{(inMenu || preferences?.toolbarShowLabels) && <span>{tool.label}</span>}{hasMenu && !noChevron.has(tool.id) && <svg className="dt-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={menu === tool.id ? "m4.5 9.5 3.5-3 3.5 3" : "m4.5 6.5 3.5 3 3.5-3"}/></svg>}
    </button>;
  };
  const active = tools.find(tool => tool.id === menu);
  const gridColumns = typeof active?.columns === "function" ? active.columns(context) : active?.columns;
  const finishDrag = async (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = drag.current; if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    try {
      if (!cancelled && current.moved && preferences && toolbar.current) {
        const finalPosition = placeToolbar(null, toolbar.current.getBoundingClientRect(), { width: innerWidth, height: innerHeight }, { ...preferences, toolbarMode: "fixed", toolbarPosition: { left: current.left + event.clientX - current.x, top: current.top + event.clientY - current.y } });
        await save({ toolbarMode: "fixed", toolbarPosition: finalPosition });
      }
    } catch (error) { report(error); }
    finally { setDragPosition(null); }
  };
  return <div ref={layer} className="dt-layer" data-theme={context.appState.theme} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
    if (!(event.ctrlKey || event.metaKey)) event.stopPropagation();
    if (event.key === "Escape") { setMenu(null); toolbar.current?.querySelector<HTMLButtonElement>("[data-more]")?.focus(); }
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && event.target instanceof HTMLButtonElement) {
      const root = event.currentTarget.querySelector(menu ? ".dt-popover" : ".dt-toolbar");
      const buttons = [...root?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []];
      const index = buttons.indexOf(event.target);
      if (index < 0) return;
      event.preventDefault();
      if (root?.getAttribute("data-layout") === "grid") {
        const columns = Math.max(1, Number(root.getAttribute("data-columns")) || 3);
        const rowStart = Math.floor(index / columns) * columns;
        const rowEnd = Math.min(rowStart + columns - 1, buttons.length - 1);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : event.key === "ArrowLeft" ? Math.max(rowStart, index - 1)
          : event.key === "ArrowRight" ? Math.min(rowEnd, index + 1)
          : event.key === "ArrowUp" ? Math.max(0, index - columns)
          : Math.min(buttons.length - 1, index + columns);
        buttons[next]?.focus();
      } else {
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    }
  }}>
    {preferences && features.filter(feature => feature.id !== "toolStatePersistence").map(feature => <InteractionMount key={feature.id} feature={feature}
      enabled={preferences.interactionEnabled[feature.id] ?? feature.defaultEnabled}
      api={api} report={report}/>)}
    {show && <div ref={toolbar} className="dt-toolbar" role="toolbar" aria-label="选区增强工具" data-mode={preferences!.toolbarMode} style={position}>
      <div className="dt-handle-group">
      <button type="button" className="dt-grip" data-tooltip="拖动工具栏固定位置" aria-label="拖动工具栏固定位置" onPointerDown={event => {
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ...position, moved: false }; setMenu(null);
      }} onPointerMove={event => {
        const current = drag.current; if (!current || current.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 3 && !current.moved) return;
        current.moved = true; setDragPosition({ left: current.left + event.clientX - current.x, top: current.top + event.clientY - current.y });
      }} onPointerUp={event => void finishDrag(event)} onPointerCancel={event => void finishDrag(event, true)}><Grip size={17} strokeWidth={1.8} aria-hidden="true"/></button>
      {preferences!.toolbarMode === "fixed" && <button type="button" className="dt-unpin" data-tooltip="取消固定，恢复跟随选区" aria-label="取消固定工具栏"
        onClick={() => { clearHoverClose(); setMenu(null); void save({ toolbarMode: "follow", toolbarPosition: null }).catch(report); }}><Pin size={17} strokeWidth={1.8} aria-hidden="true"/></button>}
      </div>
      {pinned.map(tool => toolButton(tool))}
      {selectedSiyuan && selectedSiyuanId && <>
        <button type="button" data-siyuan-action={editingSiyuan ? "done" : "edit"}
          data-tooltip={editingSiyuan ? "完成思源块编辑" : "编辑思源块"}
          aria-label={editingSiyuan ? "完成思源块编辑" : "编辑思源块"}
          onMouseDown={event => event.preventDefault()}
          onClick={() => requestEmbed(editingSiyuan ? "done" : "edit", selectedSiyuanId)}>
          {editingSiyuan ? <Check size={18} strokeWidth={2}/> : <Pencil size={18} strokeWidth={1.8}/>}
          {preferences!.toolbarShowLabels && <span>{editingSiyuan ? "完成" : "编辑"}</span>}
        </button>
        <button type="button" data-siyuan-action="refresh" data-tooltip="刷新思源块"
          aria-label="刷新思源块" onMouseDown={event => event.preventDefault()}
          onClick={() => requestEmbed("refresh", selectedSiyuanId)}>
          <RefreshCw size={18} strokeWidth={1.8}/>
          {preferences!.toolbarShowLabels && <span>刷新</span>}
        </button>
        <button type="button" data-siyuan-action="link" data-tooltip="编辑思源块链接"
          aria-label="编辑思源块链接" onMouseDown={event => event.preventDefault()}
          onClick={() => requestEmbed("link", selectedSiyuanId)}>
          <Link2 size={18} strokeWidth={1.8}/>
          {preferences!.toolbarShowLabels && <span>链接</span>}
        </button>
      </>}
      {emptyWebEmbed && <button type="button" data-empty-web-link-trigger
        data-tooltip="设置嵌入链接" aria-label="设置嵌入链接"
        onMouseDown={event => event.preventDefault()}
        onClick={event => {
          event.stopPropagation();
          setMenu(null);
          api.updateScene({ appState: { showHyperlinkPopup: "editor" } });
          window.requestAnimationFrame(() =>
            document.querySelector<HTMLInputElement>(".excalidraw-hyperlinkContainer-input")?.focus()
          );
        }}>
        <Link2 size={18} strokeWidth={1.8} aria-hidden="true"/>
        {preferences!.toolbarShowLabels && <span>设置链接</span>}
      </button>}
      <span className="dt-divider"/>
      <button type="button" data-more data-tooltip="更多工具" aria-label="更多工具" aria-haspopup="menu" aria-expanded={menu === "more"} onMouseDown={event => event.preventDefault()} onClick={event => toggleMenu(event, "more")}>⋯</button>
    </div>}
    {show && menu && <div ref={popup} className="dt-popover" data-tool-id={active?.id} data-layout={active?.layout || "list"} data-columns={gridColumns} role={active?.Panel ? "dialog" : "menu"} aria-label={active?.label || "更多工具"}
      onPointerEnter={clearHoverClose} onPointerLeave={hoverMenus.has(menu) ? scheduleHoverClose : undefined}>
      {menu === "more" ? <>{more.map(tool => toolButton(tool, true))}{more.length > 0 && <hr/>}
        {preferences!.toolbarMode === "fixed" && <button type="button" onClick={() => { void save({ toolbarMode: "follow", toolbarPosition: null }).catch(report); setMenu(null); }}>恢复跟随选区</button>}
        <button type="button" onClick={() => openSettings("toolbar")}>自定义工具栏</button>
        <button type="button" onClick={() => openSettings("other")}>其他设置</button>
      </> : active?.Panel ? <active.Panel context={context} close={() => setMenu(null)}/> : active?.items?.filter(item => !item.when || item.when(context)).flatMap(item => [
        ...(item.separatorBefore ? [<span key={`${item.id}-separator`} className="dt-menu-separator"/>] : []),
        active?.layout === "grid" ? <button key={item.id} type="button" role="menuitem" aria-label={item.label} data-tooltip={item.label} data-divider-before={item.separatorBefore || undefined} disabled={Boolean(running)} onMouseDown={event => event.preventDefault()} onClick={() => void run(item)}>{item.icon}</button>
          : <ToolbarMenuOption key={item.id} icon={item.icon} label={item.label} disabled={Boolean(running)} onSelect={() => void run(item)}/> ,
      ])}
    </div>}
    {settingsOpen && preferences && <ToolbarSettings preferences={preferences} tools={tools} context={context} features={features} save={save} resetDefaults={resetDefaults} canSaveInitialization={window.parent !== window} initialTab={settingsTab} close={() => setSettingsOpen(false)}/>}
  </div>;
}

function InteractionMount({ feature, enabled, api, report }: { feature: typeof interactionFeatures[number]; enabled: boolean; api: any; report: (error: unknown) => void }) {
  useEffect(() => {
    if (!enabled) return;
    let cleanup: (() => void) | undefined;
    try { cleanup = feature.mount(api); } catch (error) { report(error); }
    return () => { try { cleanup?.(); } catch (error) { report(error); } };
  }, [feature, enabled, api, report]);
  return null;
}
