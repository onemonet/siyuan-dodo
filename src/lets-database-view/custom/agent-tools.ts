import type { Plugin } from "siyuan";
import { DatabaseViewConfigStore } from "../view-config-store";
import { currentNativeView } from "../core/view-host";
import { getCustomApp, saveCustomApp, listCustomVersions, restoreCustomVersion } from "./storage";
import { getCustomSchema, listCustomRecords, type CustomDatabaseContext } from "./data-service";
import { currentDatabaseTarget } from "./current-target";
import customViewGuide from "../../../skills/dodo-custom-view/SKILL.md?raw";
import runtimeGuide from "../../../skills/dodo-custom-view/references/runtime.md?raw";
import designGuide from "../../../skills/dodo-custom-view/references/design.md?raw";
import themesGuide from "../../../skills/dodo-custom-view/references/themes.md?raw";
import builderGuide from "../../../skills/dodo-custom-view/references/builder.md?raw";
import examplesGuide from "../../../skills/dodo-custom-view/references/examples.md?raw";
import checklistGuide from "../../../skills/dodo-custom-view/references/checklist.md?raw";
import basecoatGuide from "../../../skills/dodo-custom-view/references/basecoat.md?raw";
import webAwesomeGuide from "../../../skills/dodo-custom-view/references/web-awesome.md?raw";

const ID = /^\d{14}-[a-z0-9]{7}$/;
interface AppTarget extends CustomDatabaseContext { appId: string; viewName: string }

async function openedTargets(): Promise<AppTarget[]> {
  const found = new Map<string, AppTarget>();
  const avs = document.querySelectorAll<HTMLElement>(".av[data-av-id][data-node-id]");
  for (const av of Array.from(avs)) {
    if (!av.isConnected) continue;
    const blockId = av.dataset.nodeId || "", avID = av.dataset.avId || "";
    if (!ID.test(blockId) || !ID.test(avID)) continue;
    const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
    const currentViewId = header ? currentNativeView(header) : "";
    const entries = (await DatabaseViewConfigStore.load(blockId)).views;
    // Do not limit to the ACTIVE tab. A new native view may have been created
    // by Agent while SiYuan is still rendering the old tab. The explicit appId
    // is the stable identity for save_source/schema/records in that interval.
    for (const [viewId, entry] of Object.entries(entries)) {
      if (!ID.test(viewId) || entry.mode !== "custom" || !entry.configs.custom?.appId) continue;
      const appId = entry.configs.custom.appId;
      const tab = header?.querySelector<HTMLElement>(`.layout-tab-bar .item[data-id="${viewId}"]`);
      const viewName = tab?.textContent?.trim() ||
        (viewId === currentViewId ? header?.querySelector<HTMLElement>(
          ".layout-tab-bar .item--focus")?.textContent?.trim() : "") || "";
      const search = viewId === currentViewId
        ? header?.querySelector<HTMLElement>('[data-type="av-search"]')?.textContent?.trim() || ""
        : "";
      found.set(blockId + ":" + viewId, { appId, viewName, avID, blockId, viewId, search });
    }
  }
  return [...found.values()];
}

async function selectApp(appId: string): Promise<AppTarget> {
  const matches = (await openedTargets()).filter(item => item.appId === appId);
  if (matches.length !== 1) throw new Error("在当前打开的数据库中找不到唯一的自定义视图，请确认 appId 和数据库标签。");
  return matches[0];
}

const outputSchema = { type:"object",properties: {
  result:{type:"string"},structuredContent:{type:"object",additionalProperties:true},
  error:{type:"string"},
}, additionalProperties:true };

export function registerCustomViewAgentCapabilities(host: Plugin, active: () => boolean,
  changed: () => void,
  enableCurrentCustomView?: (blockId:string,viewId:string,avID:string)=>Promise<string>): boolean {
  const add = (host as any).addAgentCapability;
  if (typeof add !== "function") {
    console.warn("[Dodo 数据库自定义视图] 当前思源版本不支持 Agent 能力接口");
    return false;
  }
  const references = {
    runtime: runtimeGuide,
    design: designGuide,
    themes: themesGuide,
    builder: builderGuide,
    examples: examplesGuide,
    checklist: checklistGuide,
    basecoat: basecoatGuide,
    "web-awesome": webAwesomeGuide,
  } as const;
  // Keep the main Skill and its references accessible to SiYuan Agent even
  // when the host does not natively discover a plugin's skills/ directory.
  add.call(host, {
    name: "dodo-database.custom.read_me",
    title: "Dodo Custom View: Development Skill",
    description: "Read Dodo's HTML App Skill: native database SDK + two-pass frontend-design method, optional theme-factory palettes, optional web-artifacts-builder single-HTML bundling, real-data behavior and image choices (?style=thumb for cards; original for full-size). No-build local components via reference(basecoat|web-awesome); design via reference(design|themes|builder).",
    inputSchema: {type:"object",properties:{},additionalProperties:false},
    effects: {localRead:true},
    handler: async () => active() ? {result:customViewGuide} : {error:"数据库视图模块已关闭"},
  });
  add.call(host, {
    name: "dodo-database.custom.reference",
    title: "Dodo Custom View: On-demand Reference",
    description: "Load one Dodo HTML reference on demand: basecoat = default no-build styled HTML controls; web-awesome = optional no-build wa-* components; both use bundled local files. design = visual direction; themes = tokens; builder = complexity/build guidance; runtime = SDK/assets/ECharts; examples = patterns; checklist = QA. User's style and actual database always win.",
    inputSchema: {type:"object",properties:{topic:{
      type:"string",enum:["runtime","design","themes","builder","examples","checklist","basecoat","web-awesome"],
      description:"Use basecoat for ordinary HTML controls (default), web-awesome for wa-* components, runtime for data, design/themes for styling, builder for complexity. Load only the reference needed.",
    }},required:["topic"],additionalProperties:false},
    effects: {localRead:true},
    handler: async (args: {topic?: string}={}) => {
      if (!active()) return {error:"数据库视图模块已关闭"};
      if (!args || !Object.prototype.hasOwnProperty.call(references,args.topic||""))
        return {error:"topic 必须是 runtime、design、themes、builder、examples、checklist、basecoat、web-awesome 之一。"};
      return {result:references[args.topic as keyof typeof references]};
    },
  });
  const register = (
    name:string,title:string,description:string,
    inputSchema:Record<string,unknown>,
    perform:(args:Record<string,any>)=>Promise<unknown>,
    write=false,
  ) => {
    add.call(host, {
      name:"dodo-database.custom."+name,title,description,
      inputSchema,outputSchema,effects:write?{localWrite:true}:{localRead:true},
      handler:async (args:Record<string,any>={}) => {
        if (!active()) return {error:"数据库视图模块已关闭"};
        try {
          const result = await perform(args);
          return { result: JSON.stringify(result), structuredContent: { data:result } };
        } catch(error) { return {error:error instanceof Error?error.message:String(error)}; }
      },
    });
  };
  const appProps={appId:{type:"string",description:"From custom.list; identifies one opened HTML app."}};
  const single={type:"object",properties:appProps,required:["appId"],additionalProperties:false};
  const readCurrent = async (args: Record<string,unknown> = {},
    explicitTarget?: ReturnType<typeof currentDatabaseTarget>) => {
    const target = explicitTarget || currentDatabaseTarget();
    const entry = (await DatabaseViewConfigStore.load(target.blockId)).views[target.viewId];
    const mode = entry?.mode || "table";
    const sampleCount = Number.isInteger(args.pageSize)
      ? Math.max(1,Math.min(100,Number(args.pageSize))) : 20;
    const [schema, page] = await Promise.all([
      getCustomSchema(target),
      listCustomRecords(target, {page:1}),
    ]);
    const details: Record<string,unknown> = {
      ...schema, mode, viewName:target.viewName || schema.name,
      total:page.total, records:page.records.slice(0,sampleCount), page:page.page,
      pageSize:schema.pageSize, batchSize:page.pageSize,
      all:schema.all, sampleCount, canCreateCustomView: mode !== "custom",
    };
    const appId = entry?.configs?.custom?.appId;
    if (mode === "custom" && appId) {
      const app = await getCustomApp(appId);
      Object.assign(details, {appId,html:app.html,version:app.manifest.version,
        allowWrites:entry.configs.custom?.allowWrites === true});
    } else if (mode === "custom") {
      throw new Error("当前自定义视图缺少 HTML 应用引用，请先检查视图设置。");
    }
    // If the user switched to another DB while the read was in flight,
    // return no potentially stale editing target.
    const now = currentDatabaseTarget();
    if (now.blockId !== target.blockId || now.avID !== target.avID ||
        (!explicitTarget && now.viewId !== target.viewId))
      throw new Error("读取过程中目标数据库发生切换，请重试 current。");
    return details;
  };
  register("current","Dodo: Current Open Database View",
    "FIRST TOOL for dodo-custom-view: automatically resolve the user's active/last-focused SiYuan AV table or HTML view, including its schema, representative records, and, if custom, existing appId, source HTML and version. No IDs or repeated user explanation needed. Ambiguous split panes reject instead of guessing.",
    {type:"object",properties:{pageSize:{type:"integer",minimum:1,maximum:100,
      description:"Only limits returned sample rows (default 20); does NOT change the native AV view's pageSize."}},
      additionalProperties:false},readCurrent);
  register("create","Dodo: Create a Separate Custom HTML View",
    "Create a NEW native SiYuan table view tab and attach an independent Dodo HTML app WITHOUT changing the active source view's type or configuration. The new tab becomes selected by SiYuan. If the active view is already Dodo custom, reuse its existing appId and edit it instead. Returns the created viewId/appId/HTML/version for save_source. Never convert a native/other Dodo view in place.",
    {type:"object",properties:{blockId:{type:"string"},viewId:{type:"string"},
      avID:{type:"string"}},required:["blockId","viewId","avID"],additionalProperties:false},
    async args => {
      if (!enableCurrentCustomView) throw new Error("当前插件尚未接入 Agent 视图创建功能。");
      const target = currentDatabaseTarget();
      if (target.blockId !== args.blockId || target.viewId !== args.viewId ||
          target.avID !== args.avID)
        throw new Error("数据库已切换。请重新调用 current 获取当前目标，避免创建到错误的视图。");
      const original = (await DatabaseViewConfigStore.load(target.blockId)).views[target.viewId];
      // Any non-custom Dodo view can serve as a source: never mutate it.
      const newViewId = await enableCurrentCustomView(target.blockId,target.viewId,target.avID);
      const details = await readCurrent({}, {
        ...target, viewId: newViewId,
        viewName: newViewId === target.viewId ? target.viewName : "AI 自定义视图",
        search: newViewId === target.viewId ? target.search : "",
      });
      if (newViewId !== target.viewId) Object.assign(details, {
        createdViewId: newViewId, sourceViewId: target.viewId, sourceMode: original?.mode || "table",
        createdNewView: true,
      });
      return details;
    },true);
  register("list","Dodo: List Custom HTML Views",
    "List HTML custom views belonging to currently opened databases (including tabs not currently selected). Use current for the active source. Optional Skill guide: dodo-database.custom.read_me.",
    {type:"object",properties:{},additionalProperties:false},
    () => openedTargets());
  register("schema","Dodo: Custom View Database Schema",
    "Return the fields/keyIDs, types, identity and native pageSize ('条目数') of this HTML view's current SiYuan database. Native pageSize is the sole batch-size setting.",
    single,async args => getCustomSchema(await selectApp(args.appId)));
  register("records","Dodo: Custom View Records",
    "Read native AV records by page, following the view's native filter/search and its saved pageSize ('条目数'). HTML-supplied pageSize is ignored; '全部' is chunked internally to 100. In HTML prefer dodoDB.createPaginator(). mAsset images use ?style=thumb for cards and the original URL for enlargement.",
    {type:"object",properties:{...appProps,page:{type:"integer",minimum:1},
      pageSize:{type:"integer",minimum:1,maximum:100,
        description:"Legacy compatibility only; ignored. Batch size always follows the current native view's '条目数'."}},
      required:["appId"],additionalProperties:false},
    async args => listCustomRecords(await selectApp(args.appId),args));
  register("get_source","Dodo: Read Custom HTML",
    "Read the HTML source, current revision and storage path. Use the version when saving.",
    single,async args => {
      const target=await selectApp(args.appId);
      const app=await getCustomApp(target.appId);
      return {appId:target.appId,version:app.manifest.version,html:app.html,
        path:"/data/storage/petal/siyuan-dodo/custom-views/"+target.appId+"/index.html"};
    });
  register("save_source","Dodo: Save Custom HTML",
    "Replace HTML source with Agent-written HTML; recoverable revision with expectedVersion. Design via reference(design|themes), optional React bundle via reference(builder). IMPORTANT: data pages must use dodoDB.createPaginator() with the current native AV '条目数' as the only batch setting; don't hardcode pageSize or duplicate on refresh. UNSANDBOXED SiYuan same-origin code: review scripts. ?style=thumb for cards and original URL for large images.",
    {type:"object",properties:{...appProps,expectedVersion:{type:"integer",minimum:1},
      html:{type:"string",description:"Complete trusted same-origin HTML with CSS/JS and intentionally selected theme/layout. Optional compiled React/Tailwind/shadcn code must be bundled into this HTML, no external build runtime. Prefer window.dodoDB for AV records and permissions; render mAsset thumbnails with ?style=thumb, full image without it. Review scripts; iframe has no sandbox."}},
      required:["appId","expectedVersion","html"],additionalProperties:false},
    async args => {
      await selectApp(args.appId);
      const manifest=await saveCustomApp(args.appId,args.html,args.expectedVersion);
      changed();
      return {appId:args.appId,saved:true,version:manifest.version};
    },true);
  register("versions","Dodo: HTML History",
    "Read available historical HTML snapshots for this custom view.",
    single,async args => {
      await selectApp(args.appId);return listCustomVersions(args.appId);
    });
  register("restore","Dodo: Restore HTML Revision",
    "Restore a version snapshot; snapshots the current source before restoring. Destructive to the current HTML and requires explicit user request.",
    {type:"object",properties:{...appProps,filename:{type:"string"},
      expectedVersion:{type:"integer",minimum:1}},required:["appId","filename","expectedVersion"],
      additionalProperties:false},
    async args => {
      await selectApp(args.appId);
      const manifest=await restoreCustomVersion(args.appId,args.filename,args.expectedVersion);
      changed();return {appId:args.appId,version:manifest.version,restored:true};
    },true);
  return true;
}
