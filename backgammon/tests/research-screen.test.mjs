import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluator } from '../engine/evaluate.mjs';
import { initialState, legalTurns } from '../core/rules.mjs';
import { toXGID } from '../core/xgid.mjs';

const state = () => initialState({ phase: 'move', dice: [3, 1], matchLength: 0 });
function fixture(s = state(), winner = 5, spread = .01) {
  const turns = legalTurns(s), calls = [];
  const keys = turns.map(t => toXGID({ ...t.state, phase: 'roll', dice: [] }, { engine: true }));
  const engine = createEvaluator({
    cwrap(name) {
      if (name === 'init') return () => 0;
      return (original, after, depth) => {
        calls.push({ original, after, depth });
        // Ignore encoded context for move identity; contexts remain observable
        // through call counts and the full original XGID.
        const i = keys.findIndex(key => key.split(':')[0] === after.split(':')[0]);
        assert.ok(i >= 0);
        const equity = depth >= 3 && i === winner ? .2 : -i * spread;
        return JSON.stringify({ equity, cubeless: equity, mwc: null, probabilities: [.5, .1, 0, .1, 0] });
      };
    }, UTF8ToString: p => p, _free() {},
  });
  return { engine, calls, turns, wanted: turns[winner]?.key };
}
test('fresh Research retains an Expert winner outside its narrower two-ply screen', () => {
  const { engine, calls, wanted } = fixture();
  const result = engine.analyze(state(), 'research');
  assert.equal(result.candidates[0].key, wanted);
  assert.equal(result.settings.plies, 4);
  assert.equal(result.screening.retainedLeader.key, wanted);
  assert.equal(result.screening.retainedLeader.plies, 3);
  assert.equal(result.screening.retainedLeader.added, true);
  assert.ok(result.candidates.every(c => Number.isFinite(c.equity)));
  const evaluated = new Set(calls.filter(c => c.depth === 4).map(c => c.after.split(':')[0]));
  assert.equal(evaluated.size, result.candidates.length, 'each ranked finalist needs its own four-ply score');
});
test('Expert → Research reuses three-ply scores, isolated from returned edits and rule context', () => {
  const { engine, calls, wanted } = fixture();
  const expert = engine.analyze(state(), 'expert');
  const n = calls.filter(c => c.depth === 3).length;
  expert.candidates[0].key = 'edited'; expert.candidates[0].equity = -99;
  expert.candidates[0].probabilities[0] = 0;
  const result = engine.analyze(state(), 'research');
  assert.equal(result.candidates[0].key, wanted);
  assert.equal(calls.filter(c => c.depth === 3).length, n);
  assert.equal(result.screening.retainedLeader.equity, .2);
  engine.analyze({ ...state(), cube: { value: 2, owner: 0 } }, 'research');
  assert.equal(calls.filter(c => c.depth === 3).length, n * 2);
});
test('Research does not spend three-ply work when every possible Expert leader is already retained', () => {
  const { engine, calls } = fixture(state(), 0, .2);
  const result = engine.analyze(state(), 'research');
  assert.equal(result.candidates.length, 2);
  assert.equal(calls.filter(c => c.depth === 3).length, 0);
  assert.equal(result.screening.retainedLeader.reason, 'all-expert-candidates-retained');
  assert.equal(result.screening.retainedLeader.key, null);
});
test('Research keeps submitted moves and all prior finalists as well as the Expert leader', () => {
  const { engine, turns, wanted } = fixture();
  const submitted = turns.at(-1);
  const result = engine.analyze(state(), 'research', 'checker', submitted.steps);
  assert.equal(result.actual.key, submitted.key);
  for (const turn of turns.slice(0, 4)) assert.ok(result.candidates.some(c => c.key === turn.key));
  assert.ok(result.candidates.some(c => c.key === wanted));
  assert.equal(result.error, .2 - result.actual.equity);
});
test('three-ply reuse never crosses match, rule, cube or root-filter contexts', () => {
  const s = initialState({ phase: 'move', dice: [3, 3], matchLength: 0 });
  const { engine, calls } = fixture(s);
  const variants = [
    s,
    { ...s, cube: { value: 2, owner: 0 } },
    { ...s, cube: { value: 2, owner: 1 } },
    { ...s, rules: { ...s.rules, jacoby: true } },
    { ...s, rules: { ...s.rules, immediateRedoubles: 1 } },
    { ...s, rules: { ...s.rules, cube: false } },
    { ...s, matchLength: 7, scores: [2, 4] },
    { ...s, matchLength: 7, scores: [4, 2] },
    { ...s, matchLength: 7, scores: [6, 2], crawford: true },
    { ...s, matchLength: 7, scores: [6, 2], crawfordPlayed: true },
  ];
  for (const variant of variants) {
    const before = calls.filter(c => c.depth === 3).length;
    engine.analyze(variant, 'expert');
    const completed = calls.filter(c => c.depth === 3).length;
    assert.ok(completed > before, 'changed context needs new native work');
    engine.analyze(variant, 'research');
    assert.equal(calls.filter(c => c.depth === 3).length, completed);
  }
  engine.analyze(s, 'expert');
  const before = calls.filter(c => c.depth === 3).length;
  const screened = engine.analyze(s, 'expert', 'checker', null, { automatic: true });
  assert.ok(screened.screening.initial.finalists < screened.screening.total);
  assert.ok(calls.filter(c => c.depth === 3).length > before, 'different root list is isolated');
});
test('repeated out-of-shortlist grading evicts old scores without losing submitted moves', () => {
  const s = initialState({ phase: 'move', dice: [3, 3], matchLength: 0 });
  const { engine, calls, turns } = fixture(s);
  const submissions = turns.slice(9, 50);
  for (const turn of submissions) {
    const result = engine.analyze(s, 'expert', 'checker', turn.steps);
    assert.equal(result.actual.key, turn.key);
  }
  const first = submissions[0];
  const before = calls.filter(c => c.depth === 3).length;
  const result = engine.analyze(s, 'expert', 'checker', first.steps);
  assert.equal(result.actual.key, first.key);
  assert.ok(calls.filter(c => c.depth === 3).length > before, 'old arbitrary grades must leave the bounded cache');
  const research = engine.analyze(s, 'research', 'checker', first.steps);
  assert.equal(research.actual.key, first.key);
  assert.equal(research.actual.equity, result.actual.equity);
});

test('manual 5/6-ply comparisons score every retained finalist at their actual requested depth',()=>{
 for(const [preset,depth] of [['extended5',5],['extended6',6]]) {
  const {engine,calls,wanted}=fixture();
  const result=engine.analyze(state(),preset);
  assert.equal(result.settings.plies,depth);
  assert.equal(result.candidates[0].key,wanted,'the Expert winner remains included at every depth');
  assert.equal(result.screening.retainedLeader.plies,depth-1);
  assert.equal(new Set(calls.filter(c=>c.depth===depth).map(c=>c.after)).size,result.candidates.length);
  for(let previous=4;previous<depth;previous++)assert.ok(calls.some(c=>c.depth===previous));
 }
});
