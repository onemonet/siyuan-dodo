import type { InteractionFeature } from "../toolbar/types";

/** Adaptation of left-app-menu-toggle.js for Excalidraw 0.18's App-menu__left. */
const CLASS = "dodo-left-panel-toggle-enabled";
const OPEN = "dodo-left-panel-open";
const STORAGE = "excalidraw-v2-left-app-menu-open";
const feature: InteractionFeature = {
  id: "leftAppMenuToggle", label: "左侧工具面板开关",
  description: "在原生左上角菜单右侧显示工具面板开关；状态保存在当前浏览器。",
  defaultEnabled: false,
  mount() {
    const style = document.createElement("style");
    style.dataset.dodoLeftPanel = "true";
    style.textContent = `body.${CLASS} .Island.App-menu__left {display:none!important;}
      body.${CLASS}.${OPEN} .Island.App-menu__left {display:flex!important;}
      /* The native menu trigger's wrapper otherwise stacks buttons
         vertically. Align controls side by side in its header row. */
      body.${CLASS} .dodo-left-panel-controls {
        display:inline-flex;flex-direction:row;align-items:center;gap:4px;width:max-content;
      }
      body.${CLASS} .dodo-left-panel-controls > .dodo-left-panel-toggle {
        flex:0 0 auto;align-self:center;
      }
      body.${CLASS} .dodo-left-panel-controls > .dodo-left-panel-toggle > svg {
        width:22px;height:22px;flex-shrink:0;
      }`;
    document.head.append(style);
    const button = document.createElement("button");
    button.type = "button"; button.className = "dropdown-menu-button zen-mode-transition dodo-left-panel-toggle";
    button.setAttribute("aria-label","左侧工具面板"); button.title = "左侧工具面板";
    // Reuse native dropdown-menu-button sizing and hover/focus styles.
    button.dataset.preventOutsideClick = "true";
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>`;
    let open = false;
    try { open = localStorage.getItem(STORAGE) === "true"; } catch {}
    const refresh = () => { document.body.classList.toggle(OPEN,open); button.setAttribute("aria-pressed",String(open)); button.style.color = open ? "#7255fc" : "inherit"; };
    document.body.classList.add(CLASS);
    refresh();
    button.addEventListener("click", event => { event.stopPropagation(); open = !open; refresh(); try { localStorage.setItem(STORAGE,String(open)); } catch {} });
    let mountedHost: HTMLElement | null = null;
    let observedTrigger: HTMLElement | null = null;
    const syncSize = () => {
      if (!observedTrigger) return;
      const rect = observedTrigger.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      // Read the actual native size: themes/zoom can make it larger than 36px.
      button.style.width = rect.width + "px";
      button.style.height = rect.height + "px";
      button.style.borderRadius = getComputedStyle(observedTrigger).borderRadius;
      const nativeIcon = observedTrigger.querySelector("svg");
      const icon = button.querySelector("svg");
      if (nativeIcon && icon) {
        const size = nativeIcon.getBoundingClientRect();
        if (size.width > 0 && size.height > 0) {
          icon.style.flexShrink = "0";
          icon.style.width = size.width + "px";
          icon.style.height = size.height + "px";
        }
      }
    };
    const sizeObserver = new ResizeObserver(syncSize);
    const insert = () => {
      const trigger = document.querySelector<HTMLElement>(".main-menu-trigger");
      const host = trigger?.parentElement;
      if (!host) return;
      if (mountedHost !== host) {
        mountedHost?.classList.remove("dodo-left-panel-controls");
        mountedHost = host;
      }
      host.classList.add("dodo-left-panel-controls");
      if (trigger.nextElementSibling !== button) trigger.insertAdjacentElement("afterend", button);
      if (observedTrigger !== trigger) {
        sizeObserver.disconnect();
        observedTrigger = trigger;
        sizeObserver.observe(trigger);
      }
      syncSize();
    };
    insert();
    // Excalidraw can recreate the native top bar on theme/zen-mode changes.
    const timer = window.setInterval(insert, 1600);
    return () => {
      clearInterval(timer); sizeObserver.disconnect(); button.remove(); style.remove();
      mountedHost?.classList.remove("dodo-left-panel-controls");
      document.body.classList.remove(CLASS,OPEN);
    };
  },
};
export default feature;
