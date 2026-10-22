// SPDX-License-Identifier: GPL-3.0-or-later
import { assertState, legalTurns, boardKey, commitTurn, notation, positionKey, rulesOf, MAX_CUBE } from '../core/rules.mjs';
import { PURETD } from './puretd-metadata.mjs';

export function puretdIssue(state) {
  const rules = rulesOf(state);
  if (state.matchLength || !rules.cube || !rules.jacoby || rules.immediateRedoubles)
    return 'PureTD requires money play with the cube and Jacoby on, and beavers/raccoons off. Change the position’s rules to use this method.';
  if (state.phase !== 'move') return 'PureTD currently analyzes checker decisions. Roll or enter dice first.';
  if (state.cube.value >= MAX_CUBE / 2) return 'This cube is too close to the numeric limit for PureTD’s continuation model.';
  return null;
}

export function createPuretdEvaluator(module, model = PURETD) {
  if (module._bgc_abi_version() !== 1) throw Error('Unsupported PureTD ABI.');
  const sizes = module._malloc(44);
  try {
    if (module._bgc_struct_sizes(sizes, 11) !== 11 ||
        [116, 152, 12, 16, 4].some((n, i) => module.HEAPU32[sizes / 4 + i] !== n))
      throw Error('Incompatible PureTD memory layout.');
  } finally { module._free(sizes); }
  const engine = module.cwrap('bgc_open', 'number', ['string'])('/' + model.file);
  if (!engine) throw Error('PureTD could not load its model.');
  module.FS.unlink('/' + model.file);
  const statePtr = module._malloc(116), cubePtr = module._malloc(12),
    scoresPtr = module._malloc(4096 * 4), statesPtr = module._malloc(4096 * 116), cubeResultPtr = module._malloc(16);
  const pointers = [statePtr, cubePtr, scoresPtr, statesPtr, cubeResultPtr];
  if (!pointers.every(Boolean)) {
    pointers.filter(Boolean).forEach(p => module._free(p));
    module._bgc_close(engine);
    throw Error('PureTD allocation failed.');
  }
  const writeState = state => {
    module.HEAP32.set([...state.points, ...state.bar, ...state.off, state.turn], statePtr / 4);
    module.HEAP32.set([state.cube.owner === null ? 0 : state.cube.owner + 1, state.cube.value, 1], cubePtr / 4);
  };
  const finite = value => { if (!Number.isFinite(value)) throw Error('PureTD returned a non-finite equity.'); return value; };
  return {
    analyze(state, { submitted = null, plies = 1 } = {}) {
      assertState(state);
      const issue = puretdIssue(state); if (issue) throw Error(issue);
      if (![0, 1].includes(plies)) throw Error('PureTD supports zero or one lookahead turn.');
      const start = performance.now(), legal = legalTurns(state), byKey = new Map(legal.map(t => [t.key, t]));
      writeState(state);
      const n = module._bgc_score_moves(engine, statePtr, ...state.dice, cubePtr, plies, scoresPtr, statesPtr);
      if (n < 0 || n > 4096) throw Error('PureTD checker search failed.');
      let candidates = [];
      if (n === 0 && legal.length === 1 && !legal[0].steps.length) {
        // The upstream checker API returns no value for a forced pass. Evaluate
        // the opponent's actual pre-roll decision at the same search depth.
        const next = { ...state, turn: 1 - state.turn };
        writeState(next);
        let value;
        const mayDouble = next.cube.owner === null || next.cube.owner === next.turn;
        if (!plies) value = module._bgc_value(engine, statePtr, cubePtr, Number(mayDouble));
        else if (mayDouble) {
          const doubles = module._bgc_offer_double(engine, statePtr, cubePtr, plies, cubeResultPtr);
          if (doubles < 0) throw Error('PureTD pass evaluation failed.');
          const no = finite(module.HEAPF32[cubeResultPtr / 4 + 1]), take = finite(module.HEAPF32[cubeResultPtr / 4 + 2]);
          value = doubles ? Math.min(take, 1) : no;
        } else value = module._bgc_value_1ply(engine, statePtr, cubePtr);
        candidates = [{ key: legal[0].key, equity: -finite(value) }];
      } else {
        if (n !== legal.length) throw Error('PureTD and the board disagree about legal moves.');
        const seen = new Set();
        for (let i = 0; i < n; i++) {
          const offset = statesPtr / 4 + i * 29, key = Array.from(module.HEAP32.subarray(offset, offset + 28)).join(',');
          if (!byKey.has(key) || seen.has(key) || module.HEAP32[offset + 28] !== 1 - state.turn)
            throw Error('PureTD returned an invalid resulting board.');
          seen.add(key); candidates.push({ key, equity: finite(module.HEAPF32[scoresPtr / 4 + i]) });
        }
      }
      candidates = candidates.map(c => ({ ...c, steps: byKey.get(c.key).steps,
        notation: notation(byKey.get(c.key).steps, state.turn), probabilities: null, cubeless: null, mwc: null }))
        .sort((a, b) => b.equity - a.equity);
      const submittedKey = submitted ? boardKey(commitTurn(state, submitted)) : null;
      const actual = submittedKey ? candidates.find(c => c.key === submittedKey) : null;
      if (submittedKey && !actual) throw Error('Submitted move was not evaluated.');
      return { engine: model.id, method: 'neural', model: { id: model.model, sha256: model.modelSHA256, equityOnly: true },
        settings: { name: model.name, plies, cubeful: true, pruning: false, deterministic: true, noise: 0 },
        positionKey: positionKey(state), status: 'complete', perspective: state.turn, units: 'current-cube-points',
        type: 'checker', candidates, actual, error: actual ? Math.max(0, candidates[0].equity - actual.equity) : null,
        elapsedMs: performance.now() - start };
    },
    destroy() { module._bgc_close(engine); [statePtr, cubePtr, scoresPtr, statesPtr, cubeResultPtr].forEach(p => module._free(p)); },
  };
}
