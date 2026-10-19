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
  async reply(opening, choice, roll) {
    if (!this.index || !REPLY_ROLLS.includes(roll) || !opening.moves[choice])
      throw Error('Choose an opening and reply roll.');
    const after = commitTurn(opening.state,opening.moves[choice].steps);
    const state = {...after, turn:1-opening.state.turn, phase:'move',dice:[...roll].map(Number)};
    const key = bookBoardKey(state), id = `${key}:${roll}`;
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
}

// Describe visible changes, not speculative strategic reasons for a ranking.
export function openingIdea(position, choice) {
  const {state,moves} = position, move = moves[choice];
  const after = commitTurn(state,move.steps), player = state.turn;
  if (after.bar[1-player] > state.bar[1-player]) return 'Hit a blot.';
  const count = (s,p) => Math.max(0,s.points[player ? 23-p : p] * (player ? -1 : 1));
  for (const p of [4,3,2,6,5,1,0])
    if (count(state,p)<2 && count(after,p)>=2) return `Make your ${p===6 ? 'bar point' : `${p+1}-point`}.`;
  if (count(after,23)<count(state,23)) {
    if (move.notation.includes('24/13')) return 'Run to the midpoint.';
    if (move.steps.some(s => (player ? 23-s.from : s.from) === 12)) return 'Split the back checkers and bring a builder down.';
    return move.notation.match(/24\/(2[0-3]|19|18)/) ? 'Split your back checkers.' : 'Run a back checker.';
  }
  if (!count(state,4) && count(after,4)===1) return 'Slot your 5-point.';
  const builders = count(state,12)-count(after,12);
  if (builders>0) return builders>1 ? 'Bring two builders down.' : 'Bring a builder down.';
  return move.notation;
}

export function previewPosition(position, choice) {
  const move = position.moves[choice];
  const state = commitTurn(position.state,move.steps);
  // Keep the mover and rolled dice in this presentation-only frame.
  return {...state,turn:position.state.turn,dice:position.state.dice,phase:'move'};
}
