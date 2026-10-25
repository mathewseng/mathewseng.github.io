// SPDX-License-Identifier: GPL-3.0-or-later
import {
  assertState,
  legalTurns,
  commitTurn,
  boardKey,
  positionKey,
  canDouble,
  notation,
  rulesOf,
  transition,
  decisionPlayer,
  canImmediateRedouble,
  offerDepth,
} from "../core/rules.mjs";
import { toXGID as exportXGID } from "../core/xgid.mjs";
import { ENGINE_VERSION, PRESETS, CAPABILITIES } from "./metadata.mjs";
import {rolloutPolicy, DEFAULT_ROLLOUT_POLICY} from "./rollout-policy.mjs";
import { ADAPTIVE_ROOT } from "./adaptive.mjs";
const toXGID = (s) => exportXGID(s, { engine: true });
export function createEvaluator(module) {
  // One completed 2-ply root list, keyed by the full decision context and exact
  // candidate set. Deeper presets reuse it without mixing depths in rankings.
  let screeningCache = null;
  let quickCache = null;
  // One exact context per depth, at most 32 independent scores each. Keep
  // completed finalists when grading another legal move outside the hint list;
  // a native transposition cache need not retain a whole deep result.
  const finalistCaches = new Map();
  if (module.cwrap("init", "number", [])() !== 0)
    throw new Error("GNUbg could not initialize its data.");
  const score = module.cwrap("bg_score", "number", [
      "string",
      "string",
      "number",
      "number",
    ]),
    cube = module.cwrap("bg_cube", "number", ["string", "number", "number"]),
    value = module.cwrap("bg_value", "number", ["string", "number", "number"]);
  const roll = module.cwrap("bg_rollout_config", "number", [
    "string",
    "string",
    "number",
    "number",
    "number",
    "number",
    "number",
  ]);
  const unprunedChecker = typeof module._bg_score_config === "function";
  const configurableScore = unprunedChecker ? module.cwrap("bg_score_config", "number",
    ["string", "string", "number", "number", "number"]) : null;
  function call(fn, args) {
    const ptr = fn(...args);
    if (!ptr) throw new Error("GNUbg returned no result.");
    try {
      const value = JSON.parse(module.UTF8ToString(ptr));
      if (value.error) throw new Error(value.error);
      if (
        !Number.isFinite(value.equity) ||
        value.probabilities.some((n) => !Number.isFinite(n))
      )
        throw new Error("GNUbg returned invalid evaluation data.");
      return value;
    } finally {
      module._free(ptr);
    }
  }
  function scoreChecker(args, pruning = true) {
    if (pruning) return call(score, args);
    if (!configurableScore)
      throw new Error("This engine does not support unpruned checker verification. Refresh the app to update it.");
    const result = call(configurableScore, [...args, 0]);
    if (result.pruning !== false)
      throw new Error("GNUbg did not confirm unpruned checker verification.");
    return result;
  }
  return {
    capabilities: { ...CAPABILITIES, unprunedChecker },
    gradePrepared(s, prepared, submitted) {
      assertState(s);
      if (prepared?.engine!==ENGINE_VERSION || prepared.type!=='checker' ||
          prepared.status!=='complete' || prepared.positionKey!==positionKey(s) ||
          ![2,3,4,5,6].includes(prepared.settings?.plies) || !prepared.candidates?.length)
        throw new Error('Prepared analysis does not match this decision.');
      const start=performance.now(), after=commitTurn(s,submitted), key=boardKey(after);
      const result=structuredClone(prepared);
      let actual=result.candidates.find(c=>c.key===key);
      if (!actual) {
        const scored=scoreChecker([toXGID(s),toXGID({...after,phase:'roll',dice:[]}),
          prepared.settings.plies,Number(rulesOf(s).immediateRedoubles>0)], prepared.settings.pruning !== false);
        actual={...scored,key,steps:structuredClone(submitted),notation:notation(submitted,s.turn)};
        result.candidates.push(actual);
        result.candidates.sort((a,b)=>b.equity-a.equity);
        // Adding an arbitrary move changes the comparison set. The original
        // root's gap/forecast cannot describe this expanded ranking.
        if (result.budget) result.budget={...result.budget,lead:null,forecast:null};
        if(result.screening){
          result.screening.finalists=result.candidates.length;
          result.screening.excluded=result.screening.excluded?.filter(c=>c.key!==key);
        }
      }
      return {...result,actual,error:Math.max(0,result.candidates[0].equity-actual.equity),
        elapsedMs:performance.now()-start,
        preparation:{plies:prepared.settings.plies,requestId:prepared.requestId,
          reason:prepared.budget?.reason||'fixed-depth',submittedKey:key}};
    },
    rolloutBatch(s, turn, trials, seed, policy = DEFAULT_ROLLOUT_POLICY) {
      const settings=rolloutPolicy(policy);
      const result = call(roll, [
        toXGID(s),
        turn ? toXGID({ ...turn.state, dice: [], phase: "roll" }) : "",
        trials,
        seed | 0,
        settings.checkerPlies,
        settings.cubePlies,
        Number(settings.truncationPlies>0),
      ]);
      if (
        result.samples !== trials ||
        result.checkerPlies !== settings.checkerPlies ||
        result.cubePlies !== settings.cubePlies ||
        ["truncationPlies","lateAfterPlies","lateCheckerPlies","lateCubePlies"].some(k=>result[k]!==settings[k]) ||
        !Number.isFinite(result.standardError) ||
        result.standardError < 0 ||
        (result.outcomeSE &&
          result.outcomeSE.some((n) => !Number.isFinite(n) || n < 0))
      )
        throw new Error("GNUbg returned invalid rollout statistics.");
      return result;
    },
    analyze(...args) {
      const work = this.analyzeSteps(...args);
      let step;
      do { step = work.next(); } while (!step.done);
      return step.value;
    },
    async analyzeAsync(s, preset, kind, submitted, options, yieldWork) {
      const work = this.analyzeSteps(s, preset, kind, submitted, options);
      try {
        let step;
        while (!(step = work.next()).done) await yieldWork(step.value);
        return step.value;
      } finally { work.return(); }
    },
    *analyzeSteps(
      s,
      preset = "quick",
      kind = s.phase === "move" ? "checker" : "cube",
      submitted = null,
      { automatic = false, retainKeys = [] } = {},
    ) {
      assertState(s);
      const settings = PRESETS[preset];
      if (!settings) throw new Error("Unknown evaluation preset.");
      if (kind === "checker" && settings.requires === "unprunedChecker" && !unprunedChecker)
        throw new Error("This engine does not support unpruned checker verification. Refresh the app to update it.");
      const started = performance.now(),
        xgid = toXGID(
          offerDepth(s) ? { ...s, phase: "roll", pending: null } : s,
        ),
        beavers = Number(rulesOf(s).immediateRedoubles > 0);
      const base = {
        engine: ENGINE_VERSION,
        settings: { ...settings, cubeful: s.rules.cube,
          ...(preset === "verify" && kind === "cube" ? {
            name: "Verify · normal cube search", pruning: true,
            verification: "checker-only; cube uses Research settings",
          } : {}),
        },
        positionKey: positionKey(s),
        status: "complete",
        perspective: s.turn,
        units: s.matchLength
          ? "normalized-match-equity"
          : "current-cube-points",
        type: kind,
      };
      if (kind === "cube") {
        if (!["roll", "double"].includes(s.phase))
          throw new Error(
            "Cube analysis requires a pre-roll or offered-cube position.",
          );
        const result = call(cube, [xgid, settings.plies, beavers]);
        yield;
        if (beavers) {
          // Enumerate real legal cube-response branches. Values retain the
          // original roller's perspective and original cube units throughout.
          const unit = s.cube.value;
          const leaf = function* (state) {
            if (state.phase === "over")
              return ((state.result.winner === s.turn ? 1 : -1) * state.result.points) / unit;
            const result = call(value, [toXGID(state), settings.plies, beavers]);
            yield;
            return result.equity * state.cube.value / unit;
          };
          const response = function* (state) {
            const actor = decisionPlayer(state), actions = ["take", "pass"], choices = [];
            if (canImmediateRedouble(state)) actions.push(offerDepth(state) ? "raccoon" : "beaver");
            for (const action of actions) {
              const next = transition(state, { type: action }, actor);
              choices.push({action, equity: next.phase === "double"
                ? (yield* response(next)).best.equity : yield* leaf(next)});
            }
            const sorted = [...choices].sort((a, b) =>
              actor === s.turn ? b.equity - a.equity : a.equity - b.equity,
            );
            return { choices, best: sorted[0] };
          };
          if (s.phase === "double") {
            const replies = yield* response(s);
            result.decisionOptions = replies.choices;
            result.action = replies.best.action;
            result.equity = replies.best.equity;
            result.outcomes = [
              result.outcomes[0],
              replies.choices.find((c) => c.action === "take").equity,
              replies.choices.find((c) => c.action === "pass").equity,
            ];
          } else if (canDouble(s)) {
            const offered = transition(s, { type: "double" }, s.turn),
              replies = yield* response(offered);
            result.decisionOptions = [
              { action: "roll", equity: result.outcomes[0] },
              { action: "double", equity: replies.best.equity },
            ];
            const best = [...result.decisionOptions].sort(
              (a, b) => b.equity - a.equity,
            )[0];
            result.action = best.action;
            result.equity = best.equity;
          }
          result.decisionPlayer = decisionPlayer(s);
        }
        if (s.phase === "roll" && !canDouble(s)) result.action = "roll";
        return {
          ...base,
          ...result,
          available: s.phase === "double" || canDouble(s),
          elapsedMs: performance.now() - started,
        };
      }
      if (s.phase !== "move")
        throw new Error("Checker analysis requires rolled dice.");
      const turns = legalTurns(s);
      const submittedKey = submitted ? boardKey(commitTurn(s, submitted)) : null;
      const scoreTurns = function* (choices, plies) {
        const scores = [];
        yield {phase:'checker',plies,completed:0,total:choices.length};
        for (const turn of choices) {
          // Preserve the original player, cube and match context in after-XGID.
          const after = { ...turn.state, dice: [], phase: "roll" };
          const value = call(score, [xgid, toXGID(after), plies, beavers]);
          yield {phase: 'checker',plies,completed:scores.length+1,total:choices.length};
          scores.push({...value, steps:turn.steps, key:turn.key, notation:notation(turn.steps, s.turn)});
        }
        return scores.sort((a,b) => b.equity-a.equity);
      };
      let rootTurns = turns, screening = null;
      if (automatic && settings.plies > 0) {
        const quick = quickCache?.key === base.positionKey
          ? structuredClone(quickCache.candidates) : yield* scoreTurns(turns, 0);
        const finalists = quick.filter((c, i) => i < ADAPTIVE_ROOT.minimum ||
          (i < ADAPTIVE_ROOT.maximum && quick[0].equity - c.equity <= ADAPTIVE_ROOT.threshold) ||
          c.key === submittedKey || retainKeys.includes(c.key));
        const keys = new Set(finalists.map(c => c.key));
        rootTurns = turns.filter(t => keys.has(t.key));
        base.settings.rootFilter = { ...ADAPTIVE_ROOT };
        if (rootTurns.length < turns.length)
          screening = { plies: 0, total: turns.length, finalists: rootTurns.length,
            threshold: ADAPTIVE_ROOT.threshold, previousBest: quick[0].key,
            excluded: quick.filter(c => !keys.has(c.key)) };
      }
      const rootKey = JSON.stringify(rootTurns.map(t => t.key));
      let candidates = settings.plies > 2 && screeningCache?.key === base.positionKey && screeningCache.rootKey === rootKey
        ? structuredClone(screeningCache.candidates)
        : yield* scoreTurns(rootTurns, Math.min(2, settings.plies));
      if (settings.plies === 0)
        quickCache = { key: base.positionKey, candidates: structuredClone(candidates) };
      if (settings.plies >= 2)
        screeningCache = { key: base.positionKey, rootKey, candidates: structuredClone(candidates) };
      if (settings.plies > 2) {
        const original = candidates;
        const inFilter = (c, i, filter) => i < 2 ||
          (i < filter.finalists && original[0].equity - c.equity <= filter.threshold);
        const scoreFinalists = function* (choices, plies, pruning = true) {
          const cacheId = `${plies}:${pruning}`;
          let cache = finalistCaches.get(cacheId);
          if (cache?.key !== base.positionKey || cache.rootKey !== rootKey) {
            cache = { key: base.positionKey, rootKey, rows: new Map() };
            finalistCaches.set(cacheId, cache);
          }
          const scores = [];
          yield {phase:'checker',plies,completed:0,total:choices.length};
          for (const c of choices) {
            const cached = cache.rows.get(c.key);
            if (cached) { scores.push({ ...c, ...structuredClone(cached) }); continue; }
            const turn = turns.find(t => t.key === c.key);
            const scored = scoreChecker([xgid,
              toXGID({ ...turn.state, dice: [], phase: "roll" }), plies, beavers], pruning);
            // Cache only native numbers. Legal paths and notation always come
            // from this request's independently validated complete turn set.
            cache.rows.set(c.key, structuredClone(scored));
            if (cache.rows.size > 32) cache.rows.delete(cache.rows.keys().next().value);
            scores.push({ ...c, ...scored });
            yield {phase:'checker',plies,completed:scores.length,total:choices.length};
          }
          yield {phase:'checker',plies,completed:scores.length,total:choices.length};
          return scores.sort((a, b) => b.equity - a.equity);
        };
        const finalists = original.filter(
          (c, i) =>
            inFilter(c, i, settings) ||
            c.key === submittedKey || (automatic && retainKeys.includes(c.key)),
        );
        let retainedLeader = null;
        if (settings.plies >= 4) {
          base.settings.screeningPolicy = 'retain-expert-leader-v1';
          const expertChoices = original.filter((c, i) => inFilter(c, i, PRESETS.expert));
          const keys = new Set(finalists.map(c => c.key));
          if (expertChoices.every(c => keys.has(c.key))) {
            // No 3-ply evaluation is needed to know its winner is included.
            retainedLeader = { plies: 3, candidates: expertChoices.length, key: null,
              added: false, reason: 'all-expert-candidates-retained' };
          } else {
            const leader = (yield* scoreFinalists(expertChoices, 3))[0];
            const added = !keys.has(leader.key);
            if (added) finalists.push(original.find(c => c.key === leader.key));
            retainedLeader = { plies: 3, candidates: expertChoices.length, key: leader.key,
              equity: leader.equity, added, reason: 'expert-leader-retained' };
          }
        }
        if (settings.plies > 4) {
          base.settings.screeningPolicy = 'retain-deeper-leaders-v1';
          // Keep the whole Research shortlist through successive depths. No
          // discarded shallow score can outrank an actually evaluated finalist.
          for (let depth = 4; depth < settings.plies; depth++) {
            const leader = (yield* scoreFinalists(finalists, depth))[0];
            retainedLeader = {plies:depth, candidates:finalists.length, key:leader.key,
              equity:leader.equity, added:false, reason:'all-previous-finalists-retained'};
          }
        }
        candidates = yield* scoreFinalists(finalists, settings.plies, settings.pruning);
        screening = {
          plies: 2,
          total: turns.length,
          finalists: candidates.length,
          threshold: settings.threshold,
          excluded: original.filter((c) => !finalists.includes(c)),
          previousBest: original[0].key,
          ...(retainedLeader ? { retainedLeader } : {}),
          ...(screening ? { initial: screening } : {}),
          ...(settings.pruning === false ? { pruning: true,
            finalPruning: false, verification: "same Research shortlist; unpruned final checker scores" } : {}),
        };
      }
      let actual = null;
      if (submitted) {
        const key = boardKey(commitTurn(s, submitted));
        actual = candidates.find((c) => c.key === key);
        if (!actual)
          throw new Error(
            "Submitted result missing from complete legal move set.",
          );
      }
      return {
        ...base,
        candidates,
        screening,
        actual,
        error: actual
          ? Math.max(0, candidates[0].equity - actual.equity)
          : null,
        elapsedMs: performance.now() - started,
      };
    },
    shutdown() {
      finalistCaches.clear();
      screeningCache = quickCache = null;
      module.cwrap("shutdown", "number", [])();
    },
  };
}
