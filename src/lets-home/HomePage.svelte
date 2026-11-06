<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import Check from "lucide-svelte/icons/check";
  import Layers3 from "lucide-svelte/icons/layers-3";
  import LayoutTemplate from "lucide-svelte/icons/layout-template";
  import Pencil from "lucide-svelte/icons/pencil";
  import X from "lucide-svelte/icons/x";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import { GridStack, type GridStackWidget } from "gridstack";
  import "gridstack/dist/gridstack.min.css";
  import {
    createHomeLayout,
    getHomeWidgetDefinition,
    getWidgetInstanceId,
    HOME_GRID_CELL_HEIGHT,
    HOME_GRID_COLUMNS,
    HOME_GRID_MARGIN,
    HOME_GRID_MIN_ROWS,
    HOME_LAYOUT_VERSION,
    HOME_COMPONENT_CATALOG,
    HOME_LEGACY_WIDGET_IDS,
    HOME_WIDGET_CATEGORIES,
    HOME_WIDGET_CATALOG,
    HOME_CLOCK_DEFAULT_HEIGHT,
    HOME_CLOCK_DEFAULT_WIDTH,
    HOME_HOLIDAY_DEFAULT_HEIGHT,
    HOME_HOLIDAY_DEFAULT_WIDTH,
    HOME_WIDGET_DEFAULT_HEIGHT,
    HOME_WIDGET_DEFAULT_WIDTH,
    getHomeWidgetMinHeight,
    getHomeWidgetMinWidth,
    type HomeLayout,
    type HomeLayoutTemplate,
    type HomeWidgetBackground,
    type HomeWidget,
    type HomeWidgetId,
  } from "./config";
  import WidgetRenderer from "./widgets/WidgetRenderer.svelte";
  import { getWidgetIcon } from "./widgets/registry";
  import CardBackgroundEditor from "./widgets/CardBackgroundEditor.svelte";
  import {
    getWidgetBackgroundBlendMode,
    getWidgetBackgroundValue,
  } from "./widgets/shared/background";
  import type { WidgetConfigChange } from "./widgets/types";
  import "./home.css";

  export let defaultTemplate: HomeLayoutTemplate = "balanced";
  export let initialLayout: HomeLayout | null = null;
  export let onLayoutChange: (layout: HomeLayout) => void = () => {};

  const TEMPLATE_LABELS: Record<HomeLayoutTemplate, string> = {
    balanced: "平衡",
    focus: "聚焦",
    dense: "密集",
  };

  type GridChangeItem = GridStackWidget & { el?: HTMLElement };
  type ContextMenuMode = "canvas" | "widget" | "widget-edit";

  const LONG_PRESS_MS = 500;
  const replayedMouseDownEvents = new WeakSet<MouseEvent>();

  let layout: HomeLayout = initialLayout ?? createHomeLayout(defaultTemplate);
  let gridElement: HTMLDivElement;
  let contextMenuElement: HTMLElement;
  let grid: GridStack | null = null;
  let persistTimer: number | null = null;
  let syncingGrid = false;
  let activeWidgetInstanceId: string | null = null;
  let contextMenuOpen = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuMode: ContextMenuMode = "canvas";
  let contextMenuWidgetInstanceId: string | null = null;
  let contextMenuWidget: HomeWidget | null = null;
  let editingWidgetInstanceId: string | null = null;
  let longPressTimer: number | null = null;
  let longPressTarget: HTMLElement | null = null;
  let longPressStartX = 0;
  let longPressStartY = 0;

  $: contextMenuWidget = contextMenuWidgetInstanceId
    ? layout.widgets.find(
        (widget) =>
          getWidgetInstanceId(widget) === contextMenuWidgetInstanceId,
      ) ?? null
    : null;

  function toGridWidget(widget: HomeWidget): GridStackWidget {
    return {
      id: getWidgetInstanceId(widget),
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      minW: getHomeWidgetMinWidth(widget.id),
      minH: getHomeWidgetMinHeight(widget.id),
    };
  }

  function readGridWidget(widget: GridChangeItem): HomeWidget | null {
    const instanceId = String(widget.id ?? widget.el?.dataset.widgetId ?? "");
    const source = layout.widgets.find(
      (item) => getWidgetInstanceId(item) === instanceId,
    );
    const id = source?.id ?? widget.el?.dataset.widgetType;
    if (!id || !HOME_WIDGET_CATALOG.some((item) => item.id === id)) {
      return null;
    }

    const widgetId = id as HomeWidgetId;
    const w = Math.max(
      getHomeWidgetMinWidth(widgetId),
      Math.round(Number(widget.w) || 1),
    );
    return {
      id: widgetId,
      instanceId:
        source?.instanceId ?? (instanceId !== id ? instanceId : undefined),
      config: source?.config,
      x: Math.max(0, Math.round(Number(widget.x) || 0)),
      y: Math.max(0, Math.round(Number(widget.y) || 0)),
      w: Math.min(HOME_GRID_COLUMNS, w),
      h: Math.max(
        getHomeWidgetMinHeight(widgetId),
        Math.round(Number(widget.h) || 1),
      ),
    };
  }

  function captureGridLayout(): HomeLayout {
    if (!grid) {
      return layout;
    }

    const saved = grid.save(false, false, undefined, HOME_GRID_COLUMNS);
    if (!Array.isArray(saved)) {
      return layout;
    }

    const savedById = new Map<string, HomeWidget>();
    for (const item of saved as GridChangeItem[]) {
      const widget = readGridWidget(item);
      if (widget) {
        savedById.set(getWidgetInstanceId(widget), widget);
      }
    }

    return {
      ...layout,
      widgets: layout.widgets.map(
        (widget) => savedById.get(getWidgetInstanceId(widget)) ?? widget,
      ),
    };
  }

  function schedulePersist(): void {
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer);
    }

    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      onLayoutChange({
        version: HOME_LAYOUT_VERSION,
        template: layout.template,
        widgets: layout.widgets.map((widget) => ({ ...widget })),
      });
    }, 180);
  }

  async function syncGridFromLayout(): Promise<void> {
    if (!grid) {
      return;
    }

    await tick();
    syncingGrid = true;

    try {
      const desiredIds = new Set(
        layout.widgets.map((widget) => getWidgetInstanceId(widget)),
      );
      const nodes = [...(((grid.engine as any).nodes ?? []) as Array<any>)];

      grid.batchUpdate();
      for (const node of nodes) {
        const id = String(node.id ?? node.el?.dataset.widgetId ?? "");
        if (!desiredIds.has(id) && node.el) {
          grid.removeWidget(node.el, true, false);
        }
      }

      for (const widget of layout.widgets) {
        const element = Array.from(
          gridElement.querySelectorAll<HTMLElement>(".grid-stack-item"),
        ).find(
          (item) =>
            item.dataset.widgetId === getWidgetInstanceId(widget),
        );
        if (!element) {
          continue;
        }

        const gridWidget = toGridWidget(widget);
        if ((element as any).gridstackNode) {
          grid.update(element, gridWidget);
        } else {
          grid.makeWidget(element, gridWidget);
        }
      }
      grid.batchUpdate(false);
    } finally {
      syncingGrid = false;
    }
  }

  function setTemplate(template: HomeLayoutTemplate): void {
    layout = captureGridLayout();
    const legacyIds = new Set<string>(HOME_LEGACY_WIDGET_IDS);
    const enabledLegacyIds = new Set(
      layout.widgets
        .filter((widget) => legacyIds.has(widget.id))
        .map((widget) => widget.id),
    );
    const next = createHomeLayout(template);
    next.widgets = [
      ...next.widgets.filter((widget) => enabledLegacyIds.has(widget.id)),
      ...layout.widgets.filter((widget) => !legacyIds.has(widget.id)),
    ];
    layout = next;
    schedulePersist();
    void syncGridFromLayout();
  }

  function handleTemplateChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    setTemplate(value as HomeLayoutTemplate);
  }

  function getDragContent(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement) || !gridElement?.contains(target)) {
      return null;
    }

    if (
      target.closest(
        'input,textarea,button,select,option,[contenteditable="true"],.ui-resizable-handle',
      )
    ) {
      return null;
    }

    return target.closest<HTMLElement>(".grid-stack-item-content");
  }

  function clearLongPress(): void {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    longPressTarget?.classList.remove("home-long-press-pending");
    longPressTarget = null;
  }

  function handleGridMouseDown(event: MouseEvent): void {
    if (replayedMouseDownEvents.has(event)) {
      replayedMouseDownEvents.delete(event);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const target = getDragContent(event.target);
    if (!target) {
      return;
    }

    clearLongPress();
    longPressTarget = target;
    longPressStartX = event.clientX;
    longPressStartY = event.clientY;
    target.classList.add("home-long-press-pending");
    event.preventDefault();

    const clientX = event.clientX;
    const clientY = event.clientY;
    longPressTimer = window.setTimeout(() => {
      const dragTarget = longPressTarget;
      clearLongPress();
      if (!dragTarget) {
        return;
      }

      const replay = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
      });
      replayedMouseDownEvents.add(replay);
      dragTarget.dispatchEvent(replay);
    }, LONG_PRESS_MS);
  }

  function handleLongPressMouseMove(event: MouseEvent): void {
    if (
      longPressTarget &&
      Math.abs(event.clientX - longPressStartX) +
        Math.abs(event.clientY - longPressStartY) > 4
    ) {
      clearLongPress();
    }
  }

  function openContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const widgetElement = target?.closest<HTMLElement>(".grid-stack-item");
    contextMenuWidgetInstanceId = widgetElement?.dataset.widgetId ?? null;
    contextMenuMode = contextMenuWidgetInstanceId ? "widget" : "canvas";
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuOpen = true;
    void clampContextMenuPosition();
  }

  async function clampContextMenuPosition(): Promise<void> {
    await tick();
    if (!contextMenuElement) {
      return;
    }

    const margin = 8;
    contextMenuX = Math.max(
      margin,
      Math.min(
        contextMenuX,
        window.innerWidth - contextMenuElement.offsetWidth - margin,
      ),
    );
    contextMenuY = Math.max(
      margin,
      Math.min(
        contextMenuY,
        window.innerHeight - contextMenuElement.offsetHeight - margin,
      ),
    );
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
    contextMenuMode = "canvas";
    contextMenuWidgetInstanceId = null;
  }

  function handleGlobalPointerDown(event: PointerEvent): void {
    if (
      contextMenuOpen &&
      contextMenuElement &&
      !contextMenuElement.contains(event.target as Node)
    ) {
      closeContextMenu();
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      closeContextMenu();
    }
  }

  async function editWidget(widget: HomeWidget): Promise<void> {
    const instanceId = getWidgetInstanceId(widget);
    editingWidgetInstanceId = instanceId;
    activeWidgetInstanceId = instanceId;
    contextMenuMode = "widget-edit";
    contextMenuOpen = true;
    void clampContextMenuPosition();

    if (widget.id !== "sticky-note") {
      return;
    }

    await tick();
    const element = Array.from(
      gridElement.querySelectorAll<HTMLElement>(".grid-stack-item"),
    ).find((item) => item.dataset.widgetId === instanceId);
    element?.querySelector<HTMLInputElement>(".sticky-note-title")?.focus();
  }

  function editContextMenuWidget(): void {
    if (contextMenuWidget) {
      void editWidget(contextMenuWidget);
    }
  }

  function removeContextMenuWidget(): void {
    if (!contextMenuWidget) {
      return;
    }

    removeWidget(contextMenuWidget);
    closeContextMenu();
  }

  function resetLayout(): void {
    layout = createHomeLayout(layout.template);
    schedulePersist();
    void syncGridFromLayout();
  }

  function updateWidgetConfig(
    widget: HomeWidget,
    change: WidgetConfigChange,
  ): void {
    const instanceId = getWidgetInstanceId(widget);
    layout = {
      ...layout,
      widgets: layout.widgets.map((item) =>
        getWidgetInstanceId(item) === instanceId
          ? {
              ...item,
              config: { ...item.config, [change.field]: change.value },
            }
          : item,
      ),
    };
    schedulePersist();
  }

  function handleWidgetConfigChange(
    event: CustomEvent<WidgetConfigChange>,
    widget: HomeWidget,
  ): void {
    updateWidgetConfig(widget, event.detail);
  }

  function updateWidgetBackground(
    widget: HomeWidget,
    background: HomeWidgetBackground,
  ): void {
    const instanceId = getWidgetInstanceId(widget);
    layout = {
      ...layout,
      widgets: layout.widgets.map((item) =>
        getWidgetInstanceId(item) === instanceId
          ? { ...item, config: { ...item.config, background } }
          : item,
      ),
    };
    schedulePersist();
  }

  function handleWidgetBackgroundChange(
    event: CustomEvent<HomeWidgetBackground>,
    widget: HomeWidget | null,
  ): void {
    if (widget) {
      updateWidgetBackground(widget, event.detail);
    }
  }

  function addWidget(id: HomeWidgetId): void {
    layout = captureGridLayout();

    const definition = HOME_COMPONENT_CATALOG.find((widget) => widget.id === id);
    if (!definition?.implemented) {
      return;
    }

    const nextY = Math.max(
      0,
      ...layout.widgets.map((widget) => widget.y + widget.h),
    );
    const isClock = id === "clock";
    const isNextHoliday = id === "next-holiday";
    layout = {
      ...layout,
      widgets: [
        ...layout.widgets,
        {
          id,
          instanceId: `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          config: id === "sticky-note" ? { title: "", content: "" } : undefined,
          x: 0,
          y: nextY,
          w: isClock
            ? HOME_CLOCK_DEFAULT_WIDTH
            : isNextHoliday
              ? HOME_HOLIDAY_DEFAULT_WIDTH
              : HOME_WIDGET_DEFAULT_WIDTH,
          h: isClock
            ? HOME_CLOCK_DEFAULT_HEIGHT
            : isNextHoliday
              ? HOME_HOLIDAY_DEFAULT_HEIGHT
              : HOME_WIDGET_DEFAULT_HEIGHT,
        },
      ],
    };
    schedulePersist();
    void syncGridFromLayout();
  }

  function removeWidget(widget: HomeWidget): void {
    const instanceId = getWidgetInstanceId(widget);
    if (activeWidgetInstanceId === instanceId) {
      activeWidgetInstanceId = null;
    }
    if (editingWidgetInstanceId === instanceId) {
      editingWidgetInstanceId = null;
    }
    layout = captureGridLayout();
    layout = {
      ...layout,
      widgets: layout.widgets.filter(
        (item) => getWidgetInstanceId(item) !== instanceId,
      ),
    };
    schedulePersist();
    void syncGridFromLayout();
  }

  function handleGridChange(_event: Event, items: GridChangeItem[]): void {
    if (syncingGrid || !items?.length) {
      return;
    }

    layout = captureGridLayout();
    schedulePersist();
  }

  function handleGridDragStart(_event: Event, element: HTMLElement): void {
    activeWidgetInstanceId = element.dataset.widgetId ?? null;
  }

  function handleGridDragStop(): void {
    activeWidgetInstanceId = null;
    layout = captureGridLayout();
    schedulePersist();
  }

  function handleGridResizeStart(_event: Event, element: HTMLElement): void {
    activeWidgetInstanceId = element.dataset.widgetId ?? null;
  }

  function handleGridResizeStop(): void {
    activeWidgetInstanceId = null;
    layout = captureGridLayout();
    schedulePersist();
  }

  onMount(() => {
    grid = GridStack.init(
      {
        column: HOME_GRID_COLUMNS,
        columnOpts: {
          columnMax: HOME_GRID_COLUMNS,
          breakpointForWindow: false,
          columnWidth: 160,
          layout: "move",
        },
        cellHeight: HOME_GRID_CELL_HEIGHT,
        margin: HOME_GRID_MARGIN,
        minRow: HOME_GRID_MIN_ROWS,
        float: true,
        animate: true,
        disableDrag: false,
        disableResize: false,
        draggable: {
          handle: ".grid-stack-item-content",
          cancel: ".home-long-press-pending",
        },
        resizable: { handles: "se" },
      },
      gridElement,
    );

    if (!grid) {
      return;
    }

    grid.on("change", handleGridChange);
    grid.on("dragstart", handleGridDragStart);
    grid.on("dragstop", handleGridDragStop);
    grid.on("resizestart", handleGridResizeStart);
    grid.on("resizestop", handleGridResizeStop);
    gridElement.addEventListener("mousedown", handleGridMouseDown, true);
    document.addEventListener("mousemove", handleLongPressMouseMove, true);
    document.addEventListener("mouseup", clearLongPress, true);
    window.addEventListener("blur", clearLongPress);
    window.addEventListener("pointerdown", handleGlobalPointerDown);
    window.addEventListener("keydown", handleGlobalKeydown);

    void syncGridFromLayout();
  });

  onDestroy(() => {
    clearLongPress();
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer);
    }
    gridElement?.removeEventListener("mousedown", handleGridMouseDown, true);
    document.removeEventListener("mousemove", handleLongPressMouseMove, true);
    document.removeEventListener("mouseup", clearLongPress, true);
    window.removeEventListener("blur", clearLongPress);
    window.removeEventListener("pointerdown", handleGlobalPointerDown);
    window.removeEventListener("keydown", handleGlobalKeydown);
    grid?.offAll();
    grid?.destroy(false);
    grid = null;
  });
</script>

<div class="home-root">
  <main
    class="home-stage"
    role="application"
    aria-label="主页网格工作台"
    on:contextmenu={openContextMenu}
  >
    {#if contextMenuOpen}
      <div
        bind:this={contextMenuElement}
        class="home-context-menu"
        class:home-context-menu-edit={contextMenuMode === "widget-edit"}
        role="menu"
        aria-label="主页菜单"
        style={`left: ${contextMenuX}px; top: ${contextMenuY}px;`}
        on:contextmenu|preventDefault|stopPropagation
      >
        {#if contextMenuMode === "widget-edit" && contextMenuWidget}
          {@const contextDefinition = getHomeWidgetDefinition(contextMenuWidget.id)}
          <div class="module-panel-heading">
            <div>
              <strong>{contextDefinition.title}</strong>
              <span>卡片设置</span>
            </div>
            <button
              class="icon-button context-menu-close"
              type="button"
              title="关闭设置"
              aria-label="关闭设置"
              on:click={closeContextMenu}
            >
              <X size={16} />
            </button>
          </div>
          <CardBackgroundEditor
            background={contextMenuWidget.config?.background}
            on:change={(event) =>
              handleWidgetBackgroundChange(event, contextMenuWidget)}
          />
          <div class="context-menu-actions context-menu-edit-actions">
            <button
              class="context-menu-action"
              role="menuitem"
              type="button"
              on:click={() => (contextMenuMode = "widget")}
            >
              <Pencil size={15} />
              <span>返回</span>
            </button>
            <button
              class="context-menu-action"
              role="menuitem"
              type="button"
              on:click={closeContextMenu}
            >
              <Check size={15} />
              <span>完成</span>
            </button>
          </div>
        {:else if contextMenuMode === "widget" && contextMenuWidget}
          {@const contextDefinition = getHomeWidgetDefinition(contextMenuWidget.id)}
          <div class="module-panel-heading">
            <div>
              <strong>{contextDefinition.title}</strong>
              <span>组件操作</span>
            </div>
            <button
              class="icon-button context-menu-close"
              type="button"
              title="关闭菜单"
              aria-label="关闭菜单"
              on:click={closeContextMenu}
            >
              <X size={16} />
            </button>
          </div>
          <div class="context-menu-actions context-menu-widget-actions">
            <button
              class="context-menu-action"
              role="menuitem"
              type="button"
              on:click={editContextMenuWidget}
            >
              <Pencil size={15} />
              <span>编辑</span>
            </button>
            <button
              class="context-menu-action context-menu-danger"
              role="menuitem"
              type="button"
              on:click={removeContextMenuWidget}
            >
              <Trash2 size={15} />
              <span>删除</span>
            </button>
          </div>
        {:else}
          <div class="module-panel-heading">
            <div>
              <strong>添加组件</strong>
              <span>{layout.widgets.length} 个模块</span>
            </div>
            <button
              class="icon-button context-menu-close"
              type="button"
              title="关闭菜单"
              aria-label="关闭菜单"
              on:click={closeContextMenu}
            >
              <X size={16} />
            </button>
          </div>
          <label class="context-template" title="布局模板">
            <LayoutTemplate size={15} />
            <span>布局模板</span>
            <select
              aria-label="布局模板"
              value={layout.template}
              on:change={handleTemplateChange}
            >
              {#each Object.entries(TEMPLATE_LABELS) as [value, label]}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </label>
          <div class="context-menu-actions">
            <button
              class="context-menu-action"
              role="menuitem"
              type="button"
              on:click={() => {
                resetLayout();
                closeContextMenu();
              }}
            >
              <RotateCcw size={15} />
              <span>恢复当前模板</span>
            </button>
          </div>
          <div class="context-menu-section"><Layers3 size={14} /> 添加组件</div>
          <div class="home-component-catalog">
            {#each HOME_WIDGET_CATEGORIES as category (category.id)}
              <section class="home-component-category">
                <div class="home-component-category-heading">
                  <strong>{category.title}</strong>
                  <small>{category.description}</small>
                </div>
                <div class="module-list">
                  {#each HOME_COMPONENT_CATALOG.filter((module) => module.category === category.id) as module (module.id)}
                    <button
                      class:module-disabled={!module.implemented}
                      class="module-option"
                      role="menuitem"
                      type="button"
                      disabled={!module.implemented}
                      title={module.implemented ? `添加${module.title}` : "组件暂未实现"}
                      on:click={() => addWidget(module.id)}
                    >
                      <span class="module-option-icon">
                        <svelte:component this={getWidgetIcon(module.id)} size={16} />
                      </span>
                      <span class="module-option-copy">
                        <strong>{module.title}</strong>
                        <small>{module.description}</small>
                      </span>
                      <span class="module-option-state">{module.implemented ? "添加" : "未实现"}</span>
                    </button>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="home-grid-shell">
      <div class="grid-stack" bind:this={gridElement}>
        {#each layout.widgets as widget (getWidgetInstanceId(widget))}
          {@const definition = getHomeWidgetDefinition(widget.id)}
          <div
            class="grid-stack-item"
            class:widget-active={activeWidgetInstanceId === getWidgetInstanceId(widget)}
            data-widget-id={getWidgetInstanceId(widget)}
            data-widget-type={widget.id}
            gs-id={getWidgetInstanceId(widget)}
            gs-x={widget.x}
            gs-y={widget.y}
            gs-w={widget.w}
            gs-h={widget.h}
            gs-min-w={getHomeWidgetMinWidth(widget.id)}
            gs-min-h={getHomeWidgetMinHeight(widget.id)}
          >
            <article
              class:widget-editing={editingWidgetInstanceId === getWidgetInstanceId(widget)}
              class="grid-stack-item-content home-widget widget-{widget.id}"
              style:background={getWidgetBackgroundValue(widget.config)}
              style:background-blend-mode={getWidgetBackgroundBlendMode(widget.config)}
            >
              <div class="widget-topline">
                <div class="widget-title-group">
                  <span class="widget-icon"><svelte:component this={getWidgetIcon(widget.id)} size={17} /></span>
                  <div>
                    {#if widget.id !== "next-holiday"}
                      <span class="widget-eyebrow">{definition.eyebrow}</span>
                    {/if}
                    <h2>{definition.title}</h2>
                  </div>
                </div>
              </div>

              <WidgetRenderer
                widget={widget}
                on:configchange={(event) => handleWidgetConfigChange(event, widget)}
              />
            </article>
          </div>
        {/each}
      </div>
    </div>
  </main>
</div>
