// Reproduce net-PnL cribbage fee options: node poker/video-poker/scripts/analyze-cribbage-net.cjs
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js'),root=path.resolve(__dirname,'..');
function summarize(pairs,fee,doubled,estimated){
 let sum=0,sq=0,doubleCount=0,doubleTieCount=0;
 for(const [score,draw]of pairs){const base=score-fee,extra=2*(draw-fee),use=doubled&&extra>base+1e-10,net=use?extra:base;sum+=net;sq+=net*net;doubleCount+=use;if(doubled&&!use&&Math.abs(extra-base)<=1e-10)doubleTieCount++;}
 const deals=pairs.length,netEV=sum/deals,doubleFrequency=doubleCount/deals,averageStake=1+doubleFrequency;
 return {netEV,expectedReturn:netEV+averageStake,averageStake,rtp:1+netEV/averageStake,deals,doubleCount,doubleFrequency,doubleTieCount,doubleTieFrequency:doubleTieCount/deals,estimated, ...(estimated?{netEVSE:Math.sqrt(Math.max(0,(sq-sum*sum/deals)/(deals-1)/deals))}:{}),method:estimated?'Sampled initial deals; exact EV of every hold and legal draw on each deal':'Exhaustive: every initial hand, every hold and legal draw'};
}
function exactPairs(n){
 const v={...E.byId['cribbage'+n],rules:{payout:'net',scoreCap:7},pays:{fee:0}},table=S.build(v),pairs=[];
 S.eachHand(52,h=>{const ix=new Int32Array(1<<n),a=new Float64Array(1<<n);S.indices(h,ix);for(let m=0;m<a.length;m++)a[m]=table.sums[table.offsets[S.size[m]]+ix[m]];S.invert(a);let best=-Infinity,draw=-Infinity;for(let m=0;m<a.length;m++){const score=a[m]/S.C[52-n][n-S.size[m]]-1;best=Math.max(best,score);if(m!==a.length-1)draw=Math.max(draw,score);}pairs.push([best,draw]);},n);return pairs;
}
function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cribbage-net-')),binary=path.join(tmp,'analyze'),report={version:1,rules:{payout:'net PnL = points - fee',scoreCap:7},hashes:{},recommendations:[]};
 try{
 execFileSync('c++',['-O3','-std=c++17',path.join(__dirname,'cribbage-net-analyze.cpp'),'-o',binary]);
 for(const n of [4,5,6,7]){
  const samples=n===6?8192:4096,seed=n===6?920731:739021;
  const pairs=n<=5?exactPairs(n):JSON.parse(execFileSync(binary,[n,samples,seed].map(String),{encoding:'utf8',maxBuffer:16*1024*1024}));
  for(const doubled of [false,true]){
   let fee=Math.max(0,Math.ceil(summarize(pairs,0,false,n>5).netEV));while(summarize(pairs,fee,doubled,n>5).netEV>0)fee++;
   for(const f of [fee-1,fee,fee+1]){const result=summarize(pairs,f,doubled,n>5);if(n>5)result.seed=seed;report.recommendations.push({id:'cribbage'+n,key:`cribbage${n}-net-${doubled?'2x-':''}fee${f}`,doubleOnDraw:doubled,name:`Fee ${f}`,pays:{fee:f},rules:{payout:'net',scoreCap:7},summary:`Net PnL = cribbage points − ${f}. Maximum loss ${f}${doubled?`, or ${2*f} at 2×`:''}.`,result});}
   console.log(`${n} cards${doubled?' 2×':''}: fee ${fee}, EV ${summarize(pairs,fee,doubled,n>5).netEV}`);
  }
 }
 for(const file of ['engine.js','solver.js','cribbage.js','cribbage-solver.js','scripts/cribbage-analyze.cpp','scripts/cribbage-net-analyze.cpp','scripts/analyze-cribbage-net.cjs'])report.hashes[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 fs.writeFileSync(path.join(root,'cribbage-net-analysis.json'),JSON.stringify(report,null,2)+'\n');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
if(require.main===module)main();module.exports={summarize};
