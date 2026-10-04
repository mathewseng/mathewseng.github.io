// SPDX-License-Identifier: GPL-3.0-or-later
import {
  assertState,
  legalTurns,
  commitTurn,
  boardKey,
  positionKey,
  canDouble,
  notation,
} from "../core/rules.mjs";
import { toXGID } from "../core/xgid.mjs";
import { ENGINE_VERSION, PRESETS, CAPABILITIES } from "./metadata.mjs";
export function createEvaluator(module) {
  if (module.cwrap("init", "number", [])() !== 0)
    throw new Error("GNUbg could not initialize its data.");
  const score = module.cwrap("bg_score", "number", [
      "string",
      "string",
      "number",
    ]),
    cube = module.cwrap("bg_cube", "number", ["string", "number"]);
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
    analyze(
      s,
      preset = "quick",
      kind = s.phase === "move" ? "checker" : "cube",
      submitted = null,
    ) {
      assertState(s);
      const settings = PRESETS[preset];
      if (!settings) throw new Error("Unknown evaluation preset.");
      const started = performance.now(),
        xgid = toXGID(s);
      const base = {
        engine: ENGINE_VERSION,
        settings,
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
        const result = call(cube, [xgid, settings.plies]);
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
      const candidates = turns
        .map((turn) => {
          // Preserve the original player on roll, cube and match context in the after-XGID.
          const after = { ...turn.state, dice: [], phase: "roll" };
          const value = call(score, [xgid, toXGID(after), settings.plies]);
          return {
            ...value,
            steps: turn.steps,
            key: turn.key,
            notation: notation(turn.steps, s.turn),
          };
        })
        .sort((a, b) => b.equity - a.equity);
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
