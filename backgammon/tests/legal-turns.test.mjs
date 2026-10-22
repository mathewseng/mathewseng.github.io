import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, legalPaths, legalTurns, boardKey, assertState } from '../core/rules.mjs';

// Independent exhaustive oracle: retain the first full legal path to each
// resulting board, exactly as the solver did before partial-board pruning.
function exhaustiveTurns(state) {
  const results = new Map();
  for (const path of legalPaths(state)) {
    const key = boardKey(path.state);
    if (!results.has(key)) results.set(key, { ...path, key });
  }
  return [...results.values()];
}
function mirror(state) {
  return { ...structuredClone(state), points: [...state.points].reverse().map(n => -n),
    turn: 1-state.turn, bar: [...state.bar].reverse(), off: [...state.off].reverse(),
    scores: [...state.scores].reverse(),
    cube: { ...state.cube, owner: state.cube.owner === null ? null : 1-state.cube.owner } };
}
function compare(state, label) {
  const before = structuredClone(state);
  assert.deepEqual(legalTurns(state), exhaustiveTurns(state), label);
  assert.deepEqual(state, before, 'enumeration must not mutate the input');
}

test('distinct turns retain exhaustive result order, first path and context across the checker corpus', () => {
  const corpus = ['accuracy-reference.json', 'exercises.json'].flatMap(file =>
    JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url))).items)
    .filter(item => item.state.phase === 'move');
  let checked = 0;
  for (const [index, item] of corpus.entries()) {
    const rolls = [item.state.dice, ...Array.from({length:6}, (_,i) => [i+1,i+1])];
    for (const dice of rolls) for (const side of [item.state, mirror(item.state)]) {
      const state = { ...side, dice };
      assertState(state);
      compare(state, `position ${index}, player ${state.turn}, roll ${dice}`);
      checked++;
    }
  }
  assert.ok(corpus.length >= 331);
  assert.equal(checked, corpus.length * 7 * 2);
});

test('distinct-turn pruning preserves forced play, maximum dice, higher die and early wins', () => {
  const position = (entries, bar = [0,0]) => {
    const points = Array(24).fill(0);
    for (const [point, count] of entries) points[point] = count;
    return initialState({points,bar,off:[0,1].map(player => 15-bar[player]-
      points.reduce((sum,n) => sum+(n*(player ? -1 : 1)>0 ? Math.abs(n) : 0),0)),
      phase:'move',dice:[1,1],matchLength:0});
  };
  const cases = [
    position([[0,1],[23,-15]]), // Oversized die, single checker and early win.
    position([[0,2],[1,1],[23,-15]]),
    position([[10,14],[23,-2],[22,-2],[21,-2],[20,-2],[19,-2],[18,-5]],[1,0]), // Forced pass.
    position([[5,13],[23,-2],[21,-2],[18,-2],[12,-9]],[2,0]), // Bar priority.
    position([[5,4],[3,4],[2,2],[1,2],[0,3],[23,-15]]), // Bearing off.
  ];
  for (const source of cases) for (const state of [source, mirror(source)])
    for (let first=1;first<=6;first++) for (let second=1;second<=6;second++)
      compare({...state,dice:[first,second]}, `edge case ${first},${second}`);
});

test('distinct-turn generation has no shared mutable results or stale non-board metadata', () => {
  const state = initialState({phase:'move',dice:[3,3],sequence:10,gameNumber:3});
  const first = legalTurns(state);
  first[0].steps[0].to = 'off';
  first[0].state.points[0] = 99;
  compare({...state,sequence:11,gameNumber:4}, 'fresh sequence and game number');
  assert.deepEqual(legalTurns({...state,phase:'roll',dice:[]}),[]);
});
