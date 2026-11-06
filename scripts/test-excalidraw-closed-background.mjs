import assert from "node:assert/strict";
import { build } from "esbuild";

const compiled=await build({
  entryPoints:["src/lets-excalidraw/app/tools/closed-path.ts"],
  bundle:true,write:false,platform:"node",format:"esm",logLevel:"silent"
});
const {isFillableClosedPath}=await import("data:text/javascript;base64,"+
  Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const triangle=[[0,0],[120,0],[40,95],[0,0]];
const shape=(type,points,extras={})=>({type,points,...extras});
for(const type of ["line","freedraw"]) {
  assert(isFillableClosedPath(shape(type,triangle)),type+" closed path");
  assert(isFillableClosedPath(shape(type,[[0,0],[120,0],[40,95],[5,3]])),
    type+" native near-loop");
  assert(!isFillableClosedPath(shape(type,[[0,0],[120,0],[40,95],[12,15]])),
    type+" open path");
  assert(!isFillableClosedPath(shape(type,[[0,0],[100,0],[0,0]])),
    type+" two unique vertices");
  assert(!isFillableClosedPath(shape(type,[[0,0],[100,0],[100,0],[0,0]])),
    type+" degenerate repeated vertex");
  assert(!isFillableClosedPath(shape(type,[[0,0],[100,0],[NaN,70],[0,0]])),
    type+" invalid coordinate");
}
assert(!isFillableClosedPath(shape("arrow",triangle)), "arrows never receive background");
assert(!isFillableClosedPath(shape("image",triangle)), "images never receive background");
assert(!isFillableClosedPath(shape("line",[[0,0],[10,50],[60,100]],{polygon:true})),
  "the polygon flag alone must not imply visible fill");
console.log("PASS: closed freeform line/freedraw fill eligibility, near-loop tolerance, open/degenerate/arrow exclusion");
