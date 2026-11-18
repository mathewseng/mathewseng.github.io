#!/usr/bin/env node
/** Reconstruct legal checker decisions and score them with the site's exact GNUbg engine. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { artifactDir, solverUrl } from "../project_paths.mjs";
const { initialState, boardKey, legalTurns, pipCount, transition, notation, commitTurn } = await import(solverUrl("backgammon/core/rules.mjs"));
const { toXGID } = await import(solverUrl("backgammon/core/xgid.mjs"));
const { createEvaluator } = await import(solverUrl("backgammon/engine/evaluate.mjs"));
const { default: engineFactory } = await import(solverUrl("backgammon/engine/vendor/simd/gnubg-core-module.js"));

const directory = path.join(artifactDir, "v2");
const engineDir = solverUrl("backgammon/engine/vendor/");
const read = (name) => fs.readFileSync(new URL(name,engineDir));
const plays = [];
for (let high=1; high<=6; high++) {
  for (let low=1; low<=high; low++) plays.push([low,high]);
}
const playerName = ['white','dark'];
const boardCache = new Map();
const transitionCache = new WeakMap();

export async function loadEvaluator() {
  const packed = read('gnubg-core-module.data');
  const data = packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength);
  const compiled = await WebAssembly.compile(read('simd/gnubg-core-module.wasm'));
  const module = await engineFactory({
    getPreloadedPackage: () => data,
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(compiled,imports);
      receive(instance,compiled);
      return instance.exports;
    },
    print: () => {},
    printErr: (value) => process.stderr.write(value+'\n'),
  });
  const evaluator=createEvaluator(module);
  const score=module.cwrap('bg_score','number',['string','string','number','number']);
  const value=module.cwrap('bg_value','number',['string','number','number']);
  function run(fn,args) {
    const ptr=fn(...args);
    if (!ptr) throw new Error('The site engine returned no evaluation.');
    try {
      const result=JSON.parse(module.UTF8ToString(ptr));
      if (result.error) throw new Error(result.error);
      if (!Number.isFinite(result.equity)||!result.probabilities?.every(Number.isFinite))
        throw new Error('Invalid native engine scores');
      return result;
    } finally { module._free(ptr); }
  }
  evaluator.fullScore=(input,output,plies)=>run(score,[input,output,plies,0]);
  evaluator.positionValue=(input,plies)=>run(value,[input,plies,0]);
  return evaluator;
}

export function stateFor(position, turn, dice, cube = null) {
  const centeredAtOne = cube?.stake === 1 && cube?.side === 'centered';
  return initialState({
    points:position.points.map(([white,dark]) => white-dark),
    bar:position.bar, off:position.borneOff, turn, dice,
    phase:'move', matchLength:0,
    cube:{value:1,owner:null},
    rules:{cube:centeredAtOne,jacoby:false,immediateRedoubles:0},
  });
}

export function okay(position) {
  // Legal standard bearing off cannot begin while the side has a checker
  // outside its home board or on the bar. Later hits can return it to the bar.
  // Points and trays have already been checked against total counts upstream.
  if (!position || position.borneOff.some(count => count===15)) return false;
  try { stateFor(position,0,[1,2]); return true; }
  catch { return false; }
}

export function rowsFrom(file) {
  return gunzipSync(fs.readFileSync(file)).toString('utf8')
    .trim().split('\n').map(s => JSON.parse(s));
}

function stablePositions(rows) {
  const segments = [];
  let active = null;
  const close = () => {
    if (active && active.end-active.start>=.20 && active.frames>=6) {
      const previous = segments.at(-1);
      if (previous && previous.key===active.key && active.start-previous.end<2.5) {
        previous.end=active.end;
        previous.frames+=active.frames;
      } else segments.push(active);
    }
    active=null;
  };
  for (const row of rows) {
    const state=row.state, position=state?.position;
    if (!position) {
      if (active && row.seconds-active.end>.22) close();
      continue;
    }
    if (state.checkerStatus==='inferred-tray' && !okay(position)) continue;
    const key=JSON.stringify(position);
    if (active?.key!==key) {
      close();
      if (!okay(position)) continue;
      const engineState=stateFor(position,0,[1,2]);
      active={key,position,start:row.seconds,end:row.seconds,frames:0,
        pips:[pipCount(engineState,0),pipCount(engineState,1)],
        representative:row.frame};
    }
    active.end=row.seconds;
    active.frames++;
  }
  close();
  return segments;
}

function settledRolls(rows) {
  const rolls=[];
  let active=null;
  const close=()=> {
    if (active && active.count>=2) {
      active.color=[...active.colors.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
      delete active.colors;
      rolls.push(active);
    }
    active=null;
  };
  for (const row of rows) {
    const s=row.state, reading=s?.currentRoll;
    if (!reading) {
      if (active && row.seconds-active.end>.65) close();
      continue;
    }
    const ordered=[...s.dice].sort((a,b)=>a.value-b.value || a.center[0]-b.center[0] || a.center[1]-b.center[1]);
    const agree=active && reading.every((x,i)=>x===active.dice[i]) && ordered.every((d,i)=>
      Math.hypot(d.center[0]-active.centers[i][0],d.center[1]-active.centers[i][1])<=14);
    if (!agree) {
      close();
      active={start:row.seconds,end:row.seconds,frame:row.frame,dice:reading,count:0,
        centers:ordered.map(d=>d.center),colors:new Map()};
    }
    active.end=row.seconds;
    active.count++;
    if (ordered.every(d=>d.color===ordered[0].color)) {
      const color=ordered[0].color;
      active.colors.set(color,(active.colors.get(color)||0)+1);
    }
  }
  close();
  return rolls;
}


function temporalRolls(rows, strong) {
  const live=[], finished=[];
  for (const row of rows) {
    for (let index=live.length-1;index>=0;index--) {
      if (row.seconds-live[index].end>.32) finished.push(...live.splice(index,1));
    }
    const assigned=new Set();
    for (const d of [...(row.state?.dice || [])].sort((a,b)=>b.score-a.score)) {
      if (d.score<.53 || d.locationScore<.14) continue;
      const [x,y]=d.center;
      const track=live.find(t=>!assigned.has(t) && Math.hypot(t.x-x,t.y-y)<=8);
      const item=track || {x,y,start:row.seconds,end:row.seconds,frame:row.frame,
        count:0,faces:[0,0,0,0,0,0,0],color:{white:0,dark:0},highest:0};
      if (!track) live.push(item);
      item.end=row.seconds;
      item.count++;
      item.faces[d.candidateValue]+=d.score*d.score;
      item.color[d.color]++;
      item.highest=Math.max(item.highest,d.score);
      assigned.add(item);
    }
  }
  finished.push(...live);
  const good=finished.filter(t=>t.count>=6 && t.end-t.start>=.25 && t.end-t.start<=25 && t.highest>=.68);
  for (const t of good) {
    const vote=t.faces.map((weight,face)=>({weight,face})).sort((a,b)=>b.weight-a.weight);
    t.face=vote[0].face;
    t.share=vote[0].weight / t.faces.reduce((a,b)=>a+b,0);
    t.dominantColor=t.color.white>=t.color.dark?'white':'dark';
  }
  const alternatives=[];
  for (let i=0;i<good.length;i++) for (const b of good.slice(i+1)) {
    const a=good[i],start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);
    if (end-start<.28 || Math.hypot(a.x-b.x,a.y-b.y)<15 || Math.abs(a.start-b.start)>1.4 ||
        a.share<.71 || b.share<.71) continue;
    if (strong.some(t=>t.start<end+.25 && t.end>start-.25)) continue;
    const dice=[a.face,b.face].sort((x,y)=>x-y);
    const confidence=Math.min(a.share,b.share);
    alternatives.push({start,end,frame:Math.max(a.frame,b.frame),dice,count:Math.min(a.count,b.count),
      centers:[[a.x,a.y],[b.x,b.y]],color:a.dominantColor===b.dominantColor?a.dominantColor:null,
      quality:confidence,evidence:'two-stable-die-tracks'});
  }
  const chosen=[];
  for (const roll of alternatives.sort((a,b)=>b.quality-a.quality || b.count-a.count))
    if (!chosen.some(s=>s.start<roll.end+.20 && s.end>roll.start-.20)) chosen.push(roll);
  return chosen;
}

function boardTurns(segment, player, dice) {
  const cacheKey=[segment.key,player,...dice].join('|');
  if (!boardCache.has(cacheKey)) {
    const start=stateFor(segment.position,player,dice);
    boardCache.set(cacheKey,new Map(legalTurns(start).map(t=>[t.key,t.steps])));
  }
  return boardCache.get(cacheKey);
}

function boardKeyFor(segment) {
  if (!transitionCache.has(segment)) transitionCache.set(segment,boardKey(stateFor(segment.position,0,[1,2])));
  return transitionCache.get(segment);
}

function supportsTransition(before, after, player, dice) {
  if (before.key===after.key) return false;
  const other=1-player, pips=before.pips[player]-after.pips[player];
  if (pips<=0 || after.pips[other]<before.pips[other] ||
      before.position.borneOff.some((n,p)=>after.position.borneOff[p]<n) ||
      before.position.borneOff[other]!==after.position.borneOff[other]) return false;
  const [a,b]=dice, max=a===b?a*4:a+b;
  if (pips>max) return false;
  if (after.position.borneOff[player]===before.position.borneOff[player]) {
    if (a===b ? pips%a!==0 : ![a,b,a+b].includes(pips)) return false;
  }
  return true;
}

export function matchingTurns(before, after, diceList, knownPlayer=null) {
  const key=boardKeyFor(after), matches=[];
  for (const player of knownPlayer===null?[0,1]:[knownPlayer]) {
    for (const dice of diceList) {
      if (!supportsTransition(before,after,player,dice)) continue;
      const steps=boardTurns(before,player,dice).get(key);
      if (steps?.length) matches.push({player,dice,steps,after});
    }
  }
  return matches;
}

function cubeAt(rows, before, at) {
  const known=new Map();
  for (const row of rows) {
    if (row.seconds<Math.max(before.start,at-2.5)) continue;
    if (row.seconds>at+1.1) break;
    const c=row.state?.cube;
    if (!c?.stake || c.side==='playing-surface') continue;
    const key=[c.stake,c.side].join('|');
    const saved=known.get(key);
    if (saved) saved.count++;
    else known.set(key,{stake:c.stake,side:c.side,face:c.face,count:1});
  }
  const best=[...known.values()].sort((a,b)=>b.count-a.count)[0];
  return best?.count>=4 ? best : null;
}

function prepClip(rows) {
  const segments=stablePositions(rows);
  const direct=settledRolls(rows).map(r=>({...r,evidence:'visible-settled-roll'}));
  const rolls=[...direct,...temporalRolls(rows,direct)].sort((a,b)=>a.start-b.start);
  const exact=[];
  for (const roll of rolls) {
    const preCandidates=segments.filter(s=>s.start<=roll.start+.18 && s.end>=roll.start-2.5);
    const before=preCandidates.at(-1);
    if (!before) { exact.push({roll,reason:'no-stable-pre-move-board'}); continue; }
    const nextRoll=rolls.find(r=>r.start>roll.end+.55 && r.start-roll.end<12);
    const until=Math.min(roll.end+3.4,nextRoll?.start ?? Infinity,roll.start+19);
    const following=segments.filter(s=>s.start>before.start && s.start>=roll.start-.2 && s.start<=until);
    const matches=[];
    for (const origin of preCandidates.slice(-2)) for (const after of following) {
      const options=matchingTurns(origin,after,[roll.dice]);
      if (options.length===1) matches.push({...options[0],before:origin});
    }
    const uniquePlayer = new Set(matches.map(m=>m.player)).size===1;
    const matched = uniquePlayer ? matches.sort((a,b)=>b.after.start-a.after.start || b.before.end-a.before.end)[0] : null;
    exact.push({roll,before:matched?.before ?? before,matched,following,
      reason:matched?null:'no-matching-completed-move'});
  }
  return {rows,segments,rolls,exact};
}

function inferredColorMap(clipData) {
  const quality=new Map();
  for (const clip of clipData) for (const c of clip.exact) {
    if (!c.matched || !c.roll.color) continue;
    const color=c.roll.color;
    const counts=quality.get(color)||[0,0];
    counts[c.matched.player]++;
    quality.set(color,counts);
  }
  const result={};
  for (const [color,[a,b]] of quality) {
    if (a+b>=5 && Math.max(a,b)/(a+b)>=.90) result[color]=a>b?0:1;
  }
  return {result,counts:Object.fromEntries(quality)};
}

function candidateDiceEvidence(rows, start, end) {
  const votes=[0,0,0,0,0,0,0];
  for (const row of rows) {
    if (row.seconds<start) continue;
    if (row.seconds>end) break;
    const seen=new Set((row.state?.dice || [])
      .filter(d=>d.score>=.69 && d.locationScore>=.14).map(d=>d.candidateValue));
    for (const value of seen) votes[value]++;
  }
  return votes;
}

function reconstruct(clip,colorMap) {
  boardCache.clear();
  const decisions=[], skips=[], conditional=[];
  for (const c of clip.exact) {
    const {roll,before,matched}=c;
    if (matched) {
      decisions.push({start:Math.max(before.start,roll.start-.20),end:Math.max(roll.end,matched.after.start)+.75,
        rollStart:roll.start,before,after:matched.after,dice:roll.dice,player:matched.player,
        steps:matched.steps, evidence:roll.evidence==='visible-settled-roll'?'visible-roll-and-legal-observed-result':'temporal-roll-and-legal-observed-result'});
    } else if (before && Object.hasOwn(colorMap,roll.color) && c.following.length===0) {
      const player=colorMap[roll.color];
      const legal=boardTurns(before,player,roll.dice);
      decisions.push({start:Math.max(before.start,roll.start-.20),end:roll.end+.50,
        rollStart:roll.start,before,dice:roll.dice,player,
        steps:legal.size===1 && legal.values().next().value?.length===0 ? [] : null,
        evidence:'visible-roll-and-validated-dice-color'});
    } else if (before && roll.count>=5 && roll.end-roll.start>=.28) {
      conditional.push({start:Math.max(before.start,roll.start-.15),end:roll.end+.55,
        rollStart:roll.start,before,dice:roll.dice,steps:null,reason:'mover-or-completed-turn-unresolved',
        evidence:roll.evidence});
    } else skips.push({start:roll.start,end:roll.end,dice:roll.dice,reason:c.reason});
  }
  const overlaps=(a,b)=>decisions.some(d=>d.start<=b && d.end>=a);
  // For unreadable faces use the site's complete legal move generator. Require
  // one compatible roll AND evidence of at least one die across repeated
  // frames. Reserve ambiguous or fragmented turns instead of grading them.
  const segments=clip.segments;
  for (let i=0;i+1<segments.length;i++) {
    const before=segments[i], next=segments[i+1];
    if (next.start-before.end>4.0 || overlaps(before.end-.25,next.start+.25)) continue;
    if (before.end-before.start<.40 || before.frames<10) continue;
    const vote=candidateDiceEvidence(clip.rows,Math.max(before.start,before.end-2.7),next.start);
    if (Math.max(...vote)<5) continue;
    const rolls=plays.filter(d=>d.some(v=>vote[v]>=5));
    const possible=matchingTurns(before,next,rolls);
    if (possible.length!==1) continue;
    const p=possible[0];
    if (next.end-next.start<.70 || next.frames<18) continue;
    const future=segments[i+2];
    // A brief one-step hold followed by another forward move from the same
    // color can be mid-turn. Leave it to the visible-roll pass above.
    if (future && future.start-next.end<1.4 && future.pips[p.player]<next.pips[p.player] &&
        future.pips[1-p.player]>=next.pips[1-p.player]) continue;
    decisions.push({start:Math.max(before.start,before.end-1.7),end:next.start+.7,
      rollStart:null,before,after:next,dice:p.dice,player:p.player,steps:p.steps,
      evidence:'unique-legal-roll-with-partial-dice-evidence'});
  }
  decisions.sort((a,b)=>a.start-b.start);
  const seen=new Set();
  return {decisions:decisions.filter(d=>{
    const key=[d.before.representative,d.player,d.dice,d.after?.key].join('|');
    if (seen.has(key)) return false;
    seen.add(key);return true;
  }),conditional:conditional.filter(c=>!overlaps(c.start,c.end)),
    skips:skips.filter(skip=>!overlaps(skip.start,skip.end))};
}

function exclusive(probabilities) {
  const [win,winG,winBg,loseG,loseBg]=probabilities;
  return {
    winSingle:Math.max(0,win-winG), winGammon:Math.max(0,winG-winBg), winBackgammon:Math.max(0,winBg),
    loseSingle:Math.max(0,1-win-loseG), loseGammon:Math.max(0,loseG-loseBg), loseBackgammon:Math.max(0,loseBg),
  };
}

function compact(candidate) {
  return candidate && {
    notation:candidate.notation,steps:candidate.steps,equity:candidate.equity,
    outcomeProbabilities:exclusive(candidate.probabilities),rawProbabilities:candidate.probabilities,
  };
}

export function evaluateDecision(analysis, d, clip, preset, cubeOverride) {
  const at=d.rollStart ?? d.before.end;
  const cube=cubeOverride===undefined?cubeAt(clip.rows,d.before,at):cubeOverride;
  const board=stateFor(d.before.position,d.player,d.dice,cube);
  const xgid=toXGID(board,{engine:true});
  const submitted=d.steps===null || d.steps===undefined ? null : boardKey(commitTurn(board,d.steps));
  const candidateTurns=legalTurns(board);
  const candidates=candidateTurns.map((turn)=>{
    const after=toXGID({...turn.state,phase:'roll',dice:[]},{engine:true});
    const score=analysis.fullScore(xgid,after,3);
    return {key:turn.key, notation:notation(turn.steps,d.player), steps:turn.steps,
      xgid:after, equity3:score.equity,outcomeProbabilities3:exclusive(score.probabilities)};
  });
  candidates.sort((a,b)=>b.equity3-a.equity3);
  const finalists=candidates.filter((c,i)=>i<4 || c.key===submitted);
  for (const row of finalists) {
    const score=analysis.fullScore(xgid,row.xgid,4);
    row.equity4=score.equity;
    row.outcomeProbabilities4=exclusive(score.probabilities);
  }
  finalists.sort((a,b)=>b.equity4-a.equity4);
  const best=finalists[0];
  if (!best) throw new Error('No legal checker result');
  const played=finalists.find(r=>r.key===submitted) || null;
  const review=(r)=>r && {notation:r.notation,steps:r.steps,equity:r.equity4,
    outcomeProbabilities:r.outcomeProbabilities4};
  return {
    startSeconds:d.start,endSeconds:d.end,rollSettledSeconds:d.rollStart,
    preMoveFrame:d.before.representative,observedResultFrame:d.after?.representative ?? null,
    player:playerName[d.player],dice:d.dice,evidence:d.evidence,
    cube,context:board.rules.cube?'money-cube-centered-at-one':'cubeless-ownership-or-stake-unresolved',
    equityUnits:board.rules.cube?'normalized cube equity':'cubeless equity',
    xgid:toXGID(board),preset:{allActions:3,finalists:4}, best:review(best),played:review(played),
    evLoss:played ? Math.max(0,best.equity4-played.equity4) : null,
    legalCandidates:candidates.length, actions:candidates.map(r=>({...r,
      isBest:r.key===best.key,isPlayed:r.key===submitted}))
  };
}

const positionalCache = new Map();
export function positional(analysis, segment, preferred, rows, cubeOverride) {
  const known=cubeOverride===undefined?cubeAt(rows,segment,segment.start+.25):cubeOverride;
  const key=[segment.key,preferred,known?.stake,known?.side].join('|');
  if (positionalCache.has(key)) return positionalCache.get(key);
  const side=preferred===null?[0,1]:[preferred];
  const positions=side.map(turn=>{
    const b={...stateFor(segment.position,turn,[1,2],known),phase:'roll',dice:[]};
    const v=analysis.positionValue(toXGID(b,{engine:true}),3);
    const p=exclusive(v.probabilities);
    const sides=[{equity:v.equity,chances:[p.winSingle,p.winGammon,p.winBackgammon]},
                 {equity:-v.equity,chances:[p.loseSingle,p.loseGammon,p.loseBackgammon]}];
    return turn===0?sides:sides.reverse();
  });
  const value={turn:preferred===null?null:playerName[preferred],players:positions[0].map((p,i)=>{
    const other=positions[1]?.[i];
    return {equity:other?(p.equity+other.equity)/2:p.equity,
      chances:other?p.chances.map((j,k)=>(j+other.chances[k])/2):p.chances};
  })};
  positionalCache.set(key,value);
  return value;
}

function reviewedCube(analysis,preset) {
  const labelFile=path.join(directory,'../labels/cube-offer.json');
  const windowsFile=path.join(directory,'../review/cube-four-windows.json');
  if (!fs.existsSync(labelFile) || !fs.existsSync(windowsFile)) return null;
  const label = JSON.parse(fs.readFileSync(labelFile,'utf8'));
  const detections = JSON.parse(fs.readFileSync(windowsFile,'utf8'));
  const numbers = fs.readFileSync(path.join(directory,'../labels/checker-review.txt'),'utf8')
    .split('\n').find(line=>line.startsWith(label.positionImage+' '))?.split('|').map(s=>s.trim());
  if (!numbers) return null;
  const points=Array(24).fill(0);
  for(const [i,n] of numbers.slice(1,3).entries()) {
    for (const pair of n.split(' ')) {
      const [point,count]=pair.split(':').map(Number);
      points[point-1] = (i===0 ? 1 : -1)*count;
    }
  }
  const actor=playerName.indexOf(label.offerer);
  const state=initialState({points,bar:numbers[3].split(',').map(Number),off:[0,0],
    turn:actor,dice:[],phase:'roll',matchLength:0,
    cube:{value:label.preOfferStake,owner:actor},rules:{cube:true,jacoby:false,immediateRedoubles:0}});
  const result=analysis.analyze(state,preset,'cube');
  const offer=transition(state,{type:'double'},actor);
  const evaluatedReply=analysis.analyze(offer,preset,'cube');
  const [noDouble,take,pass]=result.outcomes;
  const offeredEquity=Math.min(take,pass);
  const recommendation=offeredEquity>=noDouble?'Redouble':'No redouble';
  const out={...label, engine:result.engine,preset:result.settings,equityUnits:'points per prior cube',
    position:{points:points.map(n=>[Math.max(n,0),Math.max(-n,0)]),bar:state.bar,borneOff:state.off},
    beforeXgid:toXGID(state),replyXgid:toXGID(offer),
    recommendation,bestReply:take<=pass?'Take':'Pass',equity:Math.max(noDouble,offeredEquity),
    offeredEquity,offerEvLoss:Math.max(0,noDouble-offeredEquity),
    replyEvLoss:null,outcomeProbabilities:exclusive(result.probabilities),
    options:{noDouble,take,pass},nativeResult:result.action,nativeReply:evaluatedReply.action};
  return {result:out,windows:label.sourceClips
    .filter(i=>detections[i])
    .map(i=>({clip:i,startSeconds:detections[i].first[1],endSeconds:Math.min(detections[i].last[1],label.reviewEndByClip?.[i] ?? Infinity)}))};
}

async function main() {
  const [startArg='1',stopArg='6']=process.argv.slice(2);
  const onlyPlan=process.env.OFFICE3_SOLVER_PLAN==='1';
  const analysis=onlyPlan?null:await loadEvaluator();
  const cube=onlyPlan?null:reviewedCube(analysis,'research');
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'timeline.json'),'utf8'));
  const games=manifest.games.filter(g=>g.number>=Number(startArg)&&g.number<Number(stopArg));
  const data=[];
  for (const game of games) {
    const rows=[];
    for (const section of game.segments) {
      const file=section.source.replace('.mp4','.jsonl.gz');
      const source=rowsFrom(path.join(directory,'state',file));
      for (const row of source.slice(section.firstFrame,section.lastExclusive)) {
        const frame=section.firstGameFrame+row.frame-section.firstFrame;
        rows.push({...row,sourceFrame:row.frame,sourceSeconds:row.seconds,frame,seconds:frame/25,
          boundary:section.discontinuity && row.frame===section.firstFrame});
      }
    }
    if (rows.length!==game.frames) throw new Error('Game input does not cover its timeline');
    const breaks=rows.filter(r=>r.boundary).map(r=>r.frame);
    // The solver may join ordinary neighboring clips, while recorder interruptions
    // divide the observation sequence. Original source timing is retained per row.
    const clips=[];
    let start=0;
    for (const end of [...breaks,rows.length]) {
      if (end>start) {
        boardCache.clear();
        clips.push(prepClip(rows.slice(start,end)));
      }
      start=end;
    }
    data.push({game,rows,clips});
  }
  const colorMap=inferredColorMap(data.flatMap(d=>d.clips));
  for (const entry of data) {
    const analyses=[], conditional=[], unresolved=[], positions=[];
    const {game,rows,clips}=entry;
    if (onlyPlan) {
      let decisions=0,conditional=0,actions=0,finalists=0,positions=0;
      for (const clip of clips) {
        const r=reconstruct(clip,colorMap.result);
        decisions+=r.decisions.length; conditional+=r.conditional.length; positions+=clip.segments.length;
        const choices=[...r.decisions,...r.conditional.flatMap(e=>[0,1].map(player=>({...e,player})))];
        for (const d of choices) {
          const slots=legalTurns(stateFor(d.before.position,d.player,d.dice));
          actions+=slots.length; finalists+=Math.min(4,slots.length)+Number(d.steps?.length>0);
        }
      }
      console.log(JSON.stringify({game:game.number,decisions,conditional,actions,finalists,positions}));
      continue;
    }
    console.log(JSON.stringify({game:game.number,status:'solving',frames:rows.length}),engineVersion(cube));
    for (const clip of clips) {
      const evidence=reconstruct(clip,colorMap.result);
      for (const item of evidence.decisions) {
        try { analyses.push(evaluateDecision(analysis,item,clip)); }
        catch (error) { unresolved.push({start:item.start,end:item.end,dice:item.dice,reason:error.message}); }
      }
      for (const item of evidence.conditional) {
        try {
          const byPlayer=[0,1].map(player=>evaluateDecision(analysis,{...item,player},clip));
          conditional.push({startSeconds:item.start,endSeconds:item.end,dice:item.dice,
            evidence:item.evidence,reason:item.reason,byPlayer});
        } catch (error) { unresolved.push({start:item.start,end:item.end,dice:item.dice,reason:error.message}); }
      }
      unresolved.push(...evidence.skips);
      for (const stable of clip.segments) {
        const match=analyses.find(d=>d.preMoveFrame===stable.representative || d.observedResultFrame===stable.representative);
        const player=match ? playerName.indexOf(match.player) : null;
        const mover=match?.observedResultFrame===stable.representative && player!==null?1-player:player;
        try { positions.push({startSeconds:stable.start,endSeconds:stable.end,frame:stable.representative,
          ...positional(analysis,stable,mover,clip.rows)}); }
        catch (e) { unresolved.push({start:stable.start,end:stable.end,reason:e.message}); }
      }
    }
    const reviewedCubeOffers=(cube?.windows || []).flatMap(part=> {
      const visible=rows.filter(r=>r.clip===part.clip && r.sourceSeconds>=part.startSeconds && r.sourceSeconds<=part.endSeconds);
      return visible.length?[{...cube.result,startSeconds:visible[0].seconds,endSeconds:visible.at(-1).seconds,
        startFrame:visible[0].frame,endFrame:visible.at(-1).frame}]:[];
    });
    const lossEvents=analyses.filter(d=>d.evLoss!==null).map(d=>({
      seconds:(d.observedResultFrame ?? Math.round(d.endSeconds*25))/25,player:d.player,loss:d.evLoss,kind:'checker'}));
    if (reviewedCubeOffers.length) {
      const first=reviewedCubeOffers[0];
      lossEvents.push({seconds:first.startSeconds,player:first.offerer,loss:first.offerEvLoss,kind:'cube'});
    }
    lossEvents.sort((a,b)=>a.seconds-b.seconds);
    const cumulative=Object.fromEntries(playerName.map(p=>[p,
      {loss:lossEvents.filter(e=>e.player===p).reduce((s,e)=>s+e.loss,0),
       graded:lossEvents.filter(e=>e.player===p).length}]));
    const stage=path.join(directory,`game-${game.number}-analysis.part.json`);
    const result={...game,sourceSite:'https://mathewseng.github.io/backgammon/solver/',
      revision:fs.readFileSync(path.join(directory,'../site-solver/revision.txt'),'utf8').trim(),
      analyses,conditional,unresolved,reviewedCubeOffers,positions,lossEvents,cumulative,diceColorAgreement:colorMap};
    fs.writeFileSync(stage,JSON.stringify(result,null,2)+'\n');
    fs.renameSync(stage,path.join(directory,`game-${game.number}-analysis.json`));
    console.log(JSON.stringify({game:game.number,status:'scored',decisions:analyses.length,conditional:conditional.length,
      unresolved:unresolved.length,positions:positions.length,lossEvents:lossEvents.length}));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

function engineVersion(cube) { return cube?.result?.engine || ''; }
