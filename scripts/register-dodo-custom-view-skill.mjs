/**
 * Optional immediate installation for a running local SiYuan workspace.
 * The plugin itself performs the same managed registration during onload.
 * No database or user-authored HTML is read or modified.
 */
import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const origin = "http://127.0.0.1:6806";
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (typeof url !== "string" || !url.startsWith("/api/file/"))
    throw new Error("Skill installer only accepts SiYuan file APIs");
  return nativeFetch(origin + url, options);
};
await build({
  entryPoints: ["src/lets-excalidraw/libs/skill-runtime.ts"],
  outfile: "tmp/dodo-custom-skill-runtime.mjs",
  bundle: true, platform: "node", format: "esm",
  define: { "process.env.DEV_MODE": '"false"' },
  logLevel: "silent",
});
const { createSiYuanSkillRuntime } =
  await import("../tmp/dodo-custom-skill-runtime.mjs");
const runtime = createSiYuanSkillRuntime({pluginName: "siyuan-dodo"});
const registered = await runtime.registerPluginSkill("skills/dodo-custom-view");
const expected = ["SKILL.md","references/runtime.md","references/design.md",
  "references/examples.md","references/checklist.md","references/themes.md",
  "references/builder.md","references/basecoat.md","references/web-awesome.md"];
if (registered.ok) {
  const loaded = await runtime.loadSkill("dodo-custom-view");
  if (!loaded.ok) throw new Error("Skill verification failed: " + loaded.code);
  for (const file of [...expected,".siyuan-plugin-skill.json"])
    if (!loaded.skill.files.some(item => item.path === file))
      throw new Error("Missing installed Skill file: " + file);
  console.log("PASS: dodo-custom-view installed with SiYuan Skill SDK:",registered.action);
} else if (registered.code === "PLUGIN_METADATA_INVALID" &&
  /Auth failed \[session\]/i.test(registered.error)) {
  // Node.js cannot share SiYuan's logged-in browser session. This explicit,
  // local-only repair command still uses the same ownership manifest format;
  // the plugin itself always uses the official SDK onload.
  const root = process.env.SIYUAN_DATA_DIR || join(homedir(),"SiYuan","data");
  const pluginsRoot = join(root,"plugins","siyuan-dodo");
  const source = join(pluginsRoot,"skills","dodo-custom-view");
  const skillsRoot = join(root,"storage","ai","agent","skills");
  const target = join(skillsRoot,"dodo-custom-view");
  const metadata = JSON.parse(await readFile(join(pluginsRoot,"plugin.json"),"utf8"));
  if (metadata.name !== "siyuan-dodo" || typeof metadata.version !== "string")
    throw new Error("Unexpected plugin metadata; refusing local Skill installation");
  const entries = await readdir(skillsRoot);
  if (entries.includes("dodo-custom-view")) {
    const manifest = JSON.parse(await readFile(join(target,".siyuan-plugin-skill.json"),"utf8"));
    if (manifest.managedBy !== "siyuan-skill-sdk" ||
      manifest.plugin?.name !== "siyuan-dodo" ||
      manifest.skill?.name !== "dodo-custom-view")
      throw new Error("Skill already exists but has a different owner; refusing overwrite");
    console.log("PASS: existing managed dodo-custom-view Skill; no files replaced");
  } else {
    const stage = join(skillsRoot,".dodo-custom-view.stage-"+process.pid);
    try {
      await mkdir(skillsRoot,{recursive:true});
      await cp(source,stage,{recursive:true,errorOnExist:true,force:false});
      const manifest = {schemaVersion:1,managedBy:"siyuan-skill-sdk",
        plugin:{name:metadata.name,version:metadata.version},
        skill:{name:"dodo-custom-view",source:"skills/dodo-custom-view"},
        syncedAt:new Date().toISOString()};
      await writeFile(join(stage,".siyuan-plugin-skill.json"),
        JSON.stringify(manifest,null,2)+"\n","utf8");
      await rename(stage,target);
    } finally {await rm(stage,{recursive:true,force:true});}
    for (const file of expected) {
      const digest = data => createHash("sha256").update(data).digest("hex");
      if (digest(await readFile(join(source,file))) !== digest(await readFile(join(target,file))))
        throw new Error("Installed Skill file mismatch: " + file);
    }
    console.log("PASS: dodo-custom-view installed into Agent Skill directory (local authenticated-session fallback)");
  }
} else {
  throw new Error("Skill registration failed: " + registered.code + " " + registered.error);
}
