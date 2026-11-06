import React from "react";
import { FilePenLine } from "lucide-react";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";
import { commitElements, randomNonce } from "./scene-commands";
import { convertSvgToNative, isEditableSvgImage, svgImageToText } from "./svg-to-editable";

export async function editSelectedSvg(context:SelectionContext):Promise<boolean>{
  const selection=context.elements;
  if(selection.length!==1 || !isEditableSvgImage(context.api,selection[0]))return false;
  const image=selection[0];
  const content=await svgImageToText(context.api,image);
  const converted=await convertSvgToNative(content,image);
  if(!converted.length)return false;
  // Async conversion must not overwrite work if the image was changed or
  // the selection moved to another object while the converter loaded.
  const current=context.api.getSceneElementsIncludingDeleted();
  const index=current.findIndex((el:any)=>el.id===image.id);
  if(index<0 || current[index].isDeleted || current[index].version!==image.version ||
    !context.api.getAppState().selectedElementIds?.[image.id])
    throw new Error("SVG 在转换过程中发生变化，已取消操作。");
  const tombstone={...current[index],isDeleted:true,version:(image.version||0)+1,
    versionNonce:randomNonce(),updated:Date.now()};
  const next=[...current.slice(0,index),tombstone,...converted,...current.slice(index+1)];
  // Original file remains in Excalidraw's file store and undo history.
  commitElements({...context,appState:context.api.getAppState()},next,converted);
  return true;
}

const tool:ToolbarTool={
  id:"edit-svg",label:"编辑 SVG",icon:<FilePenLine size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when:context=>context.elements.length===1&&isEditableSvgImage(context.api,context.elements[0]),
  run:async context=>{await editSelectedSvg(context);},
};
export default tool;
