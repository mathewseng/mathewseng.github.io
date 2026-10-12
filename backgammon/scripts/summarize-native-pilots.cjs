// SPDX-License-Identifier: GPL-3.0-or-later
// Keep timings, numerical checks and canonical inputs without duplicating every
// complete candidate list in published documentation. Full outputs stay local.
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sources=[
  ['cache','cache-pilot/results.json'],
  ['activation','activation-pilot/results.json'],
  ['move-index','move-index-pilot/results.json'],
  ['move-index','move-index-pilot/webkit.json'],
  ['output','output-pilot/results.json'],
  ['output','output-pilot/webkit.json'],
  ['output-corpus','output-pilot/corpus.json'],
];
const numerical=answer=>(answer.candidates||[answer]).map(c=>({key:c.key,action:c.action,
  equity:c.equity,cubeless:c.cubeless,mwc:c.mwc,probabilities:c.probabilities,outcomes:c.outcomes,outcomesMWC:c.outcomesMWC}));
const compact=({answer,...timing})=>({...timing,candidates:(answer.candidates||[answer]).length,
  best:answer.candidates?.[0].key||answer.action,equity:answer.candidates?.[0].equity??answer.equity,
  numericalSHA256:sha(JSON.stringify(numerical(answer)))});
const experiments=sources.map(([variant,file])=>{
  const bytes=fs.readFileSync('backgammon/test-results/'+file),r=JSON.parse(bytes);
  if(!r.finishedAt)throw Error(`Incomplete experiment: ${file}`);
  const {rows,...metadata}=r;
  return {...metadata,variant,rawFile:'backgammon/test-results/'+file,rawSHA256:sha(bytes),
    rows:rows.map(row=>row.baseline?{...row,baseline:compact(row.baseline),candidate:compact(row.candidate)}:
      {...row,candidates:row.candidates.length,numericalSHA256:sha(JSON.stringify(row.candidates))})};
});
const profile=JSON.parse(fs.readFileSync('backgammon/test-results/native-profile/summary.json'));
const report={schema:1,recordedAt:new Date().toISOString(),deployed:false,
  limitations:['Timings are exploratory, not a verified production speedup. Background applications remained active and substantial load changes were observed, particularly during output-neuron tests.',
    'Cache sizing has one observation per configuration/position; the last match/four-ply cases overlapped an experimental compilation. Use it to reject a blanket memory increase, not to claim precise speedups.',
    'The 300-position pass checks numerical parity at fixed 2-ply settings; it does not measure stronger play or phone performance.',
    'Original per-run metadata/hashes are preserved. This summary additionally hashes complete numerical outputs; rounded timing display is not used for assertions.'],
  sourceArchive:{file:'backgammon/engine/source/gnubg-core-955555c-bg5.tar.gz',sha256:sha(fs.readFileSync('backgammon/engine/source/gnubg-core-955555c-bg5.tar.gz'))},
  patches:Object.fromEntries(['activation','move-index','output'].map(n=>[n,sha(fs.readFileSync(`backgammon/scripts/patch-${n}-pilot.py`))])),
  profile,experiments};
fs.writeFileSync('backgammon/docs/native-optimization-pilot.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({experiments:experiments.length,searches:experiments.reduce((sum,r)=>sum+r.rows.length*(r.variant==='cache'?1:2),0),outputParityPairs:experiments.filter(e=>e.variant.startsWith('output')).reduce((sum,r)=>sum+r.rows.length,0),maxOutputDifference:Math.max(...experiments.filter(e=>e.variant.startsWith('output')).flatMap(e=>e.rows.map(r=>r.maxDifference)))}));
