import assert from 'node:assert/strict';
import { build } from 'esbuild';
const load=async entry=>{
  const out=await build({entryPoints:[entry],bundle:true,format:'esm',write:false,platform:'node',logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const { mapPositions }=await load('src/lets-excalidraw/app/mindmap/layout.ts');
const {mindData, rootFor, childrenOf, descendantsOf}=await load('src/lets-excalidraw/app/mindmap/model.ts');
const node=(id,parentId,x,y,width=160,height=52,side='right',order=0,extra={})=>({
  id,type:'rectangle',x,y,width,height,isDeleted:false,containerId:null,
  customData:{dodoMind:{mapId:'map-test',parentId,order,side,...extra}}
});
const root=node('root',null,350,300,200,64,'right',0,{direction:'right'});
const a=node('a','root',0,0,180,52,'right',0),b=node('b','root',0,0,130,60,'right',1);
const c=node('c','a',0,0,240,52,'right',0),d=node('d','a',0,0,90,52,'right',1);
let all=[root,a,b,c,d];
assert.equal(rootFor(all,'c').id,'root');
assert.deepEqual(childrenOf(all,'root').map(e=>e.id),['a','b']);
assert.deepEqual(descendantsOf(all,'root').map(e=>e.id),['a','c','d','b']);
let pos=mapPositions(all,root);
assert.equal(pos.size,4);
assert.equal(pos.get('a').x,root.x+root.width+86);
assert.equal(pos.get('c').x,pos.get('a').x+a.width+86);
assert.ok(pos.get('b').y>=pos.get('a').y+a.height,'nested siblings do not overlap');
assert.ok(pos.get('d').y>=pos.get('c').y+c.height+22,'subtree children have consistent gap');
const both={...root,customData:{dodoMind:{...mindData(root),direction:'both'}}};
all=[both,{...a,customData:{dodoMind:{...mindData(a),side:'left'}}},b,c,d];
pos=mapPositions(all,both);
assert.ok(pos.get('a').x+a.width < root.x,'left half goes to left');
assert.ok(pos.get('b').x > root.x+root.width,'right half goes to right');
const down={...root,customData:{dodoMind:{...mindData(root),direction:'down'}}};
all=[down,{...a,customData:{dodoMind:{...mindData(a),side:'down'}}},
  {...b,customData:{dodoMind:{...mindData(b),side:'down'}}},c,d];
pos=mapPositions(all,down);
assert.equal(pos.get('a').y,root.y+root.height+76);
assert.equal(pos.get('c').y,pos.get('a').y+Math.max(a.height,b.height)+76, 'next depth reserves the tallest rectangle of the preceding level');
assert.ok(pos.get('b').x>pos.get('a').x+a.width);
// Malformed cycles and missing ancestors must not hang the data parser.
const broken=[node('x','y',0,0),node('y','x',30,0)];
assert.equal(rootFor(broken,'x'),null);
assert.ok(descendantsOf(broken,'x').length<=2);
// Nodes from different independent maps must not leak into this tree.
const foreign={...node('foreign',null,0,0),customData:{dodoMind:{mapId:'else',parentId:null,order:0,side:'right'}}};
assert.equal(rootFor([...all,foreign],'foreign').id,'foreign');
// Geometry and stability tests for the d3-hierarchy implementation.
// Non-uniform rectangles are common when text editing auto-sizes a topic.
const fixtures=[];
let state=2234;
const random=()=>((state=(1664525*state+1013904223)>>>0)/4294967296);
for(const direction of ['right','left','both','down']){
  const main=node('r'+direction,null,137,229,236,82,'right',0,{direction});
  const nodes=[main],depths=new Map([[main.id,0]]);
  for(let k=0;k<110;k++){
    const candidates=nodes.filter(n=>depths.get(n.id)<5);
    const parent=candidates[Math.floor(random()*candidates.length)];
    const siblings=nodes.filter(n=>n.customData.dodoMind.parentId===parent.id);
    const id=direction+'-'+k;
    const width=45+Math.floor(random()*300),height=29+Math.floor(random()*135);
    const side=direction==='both'?(parent.id===main.id?(k%2?'left':'right'):parent.customData.dodoMind.side):direction;
    const child=node(id,parent.id,0,0,width,height,side,siblings.length);
    nodes.push(child);depths.set(id,depths.get(parent.id)+1);
  }
  const run1=mapPositions(nodes,main),run2=mapPositions(nodes,main);
  assert.deepEqual([...run1],[...run2],direction+' layout must be deterministic');
  assert.equal(run1.size,nodes.length-1,direction+' must layout all reachable nodes');
  for(const n of nodes.slice(1)){
    const p=run1.get(n.id);
    assert.ok(p&&Number.isFinite(p.x)&&Number.isFinite(p.y),n.id+' invalid coordinate');
    const side=direction==='both'?n.customData.dodoMind.side:direction;
    const parent=nodes.find(x=>x.id===n.customData.dodoMind.parentId);
    const pp=parent.id===main.id?{x:main.x,y:main.y}:run1.get(parent.id);
    const gap=side==='down'?p.y-(pp.y+parent.height):side==='right'?p.x-(pp.x+parent.width):pp.x-(p.x+n.width);
    assert.ok(gap>=75-1e-5,`${direction} ${n.id}: descendant overlaps predecessor, gap=${gap}`);
  }
  // Every node at the same depth and side must have non-overlapping cross-axis
  // spans. Different levels are separated by column/row max extents above.
  const groups=new Map();
  for(const n of nodes.slice(1)){
    const side=direction==='both'?n.customData.dodoMind.side:direction;
    const key=side+':'+depths.get(n.id);
    const group=groups.get(key)||[];
    const p=run1.get(n.id),start=side==='down'?p.x:p.y,
      extent=side==='down'?n.width:n.height;
    group.push({id:n.id,start,end:start+extent});groups.set(key,group);
  }
  for(const [key,group] of groups){
    group.sort((a,b)=>a.start-b.start);
    for(let j=1;j<group.length;j++)assert.ok(group[j].start>=group[j-1].end+8-1e-5,
      `${direction}:${key} overlap: ${group[j-1].id} & ${group[j].id}, gap=${group[j].start-group[j-1].end}`);
  }
  fixtures.push(`${direction}:${nodes.length}`);
}
// Data belonging to another map must be invisible even if it claims a valid
// parent id. A corrupted cycle must not hang the d3 data adapter.
const outsider=node('stranger','root',0,0,600,210);
outsider.customData.dodoMind.mapId='other-map';
assert.deepEqual([...mapPositions([root,a,outsider],root).keys()],['a']);
const loop=[root,a,{...node('cycle-a','cycle-b',0,0),customData:{dodoMind:{mapId:'map-test',parentId:'cycle-b',order:0,side:'right'}}},
  {...node('cycle-b','cycle-a',0,0),customData:{dodoMind:{mapId:'map-test',parentId:'cycle-a',order:0,side:'right'}}}];
assert.equal(mapPositions(loop,root).size,1);
console.log('PASS: d3-hierarchy variable-size geometry, deep subtree clearance, stable reruns, map isolation:',fixtures.join(', '));
// Rectangle-based drag target resolver (independent of the mouse grab location).
const {resolveMindDrop}=await load('src/lets-excalidraw/app/mindmap/drop-target.ts');
const dragRoot=node('drag-root',null,100,115,180,62,'right',0,{direction:'right'});
const first=node('first','drag-root',370,75,150,52,'right',0);
const middle=node('middle','drag-root',370,150,150,52,'right',1);
const last=node('last','drag-root',370,230,150,52,'right',2);
const grand=node('grand','middle',620,150,140,52,'right',0);
const dragNodes=[dragRoot,first,middle,last,grand];
const hint=(source,point,els=dragNodes)=> {
  const n=els.find(e=>e.id===source);
  return resolveMindDrop(els,source,{x:point.x-n.width/2,y:point.y-n.height/2,width:n.width,height:n.height});
};
const equalsHint=(actual,mode,target,kind)=>{
  assert.ok(actual,`missing ${kind} drop for ${target}`);
  assert.equal(actual.operation.mode,mode);
  assert.equal(actual.operation.targetId,target);
  assert.equal(actual.kind,kind);
};
equalsHint(hint('first',{x:400,y:177}),'child','middle','direct');
// A moved rectangle overlapping the target must work even when the mouse
// grabs its left or right edge and sits completely OUTSIDE the target.
const rectangleAt=(x,y)=>({x,y,width:first.width,height:first.height});
for (const movedRect of [rectangleAt(275,150),rectangleAt(465,150)]) {
  const result=resolveMindDrop(dragNodes,'first',movedRect);
  equalsHint(result,'child','middle','direct');
}

equalsHint(hint('first',{x:396,y:217}),'before','last','sibling');
equalsHint(hint('last',{x:396,y:138}),'after','first','sibling'); // same insertion slot as before middle
equalsHint(hint('first',{x:395,y:149},[dragRoot,first]),'child','drag-root','branch');
equalsHint(hint('first',{x:620,y:175},[dragRoot,first,middle]),'child','middle','branch');
assert.equal(hint('first',{x:1500,y:1500}),null,'far blank canvas must keep free drag');
assert.equal(hint('drag-root',{x:420,y:176}),null,'root must not be reparented');
assert.equal(hint('middle',{x:655,y:175}),null,'cannot reparent a node under its descendant');
const hidden={...middle,customData:{dodoMind:{...middle.customData.dodoMind,collapsedElements:[node('hidden','middle',0,0)]}}};
assert.notEqual(hint('first',{x:450,y:176},[dragRoot,first,hidden,last,grand])?.operation.targetId,'middle',
  'folded nodes cannot become visible child targets');
const other={...node('other',null,420,176),customData:{dodoMind:{mapId:'other-map',parentId:null,order:0,side:'right'}}};
assert.equal(hint('first',{x:450,y:176},[...dragNodes,other])?.operation.targetId,'middle',
  'cannot move a branch across independent mind maps');
const bilateral={...dragRoot,customData:{dodoMind:{...dragRoot.customData.dodoMind,direction:'both'}}};
assert.equal(hint('first',{x:62,y:150},[bilateral,first,middle,last])?.operation.side,'left',
  'dropping into the root left branch switches sides');
const downRoot={...dragRoot,customData:{dodoMind:{...dragRoot.customData.dodoMind,direction:'down',side:'down'}}};
const downA={...first,x:110,y:330,customData:{dodoMind:{...first.customData.dodoMind,side:'down'}}};
const downB={...middle,x:310,y:330,customData:{dodoMind:{...middle.customData.dodoMind,side:'down'}}};
equalsHint(hint('first',{x:291,y:346},[downRoot,downA,downB]),'before','middle','sibling');
console.log('PASS: rectangle-overlap and grip-independent targets; whitespace node reorder, whitespace sibling insert, down-axis, root side change, invalid target exclusion');
console.log('PASS: native mind-map tree schema, left/right/both/down pure layout, variable sizing, cycles and map isolation');
