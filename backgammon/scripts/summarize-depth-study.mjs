import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const DEPTHS = ["deep", "expert", "research"];
export const EPSILON = 0.000001;
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
export function distribution(values) {
  assert(values.every(Number.isFinite), "Non-finite observation");
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = p => {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * p, f = Math.floor(i);
    return sorted[f] + (sorted[Math.ceil(i)] - sorted[f]) * (i - f);
  };
  return { n: sorted.length, mean: mean(sorted), median: quantile(0.5),
    p90: quantile(0.9), p95: quantile(0.95), min: sorted[0] ?? null, max: sorted.at(-1) ?? null };
}
function signs(values) {
  return { n: values.length, better: values.filter(x => x > EPSILON).length,
    worse: values.filter(x => x < -EPSILON).length, tied: values.filter(x => Math.abs(x) <= EPSILON).length,
    meanGain: mean(values), sumGain: values.reduce((sum, x) => sum + x, 0),
    absoluteGap: distribution(values.map(Math.abs)),
    over005: values.filter(x => Math.abs(x) > 0.005).length,
    over020: values.filter(x => Math.abs(x) > 0.02).length,
    over050: values.filter(x => Math.abs(x) > 0.05).length };
}

export function summarize(report, corpus, { expectedCount = 300 } = {}) {
  assert.equal(corpus.items.length, expectedCount, "Unexpected corpus size");
  assert.equal(report.samples.length, expectedCount * 3, "Incomplete depth study");
  for (const row of corpus.items) {
    assert.equal(new Set(row.reference.map(r => r.key)).size, row.reference.length, "Duplicate reference candidate");
    assert(row.reference.every(r => Number.isFinite(r.loss) && r.loss >= 0), "Invalid reference loss");
  }
  const samples = new Map(), grades = new Map();
  for (const sample of [...report.samples, ...report.supplementalGrades]) {
    assert(["sample", "grade"].includes(sample.type), "Unknown measurement type");
    const source = corpus.items[sample.index];
    assert(source, "Unknown corpus index");
    assert.equal(sample.key, source.key, "Position identity mismatch");
    assert.equal(sample.line, source.line, "Source line mismatch");
    assert.equal(sample.topic, source.topic, "Position class mismatch");
    assert(DEPTHS.includes(sample.preset), "Unexpected preset");
    assert.equal(sample.settings.plies, DEPTHS.indexOf(sample.preset) + 2);
    assert.equal(sample.settings.cubeful, false, "Reference is cubeless");
    assert.equal(sample.engine, report.engine, "Mixed engine versions");
    assert(Number.isFinite(sample.wallMs) && sample.wallMs >= 0);
    assert(Number.isFinite(sample.computeMs) && sample.computeMs >= 0);
    assert(sample.candidates.length, "Missing candidates");
    assert.equal(new Set(sample.candidates.map(c => c.key)).size, sample.candidates.length, "Duplicate candidates");
    sample.candidates.forEach((c, i) => {
      assert(Number.isFinite(c.equity));
      if (i) assert(sample.candidates[i - 1].equity >= c.equity, "Unsorted candidates");
    });
    const map = sample.type === "sample" ? samples : grades;
    const id = `${sample.index}:${sample.preset}`;
    assert(!map.has(id), "Duplicate measurement");
    map.set(id, sample);
  }
  const rows = corpus.items.map((source, index) => {
    const results = Object.fromEntries(DEPTHS.map(preset => {
      const sample = samples.get(`${index}:${preset}`);
      assert(sample, "Missing position/depth");
      const best = sample.candidates[0];
      const reference = source.reference.find(r => r.key === best.key);
      return [preset, { key: best.key, notation: best.notation, equity: best.equity,
        referenceLoss: reference?.loss ?? null, wallMs: sample.wallMs, computeMs: sample.computeMs,
        candidateCount: sample.candidates.length }];
    }));
    const comparisons = [["deep", "expert"], ["expert", "research"], ["deep", "research"]].map(([from, to]) => {
      const old = results[from], next = results[to];
      const baseline = samples.get(`${index}:${to}`);
      const scored = baseline.candidates.find(c => c.key === old.key)
        ?? grades.get(`${index}:${to}`)?.candidates.find(c => c.key === old.key);
      assert(scored, "Shallower winner was not scored at deeper depth");
      // Signed: a narrower deeper screen can omit a better shallower winner.
      const gain = next.equity - scored.equity;
      const paired = old.referenceLoss != null && next.referenceLoss != null;
      return { from, to, changed: old.key !== next.key, deeperEquityGain: gain,
        referenceGain: paired ? old.referenceLoss - next.referenceLoss : null,
        omittedByDeeperScreen: !baseline.candidates.some(c => c.key === old.key),
        shallowerAtDeeperEquity: scored.equity,
        extraWallMs: next.wallMs - old.wallMs };
    });
    const fourPly = samples.get(`${index}:research`), extra = grades.get(`${index}:research`);
    const atFour = Object.fromEntries(DEPTHS.map(p => [p,
      fourPly.candidates.find(c => c.key === results[p].key)?.equity
        ?? extra?.candidates.find(c => c.key === results[p].key)?.equity,
    ]));
    assert(Object.values(atFour).every(Number.isFinite));
    return { index, topic: source.topic, line: source.line, key: source.key, results, comparisons,
      choicesScoredAtFourPly: atFour };
  });
  const groups = ["all", ...new Set(rows.map(r => r.topic))].map(topic => {
    const group = topic === "all" ? rows : rows.filter(r => r.topic === topic);
    const common = group.filter(r => DEPTHS.every(p => r.results[p].referenceLoss != null));
    return { topic, n: group.length, commonReferenceN: common.length,
      stability: {
        sameAllDepths: group.filter(r => new Set(DEPTHS.map(p => r.results[p].key)).size === 1).length,
        changedAtThreeThenReturnedToTwoAtFour: group.filter(r => r.results.deep.key !== r.results.expert.key && r.results.deep.key === r.results.research.key).length,
        threeDistinctChoices: group.filter(r => new Set(DEPTHS.map(p => r.results[p].key)).size === 3).length,
      },
      choicesComparedAtFourPly: {
        twoToThree: signs(group.map(r => r.choicesScoredAtFourPly.expert - r.choicesScoredAtFourPly.deep)),
        threeToFour: signs(group.map(r => r.choicesScoredAtFourPly.research - r.choicesScoredAtFourPly.expert)),
        twoToFour: signs(group.map(r => r.choicesScoredAtFourPly.research - r.choicesScoredAtFourPly.deep)),
      },
      timing: DEPTHS.map(preset => ({ preset,
        wallMs: distribution(group.map(r => r.results[preset].wallMs)),
        computeMs: distribution(group.map(r => r.results[preset].computeMs)),
        underOneSecond: group.filter(r => r.results[preset].wallMs <= 1000).length,
        candidates: distribution(group.map(r => r.results[preset].candidateCount)) })),
      referenceLoss: DEPTHS.map(preset => ({ preset,
        covered: distribution(group.map(r => r.results[preset].referenceLoss).filter(x => x != null)),
        commonCovered: distribution(common.map(r => r.results[preset].referenceLoss)) })),
      comparisons: [0, 1, 2].map(i => {
        const c = group.map(r => r.comparisons[i]);
        const changed = c.filter(x => x.changed);
        const paired = c.filter(x => x.referenceGain != null);
        const pairedChanged = changed.filter(x => x.referenceGain != null);
        const from = c[0].from, to = c[0].to;
        return { from, to, n: group.length, changed: changed.length, changedPercent: 100 * changed.length / group.length,
          deeperEvaluation: signs(changed.map(x => x.deeperEquityGain)),
          allPositionMeanDeeperGain: mean(c.map(x => x.deeperEquityGain)),
          historicalReference: signs(paired.map(x => x.referenceGain)),
          historicalReferenceChanged: signs(pairedChanged.map(x => x.referenceGain)),
          omittedShallowerWinner: c.filter(x => x.omittedByDeeperScreen).length,
          omittedBetterWinner: c.filter(x => x.omittedByDeeperScreen && x.deeperEquityGain < -EPSILON).length,
          extraWallMs: distribution(c.map(x => x.extraWallMs)),
          ratioOfMeanWallTimes: mean(group.map(r => r.results[to].wallMs)) / mean(group.map(r => r.results[from].wallMs)),
        };
      }),
    };
  });
  return { schema: 1, engine: report.engine, startedAt: report.startedAt, finishedAt: report.finishedAt,
    browser: report.browser, environment: report.environment, environmentEnd: report.environmentEnd,
    method: report.method, corpusSha256: report.corpusSha256,
    timingCaveats: [
      "Background applications remain active; one timing sample per position/depth is not a controlled repeated-performance experiment.",
      ...(report.environment?.battery?.split("\n")[0] !== report.environmentEnd?.battery?.split("\n")[0]
        ? ["Power source changed during the run. Timing observations mix power conditions; inspect the recorded start/end environment."] : []),
    ],
    quantiles: "Linear interpolation across different corpus positions, one timing sample each; not within-position jitter percentiles.",
    equity: "Cubeless money equity. Positive gain favors the deeper preset. Common-depth gaps use both choices evaluated at the deeper depth. Historical reference gains use only pairs with both choices covered. Neither is exact ground truth.",
    screening: "2 ply scores every legal result. 3 ply: at least two, up to eight within 0.080 of the 2-ply best. 4 ply: at least two, up to four within 0.040. Omitted 3-ply winners are explicitly graded at 4 ply outside baseline timing; defaults are preserved.",
    supplementalGrades: report.supplementalGrades.length,
    startupWallMs: distribution(report.samples.map(s => s.startupWallMs).filter(Number.isFinite)),
    forcedPositions: rows.filter(r => r.results.deep.candidateCount === 1).length,
    groups, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2] || "backgammon/test-results/depth-study/results.json";
  const output = process.argv[3] || "backgammon/test-results/depth-study/summary.json";
  const report = JSON.parse(fs.readFileSync(input));
  const corpus = JSON.parse(fs.readFileSync("backgammon/data/accuracy-reference.json"));
  const result = summarize(report, corpus);
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result.groups, null, 2));
}
