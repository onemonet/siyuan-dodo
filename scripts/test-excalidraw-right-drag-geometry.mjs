import assert from "node:assert/strict";
import {build} from "esbuild";
const out=await build({entryPoints:["src/lets-excalidraw/app/interactions/right-drag-geometry.ts"],
  bundle:true,write:false,format:"esm",platform:"node",logLevel:"silent"});
const {segmentDistance,sweepIntersectsRect,sweepIntersectsElement,linearElementPoints}=await import(
  "data:text/javascript;base64,"+Buffer.from(out.outputFiles[0].text).toString("base64"));
const pt=(x,y)=>({x,y});
const line=(points,type="arrow",extra={})=>({
  type, x:points[0][0],y:points[0][1],
  width:points.at(-1)[0]-points[0][0],height:points.at(-1)[1]-points[0][1],
  points:points.map(([x,y])=>[x-points[0][0],y-points[0][1]]),
  strokeWidth:2,angle:0,...extra});
const purple=line([[175,420],[560,115]]);
const redParallel=[pt(180,515),pt(635,175)];
assert(sweepIntersectsRect(...redParallel,{x:purple.x,y:purple.y,width:purple.width,height:purple.height}),
  "existing bounding-box test must reproduce false parallel hit");
assert(!sweepIntersectsElement(...redParallel,purple,1),
  "parallel (screenshot 1): red sweep must not select purple arrow");
const redCross=[pt(200,155),pt(550,395)];
assert(sweepIntersectsElement(...redCross,purple,1),
  "crossing (screenshot 2): red sweep must hit actual purple line segment");
for(const type of ["line","arrow","freedraw"]){
  assert(!sweepIntersectsElement(...redParallel,{...purple,type},1),`${type} false positive`);
  assert(sweepIntersectsElement(...redCross,{...purple,type},1),`${type} true hit`);
}
assert.equal(segmentDistance(pt(0,0),pt(100,100),pt(0,100),pt(100,0)),0);
assert.equal(segmentDistance(pt(0,0),pt(100,0),pt(0,20),pt(100,20)),20);
assert.equal(segmentDistance(pt(0,0),pt(10,0),pt(20,0),pt(30,0)),10);
const multi=line([[0,0],[100,0],[100,100]]);
assert(sweepIntersectsElement(pt(95,50),pt(110,50),multi,1),
  "multi-segment hit on vertical second segment");
assert(!sweepIntersectsElement(pt(0,50),pt(80,50),multi,1),
  "multi-segment: cannot use diagonal bounding rectangle");
const rotated=line([[100,100],[200,100]],"line",{angle:Math.PI/2});
assert.deepEqual(linearElementPoints(rotated).map(p=>[Math.round(p.x),Math.round(p.y)]),
  [[150,50],[150,150]]);
assert(sweepIntersectsElement(pt(140,100),pt(180,100),rotated,1),
  "rotated linear element must collide at rendered orientation");
assert(!sweepIntersectsElement(pt(100,98),pt(120,98),rotated,1),
  "rotated element should not collide at unrotated position");
assert(sweepIntersectsElement(pt(100,50),pt(100,100),line([[100,100],[200,100]]),1),
  "shared endpoint contacts are valid");
assert(sweepIntersectsElement(pt(50,4),pt(150,4),line([[50,0],[150,0]]),1),
  "small stroke tolerance is allowed");
assert(!sweepIntersectsElement(pt(50,8),pt(150,8),line([[50,0],[150,0]]),1),
  "no broad false positives for visibly separated lines");
assert(sweepIntersectsElement(pt(50,8),pt(150,8),line([[50,0],[150,0]]),0.35),
  "screen pixel slop scales to scene coords at low zoom");
assert(sweepIntersectsElement(pt(-5,10),pt(105,10),{type:"rectangle",x:0,y:0,width:100,height:20},1),
  "filled rects retain swept-rectangle behavior");
assert(!sweepIntersectsElement(pt(-5,30),pt(105,30),{type:"rectangle",x:0,y:0,width:100,height:20},1));
console.log("PASS: screenshot parallel versus crossing, line/arrow/freedraw polyline, rotated angle, endpoint touch, zoom tolerance, shape fallback");


