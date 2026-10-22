// SPDX-License-Identifier: GPL-3.0-or-later
// Refine all six entries under the same policy, regardless of the winners.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {legalTurns} from '../core/rules.mjs';
import {stateForBoard} from './book-branches.mjs';
import {rolloutBookResult,ROLLOUT_BOOK_ID} from '../engine/rollout-book.mjs';
const base=new URL('../',import.meta.url),file=p=>new URL(p,base),bytes=p=>fs.readFileSync(file(p)),read=p=>JSON.parse(bytes(p)),hash=b=>createHash('sha256').update(b).digest('hex');
const prefix='reply-fullgame-precision',inputBytes=bytes(`docs/${prefix}-inputs.json`),inputs=JSON.parse(inputBytes),source=bytes(`docs/${prefix}-comparison.json`),report=JSON.parse(source);
execFileSync('python3',[new URL('./summarize-reply-fullgame.py',import.meta.url).pathname,'--validate-plan'],{env:{...process.env,NODE:process.execPath,PYTHONDONTWRITEBYTECODE:'1'}});
const raw=gunzipSync(bytes(`docs/${prefix}-batches.jsonl.gz`));
if(!report.complete||report.signature!==inputs.signature||report.inputSHA256!==hash(inputBytes)||report.rawSHA256!==hash(raw)||report.records!==20480||report.totalTrials!==655360||report.trialsPerMovePolicy!==32768||report.rows.length!==6||report.retainedComparisons!==14)throw Error('Incomplete or mismatched precision study');
const verify=`import importlib.util,pathlib,json,gzip
p=pathlib.Path('backgammon/scripts/summarize-reply-fullgame.py');s=importlib.util.spec_from_file_location('r',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
i=m.validate(pathlib.Path('backgammon/docs/reply-fullgame-precision-inputs.json').read_bytes())
raw=gzip.decompress(pathlib.Path('backgammon/docs/reply-fullgame-precision-batches.jsonl.gz').read_bytes())
r=m.summarize(i,[json.loads(line) for line in raw.splitlines()]);published=json.loads(pathlib.Path('backgammon/docs/reply-fullgame-precision-comparison.json').read_bytes())
assert all(published.get(k)==v for k,v in r.items())`;
execFileSync('python3',['-c',verify],{cwd:new URL('../../',import.meta.url).pathname,env:{...process.env,NODE:process.execPath,PYTHONDONTWRITEBYTECODE:'1'}});
const index=read('engine/opening-book-data/rollout/index.json'),baseline=read('docs/reply-fullgame-book-baseline.json');
if(index.id!==ROLLOUT_BOOK_ID||baseline.signature!==inputs.signature)throw Error('Book/plan changed');
let candidates=0;
for(const d of inputs.plan){
 const old=index.entries[d.board]?.[d.roll],original=baseline.entries.find(e=>e.board===d.board&&e.roll===d.roll);
 if(!old||(!index.provenance.replyFullgamePrecision&&hash(JSON.stringify(old))!==original?.sha256))throw Error('Prior entry changed');
 const row=report.rows.find(r=>r.id===d.id),policy=row?.policies['full-strong'],values=policy?.candidates;
 if(!values||values.length!==d.candidates.length||values.some(c=>c.samples!==32768)||policy.retainedReferenceGaps.length!==d.candidates.length-1)throw Error('Incomplete retained alternatives');
 const state=stateForBoard(d.board,[...d.roll].map(Number));
 const entry={settings:structuredClone(old.settings),rows:values.map(c=>{
  const source=d.candidates.find(o=>o.board===c.board);if(!source)throw Error('Unknown candidate');
  return[source.steps.map(({from,to,die})=>[from,to,die]),c.equity,c.cubeless,...c.probabilities];
 }),standardErrors:values.map(c=>c.standardError),samples:32768,total:legalTurns(state).length,seed:d.seedBase,comparisonId:d.id,comparisonSignature:report.signature};
 if(entry.settings.policyId!=='strong'||entry.settings.truncationPlies!==0||entry.settings.checkerPlies!==2||entry.settings.cubePlies!==2)throw Error('Continuation policy changed');
 if(rolloutBookResult(state,entry,index,'auto').candidates[0].key!==policy.bestBoard)throw Error('Perspective changed');
 index.entries[d.board][d.roll]=entry;candidates+=entry.rows.length;
}
if(candidates!==20)throw Error('Retained set changed');
for(const d of baseline.entries)if(!inputs.plan.some(p=>p.board===d.board&&p.roll===d.roll)&&hash(JSON.stringify(index.entries[d.board][d.roll]))!==d.sha256)throw Error('Unrelated book entry changed');
index.provenance.replyFullgamePrecision={signature:inputs.signature,comparisonSHA256:hash(source),rawSHA256:hash(raw),inputSHA256:hash(inputBytes),positions:6,candidates:20,trialsPerMove:32768,policyId:'strong',promotedIds:inputs.plan.map(d=>d.id),criterion:'Complete fixed sample; all six unchanged-policy positions refined together regardless of winner.',conclusions:report.conclusions};
index.provenance.builtAt=new Date().toISOString();
const output=file('engine/opening-book-data/rollout/index.json');fs.writeFileSync(new URL(output.href+'.tmp'),JSON.stringify(index)+'\n');fs.renameSync(new URL(output.href+'.tmp'),output);
console.log(JSON.stringify(index.provenance.replyFullgamePrecision,null,2));
