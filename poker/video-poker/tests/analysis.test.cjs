const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js'),report=require('../analysis.json');
test('saved analysis matches shipped code and all preset paytables',()=>{
 for(const [file,key]of [['engine.js','engineSha256'],['solver.js','solverSha256']])assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex'),report[key]);
 assert.equal(Object.keys(report.originals).length,E.variants.length);
 for(const v of E.variants)assert.deepEqual(report.originals[v.id].pays,v.pays,v.id);
});
test('custom originals and recommendations reproduce exactly',()=>{
 for(const id of ['low27','badeucey']){assert.ok(Math.abs(S.solveAll(E.byId[id]).rtp-report.originals[id].rtp)<1e-12);const rec=report.recommendations.find(r=>r.id===id);assert.ok(Math.abs(S.solveAll({...E.byId[id],pays:rec.pays}).rtp-rec.result.rtp)<1e-12);assert.ok(rec.result.rtp>.98&&rec.result.rtp<1);}
 assert.equal(report.recommendations.find(r=>r.id==='badeucey').pays.qualify,1);
});
