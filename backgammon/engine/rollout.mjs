// SPDX-License-Identifier: GPL-3.0-or-later
import {
  legalTurns,
  positionKey,
  rulesOf,
  canDouble,
  boardKey,
  commitTurn,
} from "../core/rules.mjs";
import { ENGINE_VERSION } from "./metadata.mjs";
export const ROLLOUT_POLICY =
  "GNUbg 0-ply checker/cube; variance reduction; ISAAC; independent batches; no ply truncation";
export function rolloutUnsupported(s) {
  if (rulesOf(s).immediateRedoubles)
    return "Rollouts currently support ordinary doubling, not beavers or raccoons. Tree analysis supports your configured rules.";
  if (!["move", "roll", "double"].includes(s.phase))
    return "Rollouts need a rolled checker decision or legal cube decision.";
  if (
    s.phase !== "move" &&
    (!s.rules.cube || (s.phase === "roll" && !canDouble(s)))
  )
    return "There is no legal cube decision to roll out here.";
  return null;
}
// Pool independent batches from sample means and standard errors of the mean.
export function pool(a, b) {
  if (!a) return structuredClone(b);
  const n = a.samples + b.samples,
    d = b.equity - a.equity;
  const m2 =
    a.standardError ** 2 * a.samples * (a.samples - 1) +
    b.standardError ** 2 * b.samples * (b.samples - 1) +
    (d * d * a.samples * b.samples) / n;
  const average = (x, y) => (x * a.samples + y * b.samples) / n;
  const result = {
    ...b,
    samples: n,
    equity: average(a.equity, b.equity),
    standardError: Math.sqrt(Math.max(0, m2) / (n * (n - 1))),
    cubeless: average(a.cubeless, b.cubeless),
    probabilities: a.probabilities.map((v, i) =>
      average(v, b.probabilities[i]),
    ),
    mwc: a.mwc === null ? null : average(a.mwc, b.mwc),
  };
  if (
    a.mwc !== null &&
    Number.isFinite(a.mwcStandardError) &&
    Number.isFinite(b.mwcStandardError)
  ) {
    const delta = b.mwc - a.mwc;
    const mwcM2 =
      a.mwcStandardError ** 2 * a.samples * (a.samples - 1) +
      b.mwcStandardError ** 2 * b.samples * (b.samples - 1) +
      (delta * delta * a.samples * b.samples) / n;
    result.mwcStandardError = Math.sqrt(Math.max(0, mwcM2) / (n * (n - 1)));
  }
  if (b.outcomes) {
    result.outcomes = b.outcomes.map((v, i) => average(a.outcomes[i], v));
    result.outcomeSE = b.outcomeSE.map(
      (v, i) =>
        pool(
          {
            ...a,
            equity: a.outcomes[i],
            standardError: a.outcomeSE[i],
            outcomes: null,
          },
          { ...b, equity: b.outcomes[i], standardError: v, outcomes: null },
        ).standardError,
    );
    if (b.outcomesMWC)
      result.outcomesMWC = b.outcomesMWC.map((v, i) =>
        average(a.outcomesMWC[i], v),
      );
  }
  return result;
}
export function batchSeed(seed, batch) {
  // Disjoint ISAAC seed ranges: native trial i uses seed + (i << 8).
  return (seed + batch * 0x10000) >>> 0;
}
export async function runRollout(
  evaluator,
  state,
  { trials = 256, seed = 1, resume = null } = {},
  submitted = null,
  progress = () => {},
) {
  const reason = rolloutUnsupported(state);
  if (reason) throw new Error(reason);
  if (
    ![64, 256, 1024, 4096].includes(trials) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw new Error("Invalid rollout sample count or seed.");
  const key = positionKey(state),
    started = performance.now();
  const checkpointKey = JSON.stringify([
    ENGINE_VERSION,
    key,
    seed,
    ROLLOUT_POLICY,
    submitted,
  ]);
  let cp;
  if (resume) {
    if (
      resume.key !== checkpointKey ||
      !Number.isInteger(resume.completed) ||
      resume.completed < 0 ||
      resume.completed % 32 ||
      resume.completed > 4096 ||
      !Array.isArray(resume.values) ||
      !Number.isFinite(resume.elapsedMs) ||
      resume.elapsedMs < 0
    )
      throw new Error(
        "Rollout checkpoint does not match this position, engine and settings.",
      );
    cp = structuredClone(resume);
  } else {
    const screening = evaluator.analyze(
      state,
      "deep",
      state.phase === "move" ? "checker" : "cube",
      submitted,
    );
    const submittedKey = submitted
      ? boardKey(commitTurn(state, submitted))
      : null;
    const contenders =
      screening.candidates?.filter(
        (c, i) =>
          i < 2 ||
          (i < 4 && screening.candidates[0].equity - c.equity <= 0.04) ||
          c.key === submittedKey,
      ) || [];
    cp = {
      key: checkpointKey,
      engine: ENGINE_VERSION,
      positionKey: key,
      seed,
      completed: 0,
      elapsedMs: 0,
      screening,
      contenders,
      values: contenders.length ? contenders.map(() => null) : [null],
    };
  }
  const turns = legalTurns(state);
  const choices = cp.contenders.map((c) => turns.find((t) => t.key === c.key));
  if (
    cp.screening?.positionKey !== key ||
    cp.engine !== ENGINE_VERSION ||
    cp.seed !== seed ||
    choices.some((t) => !t) ||
    cp.values.length !== (choices.length || 1)
  )
    throw new Error("Invalid rollout checkpoint candidates.");
  for (const value of cp.values)
    if (
      cp.completed &&
      (!value ||
        value.samples !== cp.completed ||
        !Number.isFinite(value.equity) ||
        !Number.isFinite(value.standardError) ||
        value.standardError < 0)
    )
      throw new Error("Invalid rollout sample statistics.");
  const priorTime = cp.elapsedMs;
  while (cp.completed < trials) {
    const batch = [];
    for (const turn of choices.length ? choices : [null])
      batch.push(
        evaluator.rolloutBatch(
          state,
          turn,
          32,
          batchSeed(seed, cp.completed / 32),
        ),
      );
    cp.values = cp.values.map((value, i) => pool(value, batch[i]));
    cp.completed += 32;
    cp.elapsedMs = priorTime + performance.now() - started;
    progress(structuredClone(cp));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const settings = {
    name: "Rollout",
    plies: 0,
    cubeful: state.rules.cube,
    noise: 0,
    policy: ROLLOUT_POLICY,
    trials: cp.completed,
    seed,
    varianceReduction: true,
    rotation: false,
  };
  const base = {
    ...cp.screening,
    settings,
    method: "rollout",
    status: "complete",
    elapsedMs: cp.elapsedMs,
    checkpoint: cp,
    screening: {
      plies: 2,
      total: cp.screening.candidates?.length || 2,
      finalists: cp.contenders.length || 2,
    },
    uncertainty:
      "Approximate 95% sampling intervals; excludes policy/model error and screening risk. Shared dice correlate alternatives; gap uncertainty uses a conservative sum of standard errors.",
  };
  if (choices.length) {
    const candidates = cp.contenders
      .map((c, i) => ({ ...c, ...cp.values[i] }))
      .sort((a, b) => b.equity - a.equity);
    const actual = submitted
      ? candidates.find((c) => c.key === boardKey(commitTurn(state, submitted)))
      : null;
    return {
      ...base,
      candidates,
      actual,
      error: actual ? Math.max(0, candidates[0].equity - actual.equity) : null,
    };
  }
  const value = cp.values[0],
    [no, take, pass] = value.outcomes;
  const offered = state.phase === "double";
  const action = offered
    ? take <= pass
      ? "take"
      : "pass"
    : Math.min(take, pass) > no
      ? "double"
      : "roll";
  const bestIndex = offered
    ? take <= pass
      ? 1
      : 2
    : Math.min(take, pass) > no
      ? take <= pass
        ? 1
        : 2
      : 0;
  return {
    ...base,
    ...value,
    action,
    mwc: value.outcomesMWC?.[bestIndex] ?? null,
    equity: offered ? Math.min(take, pass) : Math.max(no, Math.min(take, pass)),
    available: true,
  };
}
