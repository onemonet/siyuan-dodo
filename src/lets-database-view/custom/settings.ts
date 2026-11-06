import { Dialog, showMessage } from "siyuan";
import { DatabaseViewConfigStore } from "../view-config-store";
import { getCustomApp, saveCustomApp, listCustomVersions,
  restoreCustomVersion, pinCustomVersion } from "./storage";

/** In-place editor: the app source and AV view configuration are separate. */
export async function openCustomSettings(
  blockId: string, viewId: string, changed: () => void,
): Promise<Dialog> {
  const view = (await DatabaseViewConfigStore.load(blockId)).views[viewId];
  const config = view?.configs?.custom;
  if (view?.mode !== "custom" || !config?.appId) throw new Error("当前视图未绑定自定义应用。");
  let current = await getCustomApp(config.appId);
  const dialog = new Dialog({
    title: "AI 自定义视图 · HTML 编辑器",
    width: "min(1040px,95vw)",
    height: "min(830px,90vh)",
    content: `<div class="dodo-custom-editor" style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:16px;gap:10px">
      <div style="font-size:12px;color:var(--b3-theme-on-surface-light);word-break:break-all">目录：/data/storage/petal/siyuan-dodo/custom-views/<span data-app></span>/ · 版本 <span data-version></span></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <label>高度 <input data-height type="number" min="320" max="1600" step="20" style="width:80px"></label>
        <label><input data-write type="checkbox"> 允许 HTML 修改当前数据库（默认关闭）</label>
      </div>
      <div style="font-size:12px;color:var(--b3-theme-on-surface-light)">HTML 与思源同源运行。数据每批加载量直接继承当前原生视图的「条目数」(5/10/25/50/100/全部)；建议使用 dodoDB.createPaginator().next() 统一续页、去重和刷新。图片使用 assets/文件名.png?style=thumb；支持 ECharts 和 createRecord(values) 表单新增。SDK 写入默认关闭；但无沙箱 HTML 可直接调用思源接口，不受 SDK 写入开关约束，请只运行可信代码。</div>
      <textarea data-html spellcheck="false" style="display:block;flex:1;min-height:260px;width:100%;box-sizing:border-box;resize:none;padding:12px;border:1px solid var(--b3-border-color);border-radius:6px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);font:12px/1.5 Consolas,monospace"></textarea>
      <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <button data-save class="b3-button">保存并刷新视图</button>
        <button data-import class="b3-button b3-button--outline">导入 HTML</button>
        <button data-export class="b3-button b3-button--outline">导出 HTML</button>
        <select data-history class="b3-select" style="max-width:240px"><option value="">历史版本…</option></select>
        <button data-restore class="b3-button b3-button--outline">恢复所选版本</button>
        <button data-pin class="b3-button b3-button--outline">固定所选版本</button>
        <span data-status style="font-size:12px;flex:1"></span>
        <input data-file type="file" accept=".html,text/html" hidden>
      </div>
    </div>`,
  });
  const host = dialog.element.querySelector<HTMLElement>(".dodo-custom-editor")!;
  const find = <T extends Element>(key: string) => host.querySelector<T>(`[data-${key}]`)!;
  const editor = find<HTMLTextAreaElement>("html");
  const height = find<HTMLInputElement>("height");
  const write = find<HTMLInputElement>("write");
  const history = find<HTMLSelectElement>("history");
  const pinButton = find<HTMLButtonElement>("pin");
  const status = find<HTMLElement>("status");
  editor.value = current.html;
  height.value = String(config.height || 650);
  write.checked = config.allowWrites === true;
  find<HTMLElement>("app").textContent = config.appId;
  const showVersion = () => find<HTMLElement>("version").textContent = String(current.manifest.version);
  showVersion();
  let pinnedVersions = new Set(current.manifest.pinnedVersions || []);
  const updatePinButton = () => {
    pinButton.disabled = !history.value;
    pinButton.textContent = pinnedVersions.has(history.value) ? "取消固定" : "固定所选版本";
  };
  const loadHistory = async () => {
    const selected = history.value;
    const manifest=(await getCustomApp(config.appId)).manifest;
    pinnedVersions=new Set(manifest.pinnedVersions || []);
    history.replaceChildren(new Option("历史版本…", ""));
    for (const item of await listCustomVersions(config.appId))
      history.append(new Option((pinnedVersions.has(item) ? "★ " : "")+item, item));
    if([...history.options].some(option=>option.value===selected)) history.value=selected;
    updatePinButton();
  };
  history.addEventListener("change",updatePinButton);
  pinButton.onclick=()=>void (async()=>{
    if(!history.value)return;
    const filename=history.value;
    const next=!pinnedVersions.has(filename);
    try{
      await pinCustomVersion(config.appId,filename,next);
      await loadHistory();
      status.textContent=next?"已固定版本，不参与自动清理":"已取消固定，后续超额时会自动清理";
    }catch(error){status.textContent=String(error);}
  })();
  void loadHistory().catch(error => { status.textContent = "无法列出历史版本：" + error; });
  find<HTMLButtonElement>("save").onclick = () => void (async () => {
    const writeEnabled = write.checked;
    if (writeEnabled && !config.allowWrites &&
        !window.confirm("这将允许 HTML 执行数据库新增及文本、数字、复选框写入。仅启用你信任的 HTML。确定吗？")) {
      write.checked = false; return;
    }
    const nextHeight = Math.min(1600, Math.max(320, Number(height.value) || 650));
    status.textContent = "正在保存…";
    try {
      const saved = await saveCustomApp(config.appId, editor.value, current.manifest.version);
      const next = await DatabaseViewConfigStore.updateView(blockId, viewId, entry => {
        if (entry.mode !== "custom" || entry.configs.custom?.appId !== config.appId)
          throw new Error("当前数据库视图已切换");
        return { ...entry, configs: { ...entry.configs, custom: {
          appId: config.appId, height: nextHeight, allowWrites: writeEnabled,
        }}};
      });
      void next;
      current = await getCustomApp(config.appId);
      showVersion();
      status.textContent = "保存成功";
      changed();
      void loadHistory();
      if (saved.version !== current.manifest.version)
        throw new Error("版本在保存过程中发生变化。");
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      showMessage("自定义 HTML 保存失败：" + status.textContent, 6000, "error");
    }
  })();
  find<HTMLButtonElement>("restore").onclick = () => void (async () => {
    if (!history.value || !window.confirm("要恢复此历史版本吗？当前代码会自动备份。")) return;
    try {
      await restoreCustomVersion(config.appId, history.value, current.manifest.version);
      current = await getCustomApp(config.appId);
      editor.value = current.html;
      showVersion(); changed(); await loadHistory();
      status.textContent = "已恢复历史版本";
    } catch (error) { status.textContent = String(error); }
  })();
  const file = find<HTMLInputElement>("file");
  find<HTMLButtonElement>("import").onclick = () => file.click();
  file.onchange = () => void (async () => {
    if (!file.files?.[0]) return;
    editor.value = await file.files[0].text();
    status.textContent = "HTML 已载入编辑器，点击保存后生效。";
  })();
  find<HTMLButtonElement>("export").onclick = () => {
    const url = URL.createObjectURL(new Blob([editor.value], {type:"text/html"}));
    const link = document.createElement("a");
    link.href = url; link.download = "dodo-custom-" + config.appId + ".html";
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return dialog;
}
