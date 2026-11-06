import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pin, PinOff, RotateCcw, X } from "lucide-react";
import { MAX_PINNED_TOOLS, normalizeToolbarPreferences, toolbarDefaults, type ToolbarPreferences } from "../../toolbar-preferences";
import { captureCurrentDrawingStyle } from "../../drawing-style";
import { resolveToolIcon, type SelectionContext, type InteractionFeature, type SavePreferences, type ToolbarTool } from "./types";

const MAX_PINNED = MAX_PINNED_TOOLS;

type PinnedCardProps = {
  tool: ToolbarTool; context: SelectionContext;
  onRemove: (id: string) => void; onMove: (id: string, delta: number) => void;
};

/** Each chip smoothly shifts around the lifted item. Only its grip starts a drag. */
function SortablePinnedCard({ tool, context, onRemove, onMove }: PinnedCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: tool.id });
  return <div ref={setNodeRef} className="dt-pinned-item" data-dragging={isDragging || undefined}
    style={{ transform: CSS.Translate.toString(transform), transition }}>
    <button type="button" className="dt-sort-handle" ref={setActivatorNodeRef}
      {...attributes} {...listeners} aria-label={`排序${tool.label}`} title="拖动排序，或按左右方向键调整顺序"
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault(); event.stopPropagation();
        onMove(tool.id, event.key === "ArrowLeft" ? -1 : 1);
      }}>
      <GripVertical size={17} strokeWidth={1.7}/>
    </button>
    <span className="dt-tool-icon" aria-hidden="true">{resolveToolIcon(tool, context)}</span>
    <span className="dt-pinned-label">{tool.label}</span>
    <button type="button" className="dt-pinned-remove" aria-label={`取消固定${tool.label}`} title={`取消固定${tool.label}`}
      onClick={() => onRemove(tool.id)}><X size={16} strokeWidth={1.8}/></button>
  </div>;
}

/** DragOverlay is a real clone above the dialog, not the browser's default ghost. */
function DraggedPinnedCard({ tool, context }: { tool: ToolbarTool; context: SelectionContext }) {
  return <div className="dt-pinned-item dt-pinned-drag-overlay" aria-hidden="true">
    <span className="dt-sort-handle"><GripVertical size={17} strokeWidth={1.7}/></span>
    <span className="dt-tool-icon">{resolveToolIcon(tool, context)}</span>
    <span className="dt-pinned-label">{tool.label}</span>
    <span className="dt-pinned-remove"><X size={16} strokeWidth={1.8}/></span>
  </div>;
}

/** Same toolbar settings on the SiYuan canvas and the standalone browser canvas. */
export function ToolbarSettings({ preferences, tools, context, features, save, close, resetDefaults = toolbarDefaults, canSaveInitialization = true, initialTab = "toolbar" }: {
  preferences: ToolbarPreferences; tools: readonly ToolbarTool[]; context: SelectionContext; features: readonly InteractionFeature[];
  save: SavePreferences; close: () => void; resetDefaults?: ToolbarPreferences; canSaveInitialization?: boolean; initialTab?: "toolbar" | "other";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [initial] = useState(preferences);
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [initialSaveStatus, setInitialSaveStatus] = useState("");
  const [initialSaving, setInitialSaving] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [tab, setTab] = useState<"toolbar" | "other">(initialTab);
  const switchTab = (next: "toolbar" | "other") => { setActiveDragId(null); setTab(next); };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const allTools = new Map(tools.map(tool => [tool.id, tool]));
  const ordered = draft.toolbarPinnedIds.flatMap(id => allTools.get(id) ?? []);
  const moveBy = (id: string, delta: number) => setDraft(value => {
    const ids = value.toolbarPinnedIds;
    const from = ids.indexOf(id), to = from + delta;
    return from < 0 || to < 0 || to >= ids.length ? value
      : { ...value, toolbarPinnedIds: arrayMove(ids, from, to) };
  });
  const endDrag = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    setDraft(value => {
      const current = value.toolbarPinnedIds;
      const from = current.indexOf(String(active.id)), to = current.indexOf(String(over.id));
      return from < 0 || to < 0 ? value : { ...value, toolbarPinnedIds: arrayMove(current, from, to) };
    });
  };
  const pin = (id: string, enabled: boolean) => {
    setNotice("");
    if (enabled && draft.toolbarPinnedIds.length >= MAX_PINNED) {
      setNotice(`最多固定 ${MAX_PINNED} 个工具，请先移除其他工具。`);
      return;
    }
    setDraft(value => ({ ...value, toolbarPinnedIds: enabled
      ? [...value.toolbarPinnedIds, id]
      : value.toolbarPinnedIds.filter(item => item !== id) }));
  };
  const saveCurrentAsInitialization = async () => {
    if (initialSaving || saving || !canSaveInitialization) return;
    setInitialSaving(true);
    setInitialSaveStatus("");
    const snapshot = captureCurrentDrawingStyle(context.api.getAppState());
    try {
      await save({ drawingInitialStyle: snapshot });
      setDraft(previous => ({ ...previous, drawingInitialStyle: snapshot }));
      setInitialSaveStatus("已保存 " + Object.keys(snapshot).length + " 项初始化样式到插件设置；下次打开画布生效。");
    } catch (reason) {
      setInitialSaveStatus(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setInitialSaving(false);
    }
  };
  const submit = async () => {
    setSaving(true); setError("");
    try {
      const patch = Object.fromEntries(Object.keys(draft)
        .filter(key => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]))
        .map(key => [key, draft[key]]));
      await save(patch); close();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialog} className="dt-settings dt-customizer" aria-label="自定义工具栏"
    onCancel={event => { event.preventDefault(); if (!saving) close(); }}
    onClick={event => { if (event.target === dialog.current && !saving) close(); }}>
    <header className="dt-customizer-header">
      <div className="dt-customizer-tabs" role="tablist" aria-label="画布设置分类"
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "toolbar" : event.key === "End" ? "other"
            : tab === "toolbar" ? "other" : "toolbar";
          switchTab(next);
          event.currentTarget.querySelector<HTMLButtonElement>(`[data-settings-tab="${next}"]`)?.focus();
        }}>
        <button type="button" role="tab" id="dt-settings-tab-toolbar" data-settings-tab="toolbar"
          aria-selected={tab === "toolbar"} aria-controls="dt-settings-panel-toolbar" tabIndex={tab === "toolbar" ? 0 : -1}
          onClick={() => switchTab("toolbar")}>自定义工具栏</button>
        <button type="button" role="tab" id="dt-settings-tab-other" data-settings-tab="other"
          aria-selected={tab === "other"} aria-controls="dt-settings-panel-other" tabIndex={tab === "other" ? 0 : -1}
          onClick={() => switchTab("other")}>其他设置</button>
      </div>
      <button type="button" className="dt-customizer-close" aria-label="关闭设置" disabled={saving} onClick={close}><X size={20} strokeWidth={1.8}/></button>
    </header>
    <div className="dt-settings-body dt-customizer-body">
      {tab === "toolbar" ? <div role="tabpanel" id="dt-settings-panel-toolbar" aria-labelledby="dt-settings-tab-toolbar" className="dt-customizer-toolbar-page">
      <section className="dt-customizer-section" aria-labelledby="dt-customizer-pinned-title">
        <div className="dt-customizer-section-head">
          <h3 id="dt-customizer-pinned-title">拖拽调整工具顺序</h3>
          <span className="dt-customizer-count" aria-label={`已固定 ${ordered.length} 个，最多 ${MAX_PINNED} 个`}>{ordered.length}/{MAX_PINNED}</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          accessibility={{ screenReaderInstructions: { draggable: "拖动把手调整排序，也可以聚焦把手后用左右方向键移动工具。" } }}
          onDragStart={event => setActiveDragId(String(event.active.id))}
          onDragEnd={endDrag} onDragCancel={() => setActiveDragId(null)}>
          <SortableContext items={draft.toolbarPinnedIds} strategy={rectSortingStrategy}>
            <div className="dt-pinned-preview" aria-label="已固定工具排序区域">
              {ordered.length ? ordered.map(tool => <SortablePinnedCard key={tool.id} tool={tool} context={context}
                onRemove={id => pin(id, false)} onMove={moveBy}/>)
                : <span className="dt-muted dt-pinned-empty">从下方选择常用工具；未固定的工具仍可从「更多工具」使用。</span>}
            </div>
          </SortableContext>
          {dialog.current && createPortal(<DragOverlay adjustScale={false}
            dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            {activeDragId && allTools.get(activeDragId) ? <DraggedPinnedCard tool={allTools.get(activeDragId)!} context={context}/> : null}
          </DragOverlay>, dialog.current)}
        </DndContext>
      </section>

      <section className="dt-customizer-section" aria-labelledby="dt-customizer-all-title">
        <div className="dt-customizer-section-head"><h3 id="dt-customizer-all-title">全部工具</h3></div>
        <div className="dt-tool-list">
          {tools.map(tool => {
            const pinned = draft.toolbarPinnedIds.includes(tool.id);
            const limit = !pinned && draft.toolbarPinnedIds.length >= MAX_PINNED;
            return <label key={tool.id} className="dt-tool-choice" data-pinned={pinned} data-limit={limit || undefined}>
              <span className="dt-tool-choice-label"><span className="dt-tool-icon" aria-hidden="true">{resolveToolIcon(tool, context)}</span><span>{tool.label}</span></span>
              {pinned ? <Pin className="dt-pin-icon" size={17} fill="currentColor" strokeWidth={1.7} aria-hidden="true"/>
                : <PinOff className="dt-pin-icon" size={17} strokeWidth={1.7} aria-hidden="true"/>}
              <input type="checkbox" aria-label={`固定${tool.label}`} checked={pinned}
                onChange={event => pin(tool.id, event.target.checked)}/>
            </label>;
          })}
        </div>
        {notice && <p className="dt-customizer-notice" role="status">{notice}</p>}
      </section>

      </div> : <div role="tabpanel" id="dt-settings-panel-other" aria-labelledby="dt-settings-tab-other" className="dt-customizer-other-page">
        <section className="dt-general-section" aria-labelledby="dt-general-toolbar-title">
          <h3 id="dt-general-toolbar-title">工具栏行为</h3>
          <div className="dt-general-settings">
            <label className="dt-general-option">
              <span className="dt-general-description"><strong>显示悬浮工具栏</strong><small>选中元素时显示快捷操作，不影响下方交互增强功能。</small></span>
              <input type="checkbox" aria-label="显示悬浮工具栏" checked={draft.toolbarEnabled} onChange={event => setDraft({ ...draft, toolbarEnabled: event.target.checked })}/>
            </label>
            <div className="dt-general-option">
              <span className="dt-general-description"><strong>位置模式</strong><small>选择随选区移动，或保持在指定位置。</small></span>
              <div className="dt-general-mode" role="group" aria-label="位置模式">
                <button type="button" aria-pressed={draft.toolbarMode === "follow"} onClick={() => setDraft({ ...draft, toolbarMode: "follow" })}>跟随选区</button>
                <button type="button" aria-pressed={draft.toolbarMode === "fixed"} onClick={() => setDraft({ ...draft, toolbarMode: "fixed" })}>固定位置</button>
              </div>
            </div>
          </div>
        </section>
        <section className="dt-general-section" aria-labelledby="dt-general-initial-style-title">
          <h3 id="dt-general-initial-style-title">绘图初始化样式</h3>
          <p className="dt-general-hint">保存当前绘图工具的颜色、填充、描边宽度、手绘感、边角、透明度、字体、箭头等设置到插件配置。它只会在重新打开画布时应用，不修改画布中已有的元素。</p>
          <div className="dt-general-option">
            <span className="dt-general-description">
              <strong>同步初始化样式</strong>
              <small>插件配置保存初始化值；下方「默认样式持久化」只在本机 localStorage 记住上次使用的样式。启用本机记忆时，记忆值优先于初始化值。</small>
            </span>
            <button type="button" className="dt-save-initial-style" aria-label="保存当前样式为初始化"
              disabled={saving || initialSaving || !canSaveInitialization}
              title={canSaveInitialization ? "保存当前绘图工具默认样式到思源插件设置" : "独立浏览器为只读，请在思源内打开画布保存同步初始化样式"}
              onClick={() => void saveCurrentAsInitialization()}>
              {initialSaving ? "保存中…" : "保存当前样式为初始化"}
            </button>
          </div>
          {initialSaveStatus && <p role="status" className="dt-initial-style-status">{initialSaveStatus}</p>}
          {!canSaveInitialization && <p className="dt-general-hint">请在思源内部打开画布保存同步初始化样式；独立浏览器会读取并使用预设，但不会覆盖插件配置。</p>}
        </section>
        {features.length > 0 && <section className="dt-general-section" aria-labelledby="dt-general-features-title">
          <h3 id="dt-general-features-title">交互增强</h3>
          <p className="dt-general-hint">各功能均可独立开启。关闭悬浮工具栏不会影响已启用的交互增强。</p>
          <div className="dt-general-features">
            {features.map(feature => <label key={feature.id} className="dt-general-option dt-general-feature">
              <span className="dt-general-description"><strong>{feature.label}</strong><small>{feature.description}</small></span>
              <input type="checkbox" aria-label={feature.label} checked={draft.interactionEnabled[feature.id] ?? feature.defaultEnabled}
                onChange={event => setDraft({ ...draft, interactionEnabled: { ...draft.interactionEnabled, [feature.id]: event.target.checked } })}/>
            </label>)}
          </div>
        </section>}
      </div>}
    </div>
    <footer className="dt-customizer-footer">
      <div className="dt-customizer-footer-left">
        {tab === "toolbar" && <label className="dt-customizer-switch"><input type="checkbox" role="switch" aria-label="显示工具名称" checked={draft.toolbarShowLabels}
          onChange={event => setDraft({ ...draft, toolbarShowLabels: event.target.checked })}/><span className="dt-switch-track"/><span>显示工具名称</span></label>}
        <button type="button" className="dt-reset-button" title="将所有设置恢复为默认值" disabled={saving} onClick={() => { setDraft(normalizeToolbarPreferences({ ...resetDefaults, drawingInitialStyle: draft.drawingInitialStyle })); setNotice(""); }}><RotateCcw size={16} strokeWidth={1.7}/>重置</button>
      </div>
      <div className="dt-customizer-footer-right"><span role="alert">{error}</span>
        <button type="button" className="dt-cancel" disabled={saving} onClick={close}>取消</button>
        <button type="button" className="dt-primary" disabled={saving} onClick={submit}>{saving ? "保存中…" : "保存"}</button>
      </div>
    </footer>
  </dialog>;
}
