// node poker/video-poker/scripts/analyze.cjs
// Deterministic output; no simulation, network, native tools, or dependencies.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js');
const root=path.resolve(__dirname,'..');
const hash=file=>createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const report={version:1,engineSha256:hash('engine.js'),solverSha256:hash('solver.js'),rules:{draws:1,lowAces:'high',low27Payouts:'total return including stake',badeuceyPayouts:'1-credit qualifying push plus best low points plus best badugi points',badeuceyQualifier:'five distinct ranks, no straight or flush, AND a four-card badugi',royal:'max-coin rate normalized to one-credit stake'},originals:{},recommendations:[],experiments:[],sources:['https://wizardofodds.com/games/video-poker/summary/','https://wizardofodds.com/games/video-poker/tables/all-american/','https://wizardofodds.com/games/video-poker/tables/joker-poker-kings-or-better/','https://wizardofodds.com/games/video-poker/tables/deuces-wild/']};
for(const v of E.variants){report.originals[v.id]={pays:v.pays,...S.solveAll(v)};console.log(v.name,(report.originals[v.id].rtp*100).toFixed(6)+'%');}
const candidates=[
 {id:'low27',pays:{wheel:25,low7:7,low8:5,low9:4,lowT:2,lowJ:1},summary:'Total returns: J-high 1×, T-high 2×, 9-high 4×, 8-high 5×, 7-high 7×, wheel 25×.',rationale:'Keep the J-high push and T-high award; improve the strong lows and make the wheel a bigger prize. Exact house edge: 0.6262%. This is a practical whole-number option, not a unique optimum.'},
 {id:'badeucey',pays:{qualify:1,wheel:20,low7:10,low8:4,low9:2,bad5:40,bad6:20,bad7:9,bad8:4,bad9:2},summary:'Keep the 1-credit push. Low points (9 / 8 / 7 / wheel): 2 / 4 / 10 / 20. Badugi points (9 / 8 / 7 / 6 / 5): 2 / 4 / 9 / 20 / 40.',rationale:'Both qualifiers still apply. The badugi awards do most of the balancing: increasing 7-dugi from 9 to 10 would lift return above 100%. Exact house edge: 1.1217%.'}
];
for(const rec of candidates){rec.result=S.solveAll({...E.byId[rec.id],pays:rec.pays});report.recommendations.push(rec);console.log('Recommended',rec.id,rec.result.rtp);}
for(const [name,id,pays]of [
 ['Double every Badeucey point award; keep push','badeucey',Object.fromEntries(Object.entries(E.byId.badeucey.pays).map(([k,n])=>[k,k==='qualify'?1:n*2]))],
 ['Recommended Badeucey with 7-dugi increased to 10','badeucey',{...candidates[1].pays,bad7:10}],
 ['Alternative 2–7 interpretation: listed numbers are profit, plus stake','low27',Object.fromEntries(Object.entries(E.byId.low27.pays).map(([k,n])=>[k,n+1]))]
 ]){const result=S.solveAll({...E.byId[id],pays});report.experiments.push({name,id,pays,result});console.log(name,result.rtp);}
fs.writeFileSync(path.join(root,'analysis.json'),JSON.stringify(report,null,2)+'\n');
