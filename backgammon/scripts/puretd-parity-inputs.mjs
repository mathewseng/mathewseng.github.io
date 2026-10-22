// SPDX-License-Identifier: GPL-3.0-or-later
// Geometry-only fixtures: historical GNU rollout equities are deliberately unused.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initialState, legalTurns, assertState} from '../core/rules.mjs';
import {normalizeReference} from './deep-book-comparison.mjs';
import {stateForBoard} from './book-branches.mjs';
const read = file => fs.readFileSync(new URL('../'+file,import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reference=read('docs/deep-book-xg-reference.json'), corpus=read('data/accuracy-reference.json');
const rules={cube:true,jacoby:true,automaticDoubles:0,immediateRedoubles:0};
const mirror=s=>({...structuredClone(s),points:[...s.points].reverse().map(n=>-n),turn:1-s.turn,
  bar:[...s.bar].reverse(),off:[...s.off].reverse(),cube:{...s.cube,owner:s.cube.owner===null?null:1-s.cube.owner}});
const pack=(id,state)=>{assertState(state);return {id,state,legal:legalTurns(state).map(t=>({key:t.key,steps:t.steps}))};};
const openings=normalizeReference(JSON.parse(reference)).map(r=>pack(r.title,{...stateForBoard(r.board,[...r.roll].map(Number)),rules}));
const selected=JSON.parse(corpus).items.filter((_,i)=>i%10===0);
const edges=[
  [[0,1],[23,-15]],
  [[0,2],[1,1],[23,-15]],
  [[10,14],[23,-2],[22,-2],[21,-2],[20,-2],[19,-2],[18,-5]],
  [[5,13],[23,-2],[21,-2],[18,-2],[12,-9]],
  [[5,4],[3,4],[2,2],[1,2],[0,3],[23,-15]],
].map((entries,i)=>{
  const points=Array(24).fill(0);for(const [p,n] of entries)points[p]=n;
  const bar=i===2?[1,0]:i===3?[2,0]:[0,0];
  const off=[0,1].map(p=>15-bar[p]-points.reduce((n,v)=>n+(v*(p?-1:1)>0?Math.abs(v):0),0));
  return {id:'edge-'+i,state:initialState({points,bar,off,phase:'move',dice:i===3?[6,4]:[1,1]})};
});
const general=[];
for(const [i,item] of [...selected,...edges].entries()) for(const owner of [null,0,1]) {
  const original={...item.state,matchLength:0,scores:[0,0],rules,crawford:false,crawfordPlayed:false,
    cube:{value:owner===null?1:4,owner}};
  for(const state of [original,mirror(original)])general.push(pack(`${item.topic||item.id}-${i}-owner${owner}-turn${state.turn}`,state));
}
const data={schema:1,description:'PureTD native/WASM parity inputs. Opening legal boards and diverse contact/race/crashed, pass, bar and bearoff cases in both orientations and three cube ownership contexts. No reference equity is used here.',
  inputs:{referenceSHA256:hash(reference),geometryCorpusSHA256:hash(corpus)},openings,general};
fs.writeFileSync(process.argv[2]||'/tmp/puretd-parity-inputs.json',JSON.stringify(data)+'\n');
console.log({openings:openings.length,general:general.length});
