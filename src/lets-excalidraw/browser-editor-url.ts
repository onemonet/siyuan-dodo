/** Link an existing SiYuan Excalidraw attachment to the editor served by the SiYuan kernel (6806). */
export function browserEditorUrl(
  imageURL: string,
  pluginName: string,
  baseHref: string,
  options: Record<string, string | number | boolean | undefined> = {},
): string {
  if (!/^assets\/.+\.(?:svg|png)$/.test(imageURL) ||
      imageURL.split("/").some(part => part === "." || part === "..") ||
      /[?#\\]/.test(imageURL)) {
    throw new Error("无效的 Excalidraw 画板附件路径。");
  }
  const current = new URL(baseHref);
  const base = current.protocol === "http:" || current.protocol === "https:"
    ? current
    : new URL("http://127.0.0.1:6806/");
  // Use the kernel port, never the retired standalone port. Keep the current host
  // so a SiYuan browser session opened through a LAN IP can reuse that address.
  base.port = "6806";
  base.pathname = `/plugins/${encodeURIComponent(pluginName)}/excalidraw/app/`;
  base.search = "";
  base.hash = "";
  base.searchParams.set("imageURL", imageURL);
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) base.searchParams.set(key, String(value));
  }
  return base.href;
}
