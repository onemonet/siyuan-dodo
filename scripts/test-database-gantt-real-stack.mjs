/* Frappe 1.2.2 browser bridge smoke. Deprecated DHTMLX fixture replaced. */
import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
const modes=[["0","week"],["15","day"]];
const provided=process.argv.slice(2);
const targets=provided.length?[provided]:modes;
for(const [step,zoom] of targets){
  const result=spawnSync(process.execPath,
    ["scripts/test-database-gantt-frappe-stack.mjs",step,zoom],
    {stdio:"inherit",timeout:90000,windowsHide:true});
  assert.equal(result.status,0,
    "Real Frappe drag/native AV integration failed: "+step+" "+zoom);
}
console.log("PASS: Frappe real-browser compatibility entrypoint");
