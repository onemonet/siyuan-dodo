import { showMessage } from "siyuan";
import { detachInactiveCustomAppReferences, moveUnusedCustomAppToTrash,
  purgeCustomAppFromTrash, restoreCustomAppFromTrash,
  scanCustomAppReferences, type CustomAppReferenceScan } from "./app-management";
import { loadAppReferenceLabels, openAppDatabaseBlock,
  type DatabaseBlockLabel } from "./app-reference-navigation";
import { getCustomHistoryLimit, HISTORY_LIMIT_OPTIONS, listCustomApps,
  pruneCustomAppVersions, setCustomHistoryLimit, type CustomAppSummary } from "./storage";

const sizeText = (app: CustomAppSummary): string => {
  if (app.error) return "文件异常";
  const kiB = (app.bytes / 1024).toFixed(1) + " KiB";
  return app.sizeComplete ? kiB : "至少 " + kiB;
};

function makeButton(label:string, action:()=>Promise<void>, danger=false): HTMLButtonElement {
  const button=document.createElement("button");
  button.type="button";
  button.className="b3-button b3-button--outline";
  button.textContent=label;
  if(danger) button.style.color="var(--b3-theme-error)";
  button.onclick=()=>void (async()=>{
    button.disabled=true;
    try { await action(); }
    catch(error) { showMessage("App 管理失败："+(error instanceof Error?error.message:String(error)),6500,"error"); }
    finally {button.disabled=false;}
  })();
  return button;
}

/** Embed the manager in the existing database settings scroll container.
 * No independent Dialog, overlay, or nested scrolling surface is created. */
export function mountCustomAppManager(container: HTMLElement): () => void {
  container.innerHTML = `<div class="dodo-custom-app-manager" style="padding:16px 18px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;min-width:0">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label>每个 App 保留最近 <select data-limit class="b3-select"></select> 个历史版本</label>
        <button data-apply class="b3-button">应用并清理超额版本</button>
        <button data-refresh class="b3-button b3-button--outline">刷新列表</button>
      </div>
      <p style="margin:0;color:var(--b3-theme-on-surface-light);font-size:12px">
        当前 HTML 不计入版本上限。手动固定的历史快照始终保留；超过数量的未固定快照会在每次保存后自动删除。
        App 只有在思源数据库引用扫描未发现关联时才能回收，回收后可恢复；彻底清空回收站才会永久删除。
        关闭的笔记本可能未出现在 SQL 索引中，清理前请确认这些笔记本没有使用该 App。
      </p>
      <div data-status role="status" style="min-height:18px;font-size:12px;color:var(--b3-theme-on-surface-light)">正在扫描应用和数据库引用…</div>
      <h3 style="margin:0;font-size:15px">现有应用</h3>
      <div data-apps style="display:flex;flex-direction:column;gap:7px"></div>
      <h3 style="margin:10px 0 0;font-size:15px">回收站</h3>
      <div data-trash style="display:flex;flex-direction:column;gap:7px"></div>
      <button data-purge class="b3-button b3-button--outline" style="align-self:flex-start;color:var(--b3-theme-error)">彻底清空回收站</button>
    </div>`;
  const host=container.querySelector<HTMLElement>(".dodo-custom-app-manager")!;
  const find=<T extends Element>(name:string)=>host.querySelector<T>(`[data-${name}]`)!;
  const status=find<HTMLElement>("status");
  const options=find<HTMLSelectElement>("limit");
  const appsHost=find<HTMLElement>("apps"),trashHost=find<HTMLElement>("trash");
  for(const value of HISTORY_LIMIT_OPTIONS) options.append(new Option(String(value),String(value)));

  const notice=(message:string)=>{status.textContent=message;};
  let refreshSequence=0;
  const refresh = async ():Promise<void> => {
    const sequence=++refreshSequence;
    notice("正在扫描应用和数据库引用…");
    let referenceScan:CustomAppReferenceScan|null=null;
    let referenceError="";
    let labels:Record<string,DatabaseBlockLabel>=Object.create(null);
    const [apps,trash,limit]=await Promise.all([
      listCustomApps(),listCustomApps("trash"),getCustomHistoryLimit(),
    ]);
    try {referenceScan=await scanCustomAppReferences();}
    catch(error){referenceError=error instanceof Error?error.message:String(error);}
    if (referenceScan) {
      // Presentation metadata should not block the App controls if a closed
      // notebook cannot provide block titles or paths.
      try { labels=await loadAppReferenceLabels(referenceScan); }
      catch(error) {console.warn("[Dodo App 管理] 无法读取数据库块标题",error);}
    }
    if(sequence!==refreshSequence || !host.isConnected) return;
    options.value=String(limit);
    appsHost.replaceChildren();
    trashHost.replaceChildren();
    notice(referenceError
      ? "数据库引用扫描失败，已禁用应用删除："+referenceError
      : `找到 ${apps.length} 个 App · 回收站 ${trash.length} 个 · 已检查 ${referenceScan!.scannedBlocks} 个数据库视图配置块`);

    const buildRow=(app:CustomAppSummary,archived:boolean):HTMLDivElement=>{
      const row=document.createElement("div");
      row.style.cssText="padding:12px;border:1px solid var(--b3-border-color);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap";
      const details=document.createElement("div");details.style.cssText="flex:1;min-width:240px;word-break:break-word";
      const title=document.createElement("div");title.style.fontWeight="600";title.textContent=app.appId;
      const sub=document.createElement("div");sub.style.cssText="font-size:12px;color:var(--b3-theme-on-surface-light);margin-top:4px";
      const refs=referenceScan?.byApp[app.appId] || [];
      const live=refs.filter(ref=>ref.mode==="custom").length;
      const held=refs.filter(ref=>ref.mode!=="custom").length;
      const referenceText=archived?"回收站":
        referenceError?"引用状态无法确认":live?`使用中 ${live} 处`:
          held?`保留关联 ${held} 处（切回表格的视图也会保留引用）`:"未发现引用";
      sub.textContent=app.error || `v${app.version} · 历史 ${app.versions} 份（固定 ${app.pinned}） · ${sizeText(app)} · ${referenceText}`;
      details.append(title,sub);
      if (!archived && refs.length) {
        const links=document.createElement("div");
        links.style.cssText="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px";
        for(const ref of refs) {
          const link=document.createElement("button");
          link.type="button";
          link.className="b3-button b3-button--outline";
          link.style.cssText="font-size:12px;height:auto;min-height:27px;padding:3px 8px;max-width:100%;overflow-wrap:anywhere";
          const readable=labels[ref.blockId];
          const target=readable?.title || "数据库块 · "+ref.blockId.slice(-7);
          link.textContent=target + (ref.mode==="custom"?" · 自定义视图":" · "+(ref.mode==="table"?"表格":ref.mode));
          link.title=[readable?.path,ref.blockId,ref.viewId].filter(Boolean).join("\n");
          link.setAttribute("aria-label","打开数据库块："+target);
          link.onclick=()=>void (async()=>{
            link.disabled=true;
            try {await openAppDatabaseBlock(ref);}
            catch(error) {showMessage("打开数据库块失败："+String(error),5000,"error");}
            finally {link.disabled=false;}
          })();
          links.append(link);
        }
        details.append(links);
      }
      const actions=document.createElement("div");
      actions.style.cssText="display:flex;align-items:center;gap:6px;flex-wrap:wrap";
      if(archived) {
        actions.append(makeButton("恢复",async()=>{await restoreCustomAppFromTrash(app.appId);await refresh();}));
        actions.append(makeButton("彻底删除",async()=>{
          if(window.prompt("永久删除不可恢复。请输入完整 App ID 确认：","")!==app.appId)return;
          await purgeCustomAppFromTrash(app.appId);await refresh();
        },true));
      } else if(!app.error && referenceScan && !referenceError) {
        if(!refs.length) actions.append(makeButton("移入回收站",async()=>{
          if(!window.confirm(`确认回收 ${app.appId}？\n此应用在当前 SQL 索引中未发现引用。关闭的笔记本可能不在索引中；请确认不用后再回收。此操作可以在回收站恢复。`))return;
          await moveUnusedCustomAppToTrash(app.appId);await refresh();
        },true));
        else if(!live && !refs.some(ref=>ref.mode==="unknown")) actions.append(
          makeButton("解除保留关联",async()=>{
            if(!window.confirm(`应用仍在 ${held} 个非自定义模式的数据库视图中保留配置。解除关联后，下次启用 AI 自定义将新建 App；原 HTML 会保留。确认解除吗？`))return;
            await detachInactiveCustomAppReferences(app.appId);await refresh();
          }));
      }
      row.append(details,actions);return row;
    };
    if(!apps.length) appsHost.textContent="没有已保存的 HTML 应用。";
    else apps.forEach(app=>appsHost.append(buildRow(app,false)));
    if(!trash.length) trashHost.textContent="回收站为空。";
    else trash.forEach(app=>trashHost.append(buildRow(app,true)));
    const purge=find<HTMLButtonElement>("purge");
    purge.disabled=!trash.length || !!referenceError;
    purge.onclick=()=>void (async()=>{
      if(!trash.length || window.prompt(`永久删除回收站的 ${trash.length} 个 App，不能撤销。请输入「永久删除」确认：`,"")!=="永久删除")return;
      purge.disabled=true;
      let count=0;
      try{
        for(const item of trash){await purgeCustomAppFromTrash(item.appId);count++;}
        notice(`已永久删除 ${count} 个回收站 App`);
        await refresh();
      }catch(error){
        notice(`已删除 ${count} 个；后续清理失败：${error instanceof Error?error.message:String(error)}`);
        await refresh();
      }finally{purge.disabled=false;}
    })();

    find<HTMLButtonElement>("apply").onclick=()=>void (async()=>{
      const next=Number(options.value);
      if(!HISTORY_LIMIT_OPTIONS.includes(next as typeof HISTORY_LIMIT_OPTIONS[number]))return;
      const removable=apps.reduce((sum,item)=>
        sum+Math.max(0,item.versions-item.pinned-next),0);
      if(removable>0 && !window.confirm(`应用新上限后，将永久清理约 ${removable} 份未固定的历史快照；当前 HTML 和固定版本不会删除。确定吗？`))return;
      const button=find<HTMLButtonElement>("apply");
      button.disabled=true;
      try{
        await setCustomHistoryLimit(next);
        let deleted=0;
        for(const app of apps) if(!app.error)
          deleted+=await pruneCustomAppVersions(app.appId);
        notice(`已设置保留上限 ${next} 份，清理历史版本 ${deleted} 份`);
        await refresh();
      }catch(error){notice("保存版本上限或清理失败："+String(error));}
      finally{button.disabled=false;}
    })();
  };
  find<HTMLButtonElement>("refresh").onclick=()=>void refresh()
    .catch(error=>{notice("刷新失败："+String(error));});
  void refresh().catch(error=>{notice("加载管理器失败："+String(error));});
  return () => {
    ++refreshSequence;
    container.replaceChildren();
  };
}
