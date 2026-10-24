import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeReference} from './deep-book-comparison.mjs';
import {stateForBoard} from './book-branches.mjs';
import {legalTurns} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
const bytes=fs.readFileSync(new URL('../docs/deep-book-xg-reference.json',import.meta.url));
const sage=key=>{const p=key.split(',').map(Number);return [p[25],...p.slice(0,24),p[24]];};
const cases=normalizeReference(JSON.parse(bytes)).map(r=>({...r,sageBoard:sage(r.board),
 legal:legalTurns(stateForBoard(r.board,[...r.roll].map(Number))).map(t=>({board:t.key,sageBoard:sage(t.key)})),
 candidates:r.candidates.map(c=>({...c,sageBoard:sage(c.board)}))}));
if(process.argv.includes('--gnu'))for(const c of cases) {
 const state=stateForBoard(c.board,[...c.roll].map(Number));state.rules.immediateRedoubles=1;c.original=toXGID(state,{engine:true});
 for(const m of c.legal) {
  const after=stateForBoard(m.board);after.dice=[];after.phase='roll';after.rules.immediateRedoubles=1;m.after=toXGID(after,{engine:true});
 }
}
const result={schema:1,referenceSHA256:createHash('sha256').update(bytes).digest('hex'),cases};
if(!process.argv[2]||process.argv[2].startsWith('--'))throw Error('Supply the output JSON path, optionally followed by --gnu');
fs.writeFileSync(process.argv[2],JSON.stringify(result));
console.log(cases.length,cases.reduce((n,c)=>n+c.legal.length,0));
