// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {bookResult,DEEP_BOOK_ID,DEEP_BOOK_ENGINE_VERSION} from '../engine/opening-book.mjs';
import {stateForBoard} from './book-branches.mjs';
const base=new URL('../',import.meta.url),file=p=>new URL(p,base),hash=b=>createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync(file('test-results/xg-fallback/result.json')),result=JSON.parse(raw),{inputs}=result;
if(result.signature!==hash(JSON.stringify(inputs))||result.positions.length!==21||inputs.policy.checkerPlies!==5||inputs.policy.beavers!==false||inputs.boards.length!==1)throw Error('Incomplete or changed supplemental run');
const scores=fs.readFileSync(file('test-results/xg-fallback/scores.jsonl'));
const runtime=JSON.parse(fs.readFileSync(file('docs/fullgame-runtime-validation.json'))),native=process.env.BG_DEEP_NATIVE||'/tmp/bg-deep-book-neon';
if(inputs.build.archiveSHA256!==runtime.archiveSHA256||Object.entries(runtime.assets).some(([p,digest])=>hash(fs.readFileSync(native+'/'+p))!==digest))throw Error('Runtime weights/databases differ from pinned source');
const index=JSON.parse(fs.readFileSync(file('engine/opening-book-data/deep/index.json'))),board=inputs.boards[0];
const shard={schema:1,id:DEEP_BOOK_ID,engine:DEEP_BOOK_ENGINE_VERSION,board,rolls:{}};
for(const d of result.positions){
 if(d.board!==board||shard.rolls[d.roll]||!d.candidates.length)throw Error('Changed/duplicate supplemental position');
 shard.rolls[d.roll]={total:d.total,screened:d.screened,rows:d.candidates.map(c=>{
  const v=c.fivePly;return [c.steps.map(({from,to,die})=>[from,to,die]),v.equity,v.cubeless,...v.probabilities];
 }).sort((a,b)=>b[1]-a[1])};
 bookResult(stateForBoard(board,[...d.roll].map(Number)),shard.rolls[d.roll],index,'auto');
}
for(let a=1;a<=6;a++)for(let b=1;b<=a;b++)if(!shard.rolls[`${a}${b}`])throw Error('Missing roll');
const name=`reply-${hash(board).slice(0,16)}.json`,encoded=JSON.stringify(shard),prior=index.replies[board];
if(prior&&prior.sha256!==hash(encoded))throw Error('Refusing to overwrite another supplemental book');
index.replies[board]={file:name,sha256:hash(encoded)};
index.provenance.xgCoverageSupplement={builtAt:result.recordedAt,signature:result.signature,sourceSHA256:hash(raw),scoresSHA256:hash(scores),runtimeAssets:runtime.assets,build:inputs.build,policy:inputs.policy,replyBoards:1,replyRolls:21,board};
fs.writeFileSync(file('engine/opening-book-data/deep/'+name),encoded);
fs.writeFileSync(file('engine/opening-book-data/deep/index.json'),JSON.stringify(index));
fs.writeFileSync(file('docs/xg-coverage-supplement.json'),raw);
fs.writeFileSync(file('docs/xg-coverage-supplement-scores.jsonl.gz'),gzipSync(scores));
console.log('Published all 21 five-ply fallback replies after 5–1 24/18');
