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
import { ADAPTIVE_ROOT } from "./adaptive.mjs";
const toXGID = (s) => exportXGID(s, { engine: true });
export function createEvaluator(module) {
  // One completed 2-ply root list, keyed by the full decision context and exact
  // candidate set. Deeper presets reuse it without mixing depths in rankings.
  let screeningCache = null;
  let quickCache = null;
  // One context, at most 32 independent 3-ply scores. Research can preserve
  // Expert's leader without repeating its native work after progressive search.
  let expertCache = null;
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
  const roll = module.cwrap("bg_rollout", "number", [
    "string",
    "string",
    "number",
    "number",
  ]);
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
  return {
    capabilities: CAPABILITIES,
    rolloutBatch(s, turn, trials, seed) {
      const result = call(roll, [
        toXGID(s),
        turn ? toXGID({ ...turn.state, dice: [], phase: "roll" }) : "",
        trials,
        seed | 0,
      ]);
      if (
        result.samples !== trials ||
        !Number.isFinite(result.standardError) ||
        result.standardError < 0 ||
        (result.outcomeSE &&
          result.outcomeSE.some((n) => !Number.isFinite(n) || n < 0))
      )
        throw new Error("GNUbg returned invalid rollout statistics.");
      return result;
    },
    analyze(
      s,
      preset = "quick",
      kind = s.phase === "move" ? "checker" : "cube",
      submitted = null,
      { automatic = false, retainKeys = [] } = {},
    ) {
      assertState(s);
      const settings = PRESETS[preset];
      if (!settings) throw new Error("Unknown evaluation preset.");
      const started = performance.now(),
        xgid = toXGID(
          offerDepth(s) ? { ...s, phase: "roll", pending: null } : s,
        ),
        beavers = Number(rulesOf(s).immediateRedoubles > 0);
      const base = {
        engine: ENGINE_VERSION,
        settings: { ...settings, cubeful: s.rules.cube },
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
        if (beavers) {
          // Enumerate real legal cube-response branches. Values retain the
          // original roller's perspective and original cube units throughout.
          const unit = s.cube.value;
          const leaf = (state) =>
            state.phase === "over"
              ? ((state.result.winner === s.turn ? 1 : -1) *
                  state.result.points) /
                unit
              : (call(value, [toXGID(state), settings.plies, beavers]).equity *
                  state.cube.value) /
                unit;
          const response = (state) => {
            const actor = decisionPlayer(state),
              actions = ["take", "pass"];
            if (canImmediateRedouble(state))
              actions.push(offerDepth(state) ? "raccoon" : "beaver");
            const choices = actions.map((action) => {
              const next = transition(state, { type: action }, actor);
              return {
                action,
                equity:
                  next.phase === "double"
                    ? response(next).best.equity
                    : leaf(next),
              };
            });
            const sorted = [...choices].sort((a, b) =>
              actor === s.turn ? b.equity - a.equity : a.equity - b.equity,
            );
            return { choices, best: sorted[0] };
          };
          if (s.phase === "double") {
            const replies = response(s);
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
              replies = response(offered);
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
      const scoreTurns = (choices, plies) => choices.map((turn) => {
          // Preserve the original player on roll, cube and match context in the after-XGID.
          const after = { ...turn.state, dice: [], phase: "roll" };
          const value = call(score, [
            xgid,
            toXGID(after),
            plies,
            beavers,
          ]);
          return {
            ...value,
            steps: turn.steps,
            key: turn.key,
            notation: notation(turn.steps, s.turn),
          };
        })
        .sort((a, b) => b.equity - a.equity);
      let rootTurns = turns, screening = null;
      if (automatic && settings.plies > 0) {
        const quick = quickCache?.key === base.positionKey
          ? structuredClone(quickCache.candidates) : scoreTurns(turns, 0);
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
        : scoreTurns(rootTurns, Math.min(2, settings.plies));
      if (settings.plies === 0)
        quickCache = { key: base.positionKey, candidates: structuredClone(candidates) };
      if (settings.plies >= 2)
        screeningCache = { key: base.positionKey, rootKey, candidates: structuredClone(candidates) };
      if (settings.plies > 2) {
        const original = candidates;
        const inFilter = (c, i, filter) => i < 2 ||
          (i < filter.finalists && original[0].equity - c.equity <= filter.threshold);
        const scoreFinalists = (choices, plies) => {
          if (plies === 3 && (expertCache?.key !== base.positionKey || expertCache.rootKey !== rootKey))
            expertCache = { key: base.positionKey, rootKey, rows: new Map() };
          return choices.map(c => {
            const cached = plies === 3 && expertCache.rows.get(c.key);
            if (cached) return structuredClone(cached);
            const turn = turns.find(t => t.key === c.key);
            const scored = { ...c, ...call(score, [xgid,
              toXGID({ ...turn.state, dice: [], phase: "roll" }), plies, beavers]) };
            if (plies === 3) {
              expertCache.rows.set(c.key, structuredClone(scored));
              if (expertCache.rows.size > 32) expertCache.rows.delete(expertCache.rows.keys().next().value);
            }
            return scored;
          }).sort((a, b) => b.equity - a.equity);
        };
        const finalists = original.filter(
          (c, i) =>
            inFilter(c, i, settings) ||
            c.key === submittedKey || (automatic && retainKeys.includes(c.key)),
        );
        let retainedLeader = null;
        if (settings.plies === 4) {
          base.settings.screeningPolicy = 'retain-expert-leader-v1';
          const expertChoices = original.filter((c, i) => inFilter(c, i, PRESETS.expert));
          const keys = new Set(finalists.map(c => c.key));
          if (expertChoices.every(c => keys.has(c.key))) {
            // No 3-ply evaluation is needed to know its winner is included.
            retainedLeader = { plies: 3, candidates: expertChoices.length, key: null,
              added: false, reason: 'all-expert-candidates-retained' };
          } else {
            const leader = scoreFinalists(expertChoices, 3)[0];
            const added = !keys.has(leader.key);
            if (added) finalists.push(original.find(c => c.key === leader.key));
            retainedLeader = { plies: 3, candidates: expertChoices.length, key: leader.key,
              equity: leader.equity, added, reason: 'expert-leader-retained' };
          }
        }
        candidates = scoreFinalists(finalists, settings.plies);
        screening = {
          plies: 2,
          total: turns.length,
          finalists: candidates.length,
          threshold: settings.threshold,
          excluded: original.filter((c) => !finalists.includes(c)),
          previousBest: original[0].key,
          ...(retainedLeader ? { retainedLeader } : {}),
          ...(screening ? { initial: screening } : {}),
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
      module.cwrap("shutdown", "number", [])();
    },
  };
}
