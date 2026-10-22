// SPDX-License-Identifier: GPL-3.0-or-later
// Deterministic validation games only: excluded from every accuracy study.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const family=fileURLToPath(new URL('../',import.meta.url));
const binary=process.env.GNUBG_BIN, dataDir=process.env.GNUBG_DATA;
const native=process.env.BG_ROLLOUT_NATIVE || '/tmp/bg-cube-study-v2';
if(!binary||!dataDir)throw Error('GNUBG_BIN and GNUBG_DATA are required');
const destination=process.argv[2]||path.join(family,'docs/upstream-rollout-validation.json');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'bg-upstream-rollout-'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const fileHash=file=>hash(fs.readFileSync(file));
const planFile=path.join(family,'docs/cube-policy-study-v2-inputs.json');
const plan=JSON.parse(fs.readFileSync(planFile));
const fixture=JSON.parse(fs.readFileSync(path.join(family,'docs/cube-policy-v2-smoke-fixture.json')));
if(fixture.seed!==31811004||!fixture.excludedFromStudy||fileHash(path.join(native,'gnubg-core'))!==fixture.binarySHA256)
  throw Error('Expected frozen local validation executable and excluded seed');
const seed=fixture.seed,trials=2,results=[];
const cacheDisabled=process.env.BG_AUDIT_CACHE_OFF==='1';
let nativeBinary=path.join(native,'gnubg-core'),harness=null;
if(cacheDisabled){
  // Relink the unchanged frozen engine objects with only an initialization
  // call added in a temporary harness. The study executable is never edited.
  const source=fs.readFileSync(path.join(native,'src/gnubg-core.c'),'utf8');
  const marker='    char line[2048];';
  if(source.split(marker).length!==2)throw Error('Unexpected frozen harness');
  const patched=source.replace(marker,'    if(EvalCacheResize(0)!=0 || GetEvalCacheEntries()!=0)return 7;\n'+marker);
  const cfile=path.join(work,'cache-off.c'),object=path.join(work,'cache-off.o');
  fs.writeFileSync(cfile,patched);
  execFileSync('cc',['-O3','-ffp-contract=off',`-I${native}/src`,`-I${native}/src/lib`,'-c',cfile,'-o',object]);
  const objects=fs.readdirSync(path.join(native,'obj'),{recursive:true}).filter(f=>f.endsWith('.o')&&f!=='gnubg-core.o').sort().map(f=>path.join(native,'obj',f));
  nativeBinary=path.join(work,'gnubg-cache-off');
  execFileSync('cc',[object,...objects,'-o',nativeBinary]);
  harness={sourceSHA256:hash(patched),objectSHA256:fileHash(object),unchangedObjects:Object.fromEntries(objects.map(file=>[path.relative(native,file),fileHash(file)]))};
}
// Unmodified GNUbg suppresses rollout progress/results when stdout is not a
// terminal. Give only its output a PTY; commands still come from a saved file.
const ptyScript=`import os,pty,subprocess,sys
master,slave=pty.openpty()
p=subprocess.Popen(sys.argv[1:],stdin=subprocess.DEVNULL,stdout=slave,stderr=slave)
os.close(slave)
while True:
 try: data=os.read(master,65536)
 except OSError: break
 if not data: break
 sys.stdout.buffer.write(data)
os.close(master)
sys.exit(p.wait())
`;
for(const candidate of plan.plan[0].candidates) for(const plies of cacheDisabled?[2]:[0,1,2]) {
  const id=`${candidate.role}-${plies}ply`, fields=candidate.after.split(':');
  fields[3]=String(-Number(fields[3]));
  const commands=['set sound enable off','set display off','set output digits 6','set output mwc off','set beavers 0',
    'set rollout players-are-same on',`set rollout chequerplay plies ${plies}`,'set rollout chequerplay noise 0','set rollout chequerplay prune on',
    `set rollout cubedecision plies ${plies}`,'set rollout cubedecision noise 0','set rollout cubedecision prune on',
    'set rollout cubeful on','set rollout quasirandom off','set rollout varredn on','set rollout truncation enable off',
    'set rollout later enable off','set rollout limit enable off','set rollout jsd stop off','set rollout initial off',
    'set rollout rng isaac',`set rollout seed ${seed}`,`set rollout trials ${trials}`,
    `set xgid ${fields.join(':')}`,...(cacheDisabled?['set cache 0']:[]),'show jacoby','show rollout','rollout','quit'];
  const commandFile=path.join(work,id+'.commands');fs.writeFileSync(commandFile,commands.join('\n')+'\n');
  let initialCubeCheck=null;
  if(plies===2){
    const cubeFile=path.join(work,id+'.cube.commands');
    fs.writeFileSync(cubeFile,[...commands.slice(0,-2),'set evaluation cubedecision evaluation plies 2','hint','quit'].join('\n')+'\n');
    const cubeOutput=execFileSync(binary,['-t','-q','-r','-P',dataDir,'-s',work,'-c',cubeFile],{encoding:'utf8',timeout:60000});
    if(!/Proper cube action: No double, take/.test(cubeOutput))throw Error('Initial cube equivalence not established');
    initialCubeCheck={action:'No double, take',equity:Number(cubeOutput.match(/No double\s+([+\-\d.]+)/)[1]),outputSHA256:hash(cubeOutput)};
    fs.writeFileSync(path.join(work,id+'.cube.txt'),cubeOutput);
  }
  const output=execFileSync('python3',['-c',ptyScript,binary,'-t','-q','-r','-P',dataDir,'-s',work,'-c',commandFile],{encoding:'utf8',timeout:60000});
  fs.writeFileSync(path.join(work,id+'.txt'),output);
  const pattern=/Current Position:\s*([\d.]+) ([\d.]+) ([\d.]+) - ([\d.]+) ([\d.]+) ([\d.]+) CL ([+\-\d.]+) CF ([+\-\d.]+)\s*\[([\d.]+) ([\d.]+) ([\d.]+) - ([\d.]+) ([\d.]+) ([\d.]+) CL\s+([\d.]+) CF\s+([\d.]+)\]/g;
  const parsed=[...output.matchAll(pattern)].at(-1);
  if(!parsed||!/2 games, ISAAC dice generator with seed 31811004/.test(output)||!/This money session is played with the Jacoby rule/.test(output))
    throw Error('Missing final official settings/result: '+id);
  if(cacheDisabled&&!/position cache has been sized to 0 entries/.test(output))throw Error('CLI cache was not disabled');
  const numbers=parsed.slice(1).map(Number);
  const upstream={equity:-numbers[7],cubeless:-numbers[6],probabilities:[numbers[3],numbers[4],numbers[5],numbers[1],numbers[2]],standardError:numbers[15]};
  const input=[candidate.original,candidate.after,trials,seed,plies,plies,0,0,plies,plies,plies,0,0,Math.max(0,plies-1),0].join('\t')+'\n';
  const nativeOutput=execFileSync(nativeBinary,[],{cwd:native,input,encoding:'utf8',timeout:60000});
  fs.writeFileSync(path.join(work,id+'.native.txt'),nativeOutput);
  const value=JSON.parse(nativeOutput.split('\n').find(line=>line.startsWith('{')));
  if(value.error||value.samples!==trials)throw Error('Invalid native response');
  if(plies===2 && !cacheDisabled && JSON.stringify(value)!==JSON.stringify(fixture.cases.find(c=>c.name===candidate.role+'|legacy').value))
    throw Error('Frozen smoke result no longer reproduces');
  results.push({id,original:candidate.original,after:candidate.after,cliAfter:fields.join(':'),plies,vrPlies:Math.max(0,plies-1),initialCubeCheck,
    upstream,native:value,equityDifference:value.equity-upstream.equity,cubelessDifference:value.cubeless-upstream.cubeless,
    maxProbabilityDifference:Math.max(...value.probabilities.map((n,i)=>Math.abs(n-upstream.probabilities[i]))),
    outputSHA256:hash(output),nativeOutputSHA256:hash(nativeOutput)});
  console.log(`${id}: official ${upstream.equity}; native ${value.equity}; difference ${results.at(-1).equityDifference}`);
}
const report={schema:1,recordedAt:new Date().toISOString(),seed,trialsPerCase:trials,excludedFromStudy:true,cacheDisabled,harness,
  method:'Deterministic path diagnostic, not an equity estimate or additional accuracy trials. Two fixed excluded-seed full games for each retained continuation at the recorded depths; ordinary cube, Jacoby, ISAAC, pruning, normal checker filters, variance reduction at checker depth minus one, no fixed cutoff or late weakening, exact bearoff allowed. Independent unmodified official GNUbg CLI versus the frozen local study executable or cache-disabled temporary harness. CLI runs the after-position with the opponent on roll; output is inverted to the original player. Both executables start fresh for every case. With normal cache settings, frozen 2-ply results must reproduce the existing smoke fixture exactly.',
  limitations:['Standalone CLI rollout skips the initial cube decision; ScoreMoveRollout permits it. Separate 2-ply hints for both positions say no double, but evaluator/cache call order can differ.',
    'The fork includes cache-key fixes and deterministic move tie ordering absent upstream; these can change individual seeded paths. A mismatch does not by itself prove a port defect or mean equity bias.',
    'CLI is scalar x86_64 under Rosetta; the frozen local executable is ARM64. Floating-point differences can alter tied or near-tied later choices.',
    'The displayed official probabilities and equities are rounded to six decimal places. These tiny validation samples cannot assess XG agreement or the 0.005 equity target.'],
  cacheMethod:cacheDisabled?'Both ordinary evaluation caches disabled; the pruning neural-net cache is unchanged. CLI uses set cache 0. Temporary native harness calls EvalCacheResize(0) and verifies GetEvalCacheEntries()==0; all engine objects are unchanged.':'Each executable uses its default/frozen cache settings and key semantics.',
  binarySHA256:fileHash(binary),nativeSHA256:fileHash(nativeBinary),frozenNativeSHA256:fileHash(path.join(native,'gnubg-core')),scriptSHA256:fileHash(fileURLToPath(import.meta.url)),
  inputsSHA256:fileHash(planFile),dataFiles:Object.fromEntries(['gnubg.wd','gnubg.weights','gnubg_os0.bd','gnubg_ts0.bd','met/Kazaross-XG2.xml'].map(f=>[f,fileHash(path.join(dataDir,f))])),results};
fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({destination,logs:work}));
