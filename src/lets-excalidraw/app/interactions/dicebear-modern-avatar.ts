import { Avatar, Style } from "@dicebear/core-modern";
import type { AvatarStyleId } from "./icon-avatar-generator";

/** DiceBear v10 styles are JSON definitions. Import only the requested one
 * so Pixelbot/Notionists assets never bloat the main Excalidraw bundle.
 */
export async function createModernAvatarRenderer(style: Exclude<AvatarStyleId, "open-peeps">):
  Promise<(seed:string)=>string> {
  const definitions = {
    notionists: () => import("@dicebear/styles/notionists.json"),
    "pixel-art": () => import("@dicebear/styles/pixel-art.json"),
    lorelei: () => import("@dicebear/styles/lorelei.json"),
    pixelbot: () => import("@dicebear/styles/pixelbot.json"),
  };
  const definition = (await definitions[style]()).default;
  const compiled = new Style(definition);
  return (seed: string) => new Avatar(compiled, { seed }).toString();
}
