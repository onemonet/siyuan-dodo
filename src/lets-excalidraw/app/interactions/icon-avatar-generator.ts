import { createAvatar } from "@dicebear/core";
import * as openPeeps from "@dicebear/open-peeps";
import type { IconCatalog } from "./icon-library-data";

export const avatarStyles = [
  { id: "open-peeps", label: "Open Peeps", license: "CC0" },
  { id: "notionists", label: "Notionists", license: "CC0" },
  { id: "pixel-art", label: "Pixel Art", license: "CC0" },
  { id: "lorelei", label: "Lorelei", license: "CC0" },
  { id: "pixelbot", label: "Pixelbot", license: "CC0" },
] as const;
export type AvatarStyleId = typeof avatarStyles[number]["id"];
const normalizedSeed = (seed: string) => seed.trim().slice(0, 80);
export const avatarName = (index: number) => "avatar-" + String(index + 1).padStart(2,"0");

// Preserve the v9 Open Peeps renderer for previously saved avatars. DiceBear
// v10 changed the rendering API and definitions; its 4 new styles load lazily.
const renderers: Partial<Record<AvatarStyleId,(seed:string)=>string>> = {
  "open-peeps": seed => createAvatar(openPeeps,{seed}).toString(),
};
const loading = new Map<AvatarStyleId,Promise<void>>();
export async function prepareAvatarStyle(style:AvatarStyleId):Promise<void> {
  if(renderers[style])return;
  let task=loading.get(style);
  if(!task) {
    task=import("./dicebear-modern-avatar").then(async module=>{
      if(style==="open-peeps")return;
      renderers[style]=await module.createModernAvatarRenderer(style);
    }).catch(error=>{loading.delete(style);throw error;});
    loading.set(style,task);
  }
  await task;
}
export function generateAvatar(catalog:IconCatalog, seed:string,
  style:AvatarStyleId="open-peeps"):IconCatalog {
  const name=normalizedSeed(seed);
  if(!name)throw new Error("请输入头像种子。");
  const renderer=renderers[style];
  if(!renderer)throw new Error("头像风格尚未加载，请稍后再试。");
  const svg=renderer(name);
  return {...catalog,icons:{...catalog.icons,[name]:{svg}}};
}
export async function makeAvatarCatalog(style:AvatarStyleId="open-peeps"):Promise<IconCatalog> {
  await prepareAvatarStyle(style);
  let catalog:IconCatalog={icons:{}};
  for(let index=0;index<36;index++){
    catalog=generateAvatar(catalog,avatarName(index),style);
  }
  return catalog;
}
