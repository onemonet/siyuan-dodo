/** SimpleMindMap is imported only when the experimental editor opens. */
import MindMap from "simple-mind-map";
import Export from "simple-mind-map/src/plugins/Export.js";

MindMap.usePlugin(Export);

export type ProofMap = any;
export function initialData(){
  return {data:{text:"中心主题",expand:true},children:[
    {data:{text:"分支主题",expand:true},children:[{data:{text:"子主题"},children:[]}]},
    {data:{text:"第二分支",expand:true},children:[]}
  ]};
}
export function startProofMap(container: HTMLElement, full: any | null): ProofMap {
  return new MindMap({
    el:container, data:full?.root||initialData(),
    layout:full?.layout||"logicalStructure",theme:full?.theme?.template||"default",
    themeConfig:full?.theme?.config||{},viewData:full?.view||null,
    enableFreeDrag:false,exportPaddingX:22,exportPaddingY:22,
    // Static proof: styles and fonts remain local to the plugin.
  } as any);
}
export async function snapshotProofMap(map: ProofMap) {
  const data=JSON.parse(JSON.stringify(map.getData(true)));
  const dataURL:string=await map.export("svg",false,"思维导图");
  if (!dataURL?.startsWith("data:image/svg+xml")) throw new Error("SimpleMindMap SVG 导出失败");
  const response=await fetch(dataURL);
  const svg=await response.text();
  return {svg,data};
}
