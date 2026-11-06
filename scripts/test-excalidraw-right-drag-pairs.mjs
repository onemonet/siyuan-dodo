import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['src/lets-excalidraw/app/interactions/right-drag-pairs.ts'],
  bundle:true,format:'esm',platform:'node',write:false});
const mod=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const node=(id,type='rectangle')=>({id,type,width:100,height:50});
const a=node('a'),b=node('b'),c=node('c'),d=node('d');
const frame=node('frame','frame');
const text=node('text','text'); text.containerId='b';
const scene=[a,b,c,d,frame,text];
const ids=(...values)=>new Set(values);
const pairs=(start,end,selected)=>
  mod.connectionPairsForSelection(start,end,ids(...selected),scene)
    .map(({start,end})=>start.id+'->'+end.id);
assert.deepEqual(pairs(a,c,['a','b']),['a->c','b->c'], 'many-to-one');
assert.deepEqual(pairs(c,a,['a','b']),['c->a','c->b'], 'one-to-many');
assert.deepEqual(pairs(a,b,['a','b']),['a->b'], 'same selected group');
assert.deepEqual(pairs(a,b,[]),['a->b'], 'one-to-one');
assert.deepEqual(pairs(a,a,['a','b']),[],'same node must not self-connect');
assert.deepEqual(pairs(a,text,['b','text','c']),['a->b','a->c'], 'bound text dedupes parent');
assert.deepEqual(pairs(text,c,['b','text','a']),['a->c','b->c'], 'selected bound text is shape');
assert.deepEqual(pairs(frame,a,['frame','b']),[],'frames cannot be connected');
assert.deepEqual(pairs(a,frame,['a','b']),[],'frames cannot be targets');
assert.deepEqual(pairs(a,b,['a','frame']),['a->b'],'frames ignored in selected count');
assert.deepEqual(pairs(a,c,['a','b','a']),['a->c','b->c'],'duplicate ids do not duplicate pairs');
console.log('PASS: many-to-one, one-to-many, selected-to-selected fallback, bound text, frames and duplicates');
