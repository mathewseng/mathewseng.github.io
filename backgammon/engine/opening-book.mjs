// SPDX-License-Identifier: GPL-3.0-or-later
import { assertState, initialState, boardKey, positionKey, commitTurn, legalPaths, notation } from '../core/rules.mjs';
export const BOOK_ID = 'jacoby-3ply-v3';
// Keep historical evaluations labeled with the engine that computed them.
// bg6 is an implementation optimization, verified against this same bg5 core.
export const BOOK_ENGINE_VERSION = 'gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg5';
const START_STATE = initialState({ matchLength: 0 });
const START = boardKey(START_STATE);
const BASE = new URL('./opening-book-data/', import.meta.url);
const mirrorPoint = point => typeof point === 'number' ? 23 - point : point;
export const bookBoardKey = state => boardKey(state.turn === 0 ? state : {
  points: [...state.points].reverse().map(v => -v),
  bar: [...state.bar].reverse(), off: [...state.off].reverse(),
});
// Money-session scores and the number of earlier opening ties do not enter
// GNUbg's checker evaluation. Centered money-cube equity is in current-cube
// units, so its absolute value is scale invariant (verified against real WASM).
// Match scores, Jacoby, ownership and immediate-redouble rules are NOT aliases.
export function bookContext(state) {
  return state?.matchLength === 0 && state.rules?.cube === true &&
    state.rules.jacoby === true && !state.rules.immediateRedoubles &&
    state.cube?.owner === null && !state.pending && !state.crawford &&
    !state.crawfordPlayed && ['opening', 'roll', 'move'].includes(state.phase);
}
export function bookEligible(state, { preset, kind, rollout, useBook = true } = {}) {
  return useBook && !rollout && kind === 'checker' && state.phase === 'move' &&
    ['auto', 'quick', 'standard', 'deep', 'expert'].includes(preset) && bookContext(state);
}
function validateHeader(value) {
  if (value?.schema !== 1 || value.id !== BOOK_ID || value.engine !== BOOK_ENGINE_VERSION)
    throw new Error('Opening book version mismatch.');
  return value;
}
export function bookResult(state, entry, index, requestedPreset, submitted = null) {
  assertState(state); validateHeader(index);
  if (!bookContext(state) || state.phase !== 'move' || index.plies !== 3 ||
      !Array.isArray(entry?.rows) || !entry.rows.length || entry.rows.length > 2000 ||
      !Number.isInteger(entry.total) || entry.total < entry.rows.length)
    throw new Error('Invalid opening book position or entry.');
  const started = performance.now(), seen = new Set();
  const pathKey = steps => JSON.stringify(steps.map(({from, to, die}) => [from, to, die]));
  const paths = new Map(legalPaths(state).map(path => [pathKey(path.steps), path.state]));
  const candidates = entry.rows.map(row => {
    if (!Array.isArray(row) || row.length !== 8 ||
        !row.slice(1).every(Number.isFinite) ||
        row.slice(3).some(v => v < 0 || v > 1) ||
        !Array.isArray(row[0]) || row[0].length > 4)
      throw new Error('Invalid opening book evaluation.');
    const steps = row[0].map(([from, to, die]) => ({
      from: state.turn ? mirrorPoint(from) : from,
      to: state.turn ? mirrorPoint(to) : to, die,
    }));
    const after = paths.get(pathKey(steps));
    if (!after) throw new Error('Illegal opening book move.');
    const key = boardKey(after);
    if (seen.has(key)) throw new Error('Duplicate opening book result.');
    seen.add(key);
    return { steps, key, notation: notation(steps, state.turn), equity: row[1],
      cubeless: row[2], probabilities: row.slice(3), mwc: null };
  }).sort((a, b) => b.equity - a.equity);
  const actualKey = submitted ? boardKey(commitTurn(state, submitted)) : null;
  const actual = actualKey ? candidates.find(c => c.key === actualKey) : null;
  // The book is screened at 3 ply. An unlisted actual move needs a fresh,
  // consistently evaluated candidate set, not a fabricated or mixed-depth grade.
  if (actualKey && !actual) return null;
  const board = bookBoardKey(state), laterTurn = index.continuations?.[board]?.turn;
  return { engine: BOOK_ENGINE_VERSION, settings: { ...structuredClone(index.settings), requestedPreset },
    positionKey: positionKey(state), status: 'complete', perspective: state.turn,
    units: 'current-cube-points', type: 'checker', candidates, actual,
    error: actual ? Math.max(0, candidates[0].equity - actual.equity) : null,
    screening: entry.total > candidates.length ? { plies: 2, total: entry.total,
      finalists: candidates.length, threshold: .080, minimum: 10 } : null,
    elapsedMs: performance.now() - started, cached: true,
    book: { id: BOOK_ID, source: 'precomputed',
      stage: board === START ? 'opening' : laterTurn === 3 ? 'third-turn' : laterTurn === 4 ? 'fourth-turn' : 'reply',
      openingWindow: index.threshold,
      builtAt: laterTurn ? index.continuationBuild.builtAt : index.provenance.builtAt },
  };
}
export class OpeningBook {
  constructor({ fetcher = (...args) => fetch(...args) } = {}) {
    this.fetcher = fetcher;
    this.files = new Map();
    this.failures = new Map();
    this.index = null;
  }
  async load(file) {
    if ((this.failures.get(file) || 0) > Date.now()) return null;
    if (this.files.has(file)) return this.files.get(file);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 1500);
    const pending = Promise.resolve().then(async () => {
      try {
        const response = await this.fetcher(new URL(file, BASE), { signal: controller.signal });
        if (!response.ok) throw new Error('Opening book unavailable.');
        const text = await response.text();
        if (text.length > 2_000_000) throw new Error('Opening book file is too large.');
        const value = validateHeader(JSON.parse(text));
        if (file === 'index.json') this.index = value;
        return value;
      } catch {
        this.files.delete(file); this.failures.set(file, Date.now() + 30000);
        return null; // Missing/offline/stale book: live GNUbg is still usable.
      } finally { clearTimeout(timeout); }
    });
    this.files.set(file, pending);
    // Index plus eight board shards, regardless of how large the book becomes.
    while (this.files.size > 9) {
      const oldest = [...this.files.keys()].find(k => k !== 'index.json' && k !== file);
      this.files.delete(oldest);
    }
    return pending;
  }
  mayHave(state) {
    if (!bookContext(state)) return false;
    if (!this.index) return true; // One small index fetch; never scan/download shards.
    const board = bookBoardKey(state);
    return board === START || !!this.index.replies?.[board] || !!this.index.continuations?.[board];
  }
  async entry(state) {
    if (!this.mayHave(state)) return null;
    const index = await this.load('index.json');
    if (!index) return null;
    const board = bookBoardKey(state), roll = [...state.dice].sort((a, b) => b - a).join('');
    if (board === START) return { index, entry: index.openings?.[roll] };
    const ref = index.replies?.[board] || index.continuations?.[board];
    if (!ref || !/^(?:reply|turn)-[a-f0-9]{16}\.json$/.test(ref.file)) return null;
    const shard = await this.load(ref.file);
    return shard?.board === board ? { index, entry: shard.rolls?.[roll] } : null;
  }
  prepare(state) {
    // Called with committed positions, before the next roll, without loading WASM.
    return this.entry(state).catch(() => null);
  }
  async lookup(state, options) {
    if (!bookEligible(state, options)) return null;
    const started = performance.now();
    const found = await this.entry(state);
    if (!found?.entry) return null;
    try {
      const result = bookResult(state, found.entry, found.index, options.preset, options.submitted);
      if (!result && options.submitted)
        options.onUnlisted?.();
      return result ? { ...result, elapsedMs: performance.now() - started } : null;
    } catch { return null; }
  }
}
