// node poker/video-poker/scripts/analyze.cjs
// Deterministic output; no simulation, network, native tools, or dependencies.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js');
const root=path.resolve(__dirname,'..');
const hash=file=>createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const report={version:2,optionsSha256:hash('payout-options.json'),engineSha256:hash('engine.js'),solverSha256:hash('solver.js'),rules:{draws:1,lowAces:'high',low27Payouts:'total return including stake',badeuceyPayouts:'1-credit qualifying push plus best low points plus best badugi points',badeuceyQualifier:'five distinct ranks, no straight or flush, AND a four-card badugi',royal:'max-coin rate normalized to one-credit stake'},originals:{},doubleOriginals:{},recommendations:[],experiments:[],sources:['https://wizardofodds.com/games/video-poker/summary/','https://wizardofodds.com/games/video-poker/tables/all-american/','https://wizardofodds.com/games/video-poker/tables/joker-poker-kings-or-better/','https://wizardofodds.com/games/video-poker/tables/deuces-wild/']};
// Payout-only edits can reuse verified unchanged originals and sensitivity results.
// The default command still rebuilds the complete report from scratch.
const recommendationsOnly=process.argv.includes('--recommendations-only');
if(recommendationsOnly){
 const previous=JSON.parse(fs.readFileSync(path.join(root,'analysis.json'),'utf8'));
 if(previous.engineSha256!==report.engineSha256||previous.solverSha256!==report.solverSha256)throw new Error('Engine or solver changed; run the full analysis.');
 report.originals=previous.originals;report.doubleOriginals=previous.doubleOriginals;
 report.experiments=previous.experiments.filter(x=>!x.name.startsWith('Recommended Badeucey'));
}else{
 for(const v of E.variants.filter(v=>!v.cribbage)){report.originals[v.id]={pays:v.pays,...(v.rules?{rules:v.rules}:{}),...S.solveAll(v)};console.log(v.name,(report.originals[v.id].rtp*100).toFixed(6)+'%');}
 for(const id of ['low27','badeucey']){const v={...E.byId[id],doubleOnDraw:true};report.doubleOriginals[id]={pays:v.pays,...(v.rules?{rules:v.rules}:{}),doubleOnDraw:true,...S.solveAll(v)};console.log('Original double',id,report.doubleOriginals[id].rtp);}
}
const candidates=require('../payout-options.json');
for(const rec of candidates){rec.result=S.solveAll({...E.byId[rec.id],pays:rec.pays,rules:rec.rules||E.byId[rec.id].rules,doubleOnDraw:!!rec.doubleOnDraw});report.recommendations.push(rec);console.log('Recommended',rec.key||rec.id,rec.result.rtp,rec.result.doubleFrequency??'');}
if(!recommendationsOnly){
for(const [name,id,pays]of [
 ['Double every Badeucey point award; keep push','badeucey',Object.fromEntries(Object.entries(E.byId.badeucey.pays).map(([k,n])=>[k,k==='qualify'?1:n*2]))],
 ['Alternative 2–7 interpretation: listed numbers are profit, plus stake','low27',Object.fromEntries(Object.entries(E.byId.low27.pays).map(([k,n])=>[k,n+1]))]
 ]){const result=S.solveAll({...E.byId[id],pays});report.experiments.push({name,id,pays,result});console.log(name,result.rtp);}
for(const rules of [E.normalizeBadeuceyRules({minBadugi:3}),E.normalizeBadeuceyRules({fiveCard:'any'}),E.normalizeBadeuceyRules({fiveCard:'any',minBadugi:3})]){
 const result=S.solveAll({...E.byId.badeucey,rules});
 report.experiments.push({name:'Alternative Badeucey qualification',id:'badeucey',pays:E.byId.badeucey.pays,rules,result});
 console.log('Qualification',JSON.stringify(rules),result.rtp);
}
}
fs.writeFileSync(path.join(root,'analysis.json'),JSON.stringify(report,null,2)+'\n');
