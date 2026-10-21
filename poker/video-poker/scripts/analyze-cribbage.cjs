// Reproduce all cribbage fees: node poker/video-poker/scripts/analyze-cribbage.cjs
// Requires a C++17 compiler for the 6/7-card sampled-deal analysis.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js'),root=path.resolve(__dirname,'..');
const sampling={6:{deals:8192,seed:920731,lo:14,hi:24},7:{deals:4096,seed:739021,lo:20,hi:35}};
function assemble(exact,six,seven){
 const all=[...exact,...six.map(r=>({...r,handSize:6})),...seven.map(r=>({...r,handSize:7}))];
 const report={version:1,rules:{payout:'max(0, points - fee), including stake',scoreCap:7,draws:1,starter:false},sampling,hashes:{},originals:{},doubleOriginals:{},recommendations:[]};
 for(const file of ['engine.js','solver.js','cribbage.js','cribbage-solver.js','scripts/cribbage-analyze.cpp','scripts/analyze-cribbage.cjs'])report.hashes[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 for(const n of [4,5,6,7])for(const doubled of [false,true]){
  const id='cribbage'+n,v=E.byId[id],candidates=all.filter(r=>r.handSize===n&&r.doubleOnDraw===doubled);
  for(const c of candidates){if(c.result.estimated){if(c.result.deals!==sampling[n].deals)throw Error('Unexpected sample size');c.result.method='Sampled initial deals; exact EV of every hold and legal draw on each deal';c.result.seed=sampling[n].seed;}else if(c.result.deals!==S.C[52][n])throw Error('Incomplete exhaustive result');}
  const original=candidates.find(r=>r.fee===v.pays.fee);if(!original)throw Error('Missing original fee');
  report[doubled?'doubleOriginals':'originals'][id]={pays:v.pays,rules:v.rules,doubleOnDraw:doubled,...original.result};
  const best=candidates.filter(c=>c.result.rtp<=1).sort((a,b)=>b.result.rtp-a.result.rtp)[0];
  if(!best)throw Error('No candidate below 100%');
  for(const fee of [best.fee-1,best.fee,best.fee+1]){
   const c=candidates.find(c=>c.fee===fee);if(!c)throw Error(`Missing adjacent fee ${n}/${fee}`);
   report.recommendations.push({id,key:`${id}-${doubled?'2x-':''}fee${fee}`,doubleOnDraw:doubled,name:`Fee ${fee}`,pays:{fee},rules:v.rules,summary:`Return = max(0, cribbage points − ${fee}).`,rationale:'Whole-point fees preserve the scoring. Compare adjacent fees to see their effect on return.'+(c.result.estimated?' The closest sampled return below 100% is the default; sampling uncertainty may cross 100%.':''),result:c.result});
  }
 }
 fs.writeFileSync(path.join(root,'cribbage-analysis.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'video-poker-cribbage-'));
 try{
  const exact=[];
  for(const n of [4,5])for(const fee of n===4?[4,5,6]:[9,10,11,12]){const v={...E.byId['cribbage'+n],pays:{fee}},table=S.build(v);for(const doubleOnDraw of [false,true]){const result=S.solveAll({...v,doubleOnDraw},table);exact.push({handSize:n,fee,doubleOnDraw,result});console.log(`${n} cards, fee ${fee}${doubleOnDraw?' 2×':''}: ${result.rtp}`);}}
  const binary=path.join(tmp,'analyze');execFileSync('c++',['-O3','-std=c++17',path.join(__dirname,'cribbage-analyze.cpp'),'-o',binary]);
  const sampled={};for(const n of [6,7]){const p=sampling[n];sampled[n]=JSON.parse(execFileSync(binary,[n,p.deals,p.seed,p.lo,p.hi].map(String),{encoding:'utf8',maxBuffer:16*1024*1024}));}
  assemble(exact,sampled[6],sampled[7]);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
module.exports={assemble};
