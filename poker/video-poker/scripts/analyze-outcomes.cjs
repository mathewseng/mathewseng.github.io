// Reproduce optimal-play payout frequencies for every default menu entry.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync,execFile}=require('node:child_process'),{promisify}=require('node:util'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js'),O=require('../outcomes.js'),root=path.resolve(__dirname,'..');
const reports=['analysis.json','cribbage-analysis.json','cribbage-net-analysis.json'].map(f=>require('../'+f)),options=reports.flatMap(r=>r.recommendations);
function recommended(id,doubled,payout){return options.filter(r=>r.id===id&&!!r.doubleOnDraw===doubled&&(!E.byId[id].cribbage||r.rules.payout===payout)&&r.result.netEV<=0).sort((a,b)=>b.result.netEV-a.result.netEV)[0];}
function configs(){return E.variants.flatMap(v=>(v.cribbage?['return','net']:['return']).flatMap(payout=>(v.family==='Custom variants'?[false,true]:[false]).map(doubleOnDraw=>{const rec=recommended(v.id,doubleOnDraw,payout);return {...v,doubleOnDraw,...(rec?{pays:rec.pays,rules:rec.rules}:{} )};})));}
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vp-outcomes-')),binary=path.join(tmp,'analyze'),variants=configs(),report={version:1,hashes:{},entries:[]};
 try{
 execFileSync('c++',['-O3','-std=c++17',path.join(__dirname,'cribbage-outcomes.cpp'),'-o',binary]);
 const sampled=[6,7].map(async n=>{const vs=variants.filter(v=>v.handSize===n),samples=n===6?8192:4096,seed=n===6?920731:739021;const {stdout}=await promisify(execFile)(binary,[n,samples,seed,...vs.map(v=>v.pays.fee)].map(String),{maxBuffer:16*1024*1024});const bins=JSON.parse(stdout);return vs.map((v,i)=>({id:v.id,pays:v.pays,rules:v.rules,doubleOnDraw:v.doubleOnDraw,result:{...O.summarize(new Map(bins[i]),samples,true),seed}}));});
 for(const v of variants.filter(v=>(v.handSize||5)<=5)){
  const result=O.exact(v);report.entries.push({id:v.id,pays:v.pays,rules:v.rules,doubleOnDraw:v.doubleOnDraw,result});
  const known=v.family==='Custom variants'?recommended(v.id,v.doubleOnDraw,v.rules?.payout).result:reports[0].originals[v.id];
  if(Math.abs(result.netEV-known.netEV)>1e-7)throw Error(`Histogram EV disagrees for ${v.id}: ${result.netEV} / ${known.netEV}`);
  console.log(v.id,v.rules?.payout||'',v.doubleOnDraw?'2×':'',result.netEV,result.payouts.length+' payouts');
 }
 for(const entries of await Promise.all(sampled))for(const entry of entries){const known=recommended(entry.id,entry.doubleOnDraw,entry.rules.payout).result;if(Math.abs(entry.result.netEV-known.netEV)>1e-7)throw Error('Sampled outcome EV disagrees with fee analysis');report.entries.push(entry);}
 for(const file of ['engine.js','solver.js','cribbage.js','cribbage-solver.js','cribbage-distribution.js','outcomes.js','scripts/cribbage-analyze.cpp','scripts/cribbage-outcomes.cpp','scripts/analyze-outcomes.cjs',...['analysis.json','cribbage-analysis.json','cribbage-net-analysis.json']])report.hashes[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 fs.writeFileSync(path.join(root,'outcome-analysis.json'),JSON.stringify(report,null,2)+'\n');console.log('Saved',report.entries.length,'variant distributions.');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={configs};
