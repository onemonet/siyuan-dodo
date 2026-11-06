import {createRequire} from "node:module";
import {resolve} from "node:path";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve("vite"));
const esbuild=viteRequire("esbuild");
const vendor=resolve("src/lets-database-view/gantt/vendor/frappe-1.2.2");
const target=resolve("src/lets-database-view/gantt/iframe/frappe-gantt.umd.js");
await esbuild.build({
  entryPoints:[resolve(vendor,"entry.js")],
  bundle:true,format:"iife",platform:"browser",target:"es2020",
  minify:true,legalComments:"none",outfile:target,
  logLevel:"silent",
});
const output=readFileSync(target,"utf8");
if(!output.includes("Gantt") || output.length<35000){
  throw Error("Frappe Gantt bundle is incomplete");
}
console.log("Built patched Frappe 1.2.2 from MIT sources ("+output.length+" bytes)");
