// Preserve complete browser/native parity evidence for both shipped models.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {PURETD,PURETD_WIDE} from '../engine/puretd-metadata.mjs';
const root=new URL('../',import.meta.url),results=path.resolve(process.argv[2]||new URL('test-results/',root).pathname);
const read=file=>fs.readFileSync(new URL(file,root)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(value,message)=>{if(!value)throw Error(message);};
const browsers=['chromium','webkit','firefox'],reports=[],summaries=[];
for(const [model,directory,prefix] of [[PURETD,'',''],[PURETD_WIDE,'puretd-wide','wide-']]) {
  const corpusBytes=read(`docs/puretd-${prefix}native-parity.json.gz`),corpus=JSON.parse(gunzipSync(corpusBytes));
  const expected=new Map();
  for(const group of ['openings','general'])for(const [i,c] of corpus[group].entries())for(const r of c.results)
    expected.set(`${group}/${c.id}/${r.plies}`,{i,group,id:c.id,plies:r.plies,candidates:r.moves.length});
  for(const browser of browsers) {
    const report=JSON.parse(fs.readFileSync(path.join(results,directory,`${browser}-puretd-parity-report.json`)));
    const selected=report.onePlyOpeningIndices||Array.from({length:35},(_,i)=>i*21);
    check(JSON.stringify(selected)===JSON.stringify(report.onePlyOpeningIndices?
      [...Array.from({length:15},(_,i)=>i),...Array.from({length:21},(_,i)=>15+22*i)]:Array.from({length:35},(_,i)=>i*21)),'Changed one-ply sample');
    check(report.engine===model.id&&report.modelSHA256===model.modelSHA256&&report.browser===browser,'Wrong model/browser');
    for(const backend of ['simd','scalar'])check(report.release[backend]===model.assets[(backend==='scalar'?'scalar/':'')+'puretd-module.wasm'],'Wrong executable');
    const seen=new Set();
    for(const row of report.rows) {
      const key=`${row.group}/${row.id}/${row.plies}`,reference=expected.get(key),unique=row.backend+'/'+key;
      check(['simd','scalar'].includes(row.backend)&&reference&&!seen.has(unique),'Unknown/duplicate parity case');seen.add(unique);
      check(row.candidates===reference.candidates&&Number.isFinite(row.maximumDifference)&&row.maximumDifference<=1e-5,'Numerical parity failed');
    }
    for(const backend of ['simd','scalar'])for(const [key,r] of expected) {
      const required=r.plies===0||browser==='chromium'&&backend==='simd'||
        r.group==='openings'&&selected.includes(r.i)||r.group==='general'&&(r.i>=180||r.i%5===0);
      if(required)check(seen.has(backend+'/'+key),'Incomplete browser coverage: '+browser+'/'+backend+'/'+key);
    }
    const summary={browser,engine:model.id,modelSHA256:model.modelSHA256,corpusSHA256:hash(corpusBytes),onePlyOpeningIndices:selected,
      cases:report.rows.length,candidateValues:report.rows.reduce((n,r)=>n+r.candidates,0),
      maximumDifference:Math.max(...report.rows.map(r=>r.maximumDifference)),tiedOrChangedTop:report.rows.filter(r=>!r.topAgrees).length};
    summaries.push(summary);reports.push(report);
  }
}
const ui=[],loading=[],comparison=[];
for(const browser of browsers) {
  ui.push(JSON.parse(fs.readFileSync(path.join(results,`${browser}-puretd-ui-report.json`))));
  loading.push({browser,cases:JSON.parse(fs.readFileSync(path.join(results,`${browser}-puretd-loading-report.json`)))});
  comparison.push(JSON.parse(fs.readFileSync(path.join(results,`${browser}-learned-evaluators-report.json`))));
}
const raw=gzipSync(JSON.stringify({reports,ui,loading,comparison})+'\n',{mtime:0});
const output={schema:1,complete:true,recordedAt:new Date().toISOString(),
  tolerance:1e-5,method:'Native C API oracle vs actual browser WASM and JS adapter. Every one of 729 openings and 210 general states at zero ply in both backends and all three browsers. Chromium/SIMD also checks all states at one ply. Other backend/browser pairs check the listed opening/reply subset, every fifth general context and all 30 edge cases. The revised subset covers all 15 opening rolls and all 21 reply rolls in different contexts; the original Chromium scalar subset used every 21st position. The original small-model Chromium run additionally checked every general state at one ply in scalar.',
  assets:PURETD.assets,rawFile:'puretd-browser-validation.json.gz',rawSHA256:hash(raw),summaries,
  cases:summaries.reduce((n,r)=>n+r.cases,0),candidateValues:summaries.reduce((n,r)=>n+r.candidateValues,0),
  maximumDifference:Math.max(...summaries.map(r=>r.maximumDifference)),
  tiedOrChangedTop:summaries.reduce((n,r)=>n+r.tiedOrChangedTop,0),
  interfaces:'Both live model choices, scalar worker, cancellation/restart, saved grades and unsupported contexts passed in Chromium, WebKit and Firefox. Six real HTTP asset-failure/fallback/retry cases passed per browser. Comparison report checked at desktop and mobile widths.',
  limits:'Implementation equivalence only, not evidence of general playing strength or XG agreement.'};
fs.writeFileSync(new URL('docs/'+output.rawFile,root),raw);
fs.writeFileSync(new URL('docs/puretd-browser-validation.json',root),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({cases:output.cases,candidateValues:output.candidateValues,maximumDifference:output.maximumDifference,tiedOrChangedTop:output.tiedOrChangedTop}));
