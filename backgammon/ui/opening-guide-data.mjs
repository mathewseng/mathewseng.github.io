// SPDX-License-Identifier: GPL-3.0-or-later
import { initialState, commitTurn } from '../core/rules.mjs';
import { presentMove } from '../core/move-presentation.mjs';
import { bookResult, bookBoardKey, BOOK_ID, BOOK_ENGINE_VERSION } from '../engine/opening-book.mjs';

export const OPENING_ROLLS = Array.from({length:6}, (_, i) => i + 1)
  .flatMap(a => Array.from({length:a - 1}, (_, i) => `${a}${i + 1}`));
export const REPLY_ROLLS = Array.from({length:6}, (_, i) => i + 1)
  .flatMap(a => Array.from({length:a}, (_, i) => `${a}${i + 1}`));
const base = new URL('../engine/opening-book-data/', import.meta.url);

// This guide uses exactly the book's rules and scores, independently of the
// user's live table settings. It never starts an engine or changes a match.
export function openingState(roll) {
  if (!OPENING_ROLLS.includes(roll)) throw Error('Choose two different opening dice.');
  return initialState({phase:'move', dice:[...roll].map(Number), matchLength:0,
    rules:{cube:true,jacoby:true,immediateRedoubles:0}});
}

function position(state, entry, index) {
  const result = bookResult(state, entry, index, 'expert');
  const best = result.candidates[0].equity;
  const moves = result.candidates.filter(c => best - c.equity <= index.threshold + 1e-8)
    .map(c => ({...c, ...presentMove(state,c.steps), loss:Math.max(0,best-c.equity)}));
  return {state, moves, threshold:index.threshold, plies:result.settings.plies,
    total:result.candidates.length, screened:!!result.screening};
}

export function buildOpenings(index) {
  if (!Number.isFinite(index?.threshold) || index.threshold <= 0 || index.threshold > .1)
    throw Error('Invalid opening-book comparison window.');
  return new Map(OPENING_ROLLS.map(roll => [roll,
    position(openingState(roll),index.openings?.[roll],index)]));
}

export class OpeningGuideData {
  constructor(fetcher = (...args) => fetch(...args)) {
    this.fetcher = fetcher;
    this.files = new Map();
    this.positions = new Map();
  }
  read(file) {
    if (this.files.has(file)) return this.files.get(file);
    const pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(),20000);
      try {
        const response = await this.fetcher(new URL(file,base),{signal:controller.signal});
        if (!response.ok) throw Error('Opening book unavailable.');
        const text = await response.text();
        if (text.length > 2_000_000) throw Error('Invalid opening-book file.');
        const data = JSON.parse(text);
        if (data.schema !== 1 || data.id !== BOOK_ID || data.engine !== BOOK_ENGINE_VERSION)
          throw Error('Opening book version mismatch.');
        return data;
      } finally { clearTimeout(timer); }
    })();
    this.files.set(file,pending);
    pending.catch(() => {
      if (this.files.get(file)===pending) this.files.delete(file);
    }); // Retry must make a fresh request; an old failure cannot evict a newer fetch.
    while (this.files.size > 10) this.files.delete([...this.files.keys()].find(k => k !== 'index.json' && k !== file));
    return pending;
  }
  async openings() {
    this.index = await this.read('index.json');
    try { return buildOpenings(this.index); }
    catch (error) { this.files.delete('index.json'); throw error; }
  }
  async reply(opening, choice, roll, player=1) {
    if (!this.index || !REPLY_ROLLS.includes(roll) || !opening.moves[choice] || ![0,1].includes(player))
      throw Error('Choose an opening and reply roll.');
    const after = commitTurn(opening.state,opening.moves[choice].steps);
    // The book is color-symmetric. Mirror the actual position (not just the
    // view) so previews and Solver exports agree with the chosen replying side.
    const state = {...after, ...(player===0 ? {
      points:after.points.toReversed().map(n=>-n),bar:after.bar.toReversed(),
      off:after.off.toReversed(),scores:after.scores.toReversed(),
    } : {}), turn:player, phase:'move',dice:[...roll].map(Number)};
    const key = bookBoardKey(state), id = `${key}:${roll}:${player}`;
    if (this.positions.has(id)) return this.positions.get(id);
    const ref = this.index.replies?.[key];
    if (!ref || !/^reply-[a-f0-9]{16}\.json$/.test(ref.file))
      throw Error('This opening has no reply book.');
    const shard = await this.read(ref.file);
    let result;
    try {
      if (shard.board !== key) throw Error('Reply position mismatch.');
      result = position(state,shard.rolls?.[roll],this.index);
    } catch (error) { this.files.delete(ref.file); throw error; }
    if (this.positions.size >= 42) this.positions.delete(this.positions.keys().next().value);
    this.positions.set(id,result);
    return result;
  }
  async replies(opening, choice, player=0) {
    return new Map(await Promise.all(REPLY_ROLLS.map(async roll=>
      [roll,await this.reply(opening,choice,roll,player)])));
  }
}

// Describe visible changes, not speculative strategic reasons for a ranking.
export function openingSummary(position, choice) {
  const {state,moves} = position, move = moves[choice];
  const after = commitTurn(state,move.steps), player = state.turn;
  const count = (s,p) => Math.max(0,s.points[player ? 23-p : p] * (player ? -1 : 1));
  const made=Array.from({length:24},(_,p)=>p).filter(p=>count(state,p)<2&&count(after,p)>=2);
  const anchors=made.filter(p=>p>=18), points=made.filter(p=>p<18);
  const hits=after.bar[1-player]-state.bar[1-player];
  const features=[];
  if(hits>0)features.push({kind:'hit',label:hits>1?'Hit twice':'Hit',description:hits>1?'Hit two blots.':'Hit a blot.'});
  if(anchors.length){
    const p=anchors[0],number=24-p;
    features.push({kind:'anchor',label:`${number}-anchor`,description:`Make an anchor on the opponent’s ${number}-point (your ${p+1}-point).`});
  }
  if(points.length){
    const names=points.map(p=>p===6?'bar point':`${p+1}-point`);
    features.push({kind:'point',label:points.length>1?'Make points':`Make ${points[0]===6?'bar':`${points[0]+1}-point`}`,
      description:`Make your ${names.join(' and ')}.`});
  }
  // Compact notation describes whole checker journeys, including combined dice.
  const journeys=move.notation.split(' ').map(token=>token.replace(/\(\d+\)$/,'').split('/').map(p=>Number(p.replace('*',''))));
  const back=journeys.filter(j=>j[0]>=18&&!made.includes(j.at(-1)-1));
  if(!anchors.length&&back.length){
    const run=back.some(j=>j.at(-1)<=17);
    features.push({kind:run?'run':'split',label:run?'Run':'Split',description:run
      ? (back.some(j=>j.at(-1)===13)?'Run to the midpoint.':'Run a back checker.')
      : 'Split your back checkers.'});
  }
  if(!count(state,4)&&count(after,4)===1)features.push({kind:'slot',label:'Slot 5',description:'Slot your 5-point.'});
  const builders = count(state,12)-count(after,12);
  if(!points.length&&builders>0)features.push({kind:'build',label:builders>1?'Build':'Builder',
    description:builders>1?'Bring two builders down.':'Bring a builder down.'});
  if(!features.length)features.push({kind:'develop',label:'Develop',description:'Develop your checkers.'});
  return {kind:features[0].kind,label:features.slice(0,2).map(f=>f.label).join(' + '),description:features.map(f=>f.description).join(' ')};
}
export const openingIdea=(position,choice)=>openingSummary(position,choice).description;

export function previewPosition(position, choice) {
  const move = position.moves[choice];
  const state = commitTurn(position.state,move.steps);
  // Keep the mover and rolled dice in this presentation-only frame.
  return {...state,turn:position.state.turn,dice:position.state.dice,phase:'move'};
}
