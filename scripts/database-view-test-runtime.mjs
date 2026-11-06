import { build } from "esbuild";

/** Real shared runtime for the existing browser harnesses that extract methods. */
export async function databaseViewTestRuntime() {
  const result = await build({ stdin: { contents: `
    export { databaseViewHost, currentNativeView } from "./src/lets-database-view/core/view-host";
    export { ViewMountLifecycle } from "./src/lets-database-view/core/view-mount-lifecycle";
    export { visualMountPolicies } from "./src/lets-database-view/visual/visual-mount-policies";
    export { DATABASE_VIEW_DEFINITIONS, databaseViewDefinition } from "./src/lets-database-view/view-registry";
  `, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false,
    platform: "browser", format: "iife", globalName: "DodoViewRuntime", target: "es2022" });
  return result.outputFiles[0].text +
    "\nconst { databaseViewHost, currentNativeView, ViewMountLifecycle, visualMountPolicies, DATABASE_VIEW_DEFINITIONS, databaseViewDefinition } = DodoViewRuntime;\n";
}
