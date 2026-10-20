// SPDX-License-Identifier: GPL-3.0-or-later
// Publish only a complete, reproducible experiment; never promote partial ranks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {summarize} from './summarize-rollout-disagreements.mjs';
import {ENGINE_VERSION} from '../engine/metadata.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.env.BG_ROLLOUT_OUT||path.join(family,'test-results/strong-rollouts-v3'));
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const inputBytes=fs.readFileSync(path.join(out,'inputs.json')),inputs=JSON.parse(inputBytes);
const {signature,...signed}=inputs;
if(inputs.plan.length!==66||inputs.trials<512||inputs.plan.filter(d=>d.cohort==='opening').length!==15||inputs.plan.filter(d=>d.cohort==='reply-disagreement').length!==39||inputs.plan.filter(d=>d.cohort==='reply-control').length!==12||inputs.policies.map(p=>p.id).join(',')!=='basic,balanced,short-deep')throw Error('Only the complete fixed cohort can replace the published comparison');
if(signature!==hash(JSON.stringify(signed))||read(path.join(out,'complete.json')).signature!==signature)throw Error('Experiment signature mismatch');
if(inputs.build.bridgeSHA256!==hash(fs.readFileSync(path.join(family,'engine/source/bridge.c'))))throw Error('Experiment bridge differs from published engine');
const raw=fs.readFileSync(path.join(out,'batches.jsonl'));
if(raw.at(-1)!==10)throw Error('Unfinished record');
const records=raw.toString('utf8').trim().split('\n').map(JSON.parse);
const report=summarize(inputs,records);
if(!report.complete||records.length!==inputs.plan.reduce((n,d)=>n+d.candidates.length,0)*inputs.policies.length*inputs.trials/32)throw Error('Incomplete experiment');
const compressed=gzipSync(raw,{level:9});
Object.assign(report,{engine:ENGINE_VERSION+'-native',build:inputs.build,inputSHA256:hash(inputBytes),rawSHA256:hash(raw),compressedSHA256:hash(compressed),
 sourceIndex:'https://www.extremegammon.com/Openingbook.aspx',nativeCacheMode:'2^22 evaluation entries, 2^20 pruning entries; larger than browser defaults',
 intervalNote:'Candidate mean intervals use approximate 1.96 × SE. Paired leader-gap intervals use Student t across independent batches. These measure sampling error, not model bias.'});
const save=(file,data)=>{fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);};
save(path.join(family,'docs/rollout-policy-inputs.json'),inputBytes);
save(path.join(family,'docs/rollout-policy-batches.jsonl.gz'),compressed);
save(path.join(family,'docs/rollout-policy-comparison.json'),JSON.stringify(report,null,2)+'\n');
const compact={...report,rows:report.rows.map(r=>({...r,policies:Object.fromEntries(Object.entries(r.policies).map(([id,p])=>[id,{...p,candidates:undefined}]))}))};
save(path.join(family,'data/rollout-policy-comparison.json'),JSON.stringify(compact)+'\n');
console.log(JSON.stringify({coverage:report.coverage,summaries:report.summaries},null,2));
