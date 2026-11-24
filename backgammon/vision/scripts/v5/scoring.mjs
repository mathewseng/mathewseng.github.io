/**
 * Shared rules and checker scoring for the replay, matching play against the bot:
 * money rules with Jacoby on and beavers/raccoons allowed; openings and replies
 * from the bot's opening book (XG published rollouts), every other play at four
 * ply. A played move the book does not list is scored live, as the bot does.
 * Moves are written as the app writes them (presentMove): one journey per
 * checker, hits marked, e.g. 13/7* rather than 13/8 8/7.
 */
import { loadEvaluator, openingBook } from './engine.mjs';
import { presentMove } from '../../../core/move-presentation.mjs';

export const RULES = { cube: true, jacoby: true, automaticDoubles: 0, immediateRedoubles: -1 };
export const PRESET = 'research';
const TOP = 5;

export async function createScorer() {
  const evaluator = await loadEvaluator();
  const book = openingBook();
  async function checker(state, steps) {
    const ref = await book.lookup(state, { preset: 'auto', kind: 'checker', submitted: steps });
    const a = ref ?? evaluator.analyze(state, PRESET, 'checker', steps);
    const rank = a.candidates.findIndex(c => c.key === a.actual?.key);
    return {
      candidates: a.candidates.slice(0, TOP).map(c => ({ notation: presentMove(state, c.steps).notation, steps: c.steps, equity: c.equity, probabilities: c.probabilities })),
      played: a.actual ? { notation: presentMove(state, steps).notation, steps, equity: a.actual.equity, probabilities: a.actual.probabilities, rank: rank + 1 } : null,
      evLoss: a.error, legalMoves: ref ? (ref.reference?.total ?? ref.candidates.length) : a.candidates.length,
      ...(ref ? { method: ref.method ?? 'book', result: ref } : {}),
    };
  }
  return { evaluator, checker, cube: state => evaluator.analyze(state, PRESET, 'cube') };
}
