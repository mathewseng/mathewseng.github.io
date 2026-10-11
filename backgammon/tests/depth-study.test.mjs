import test from "node:test";
import assert from "node:assert/strict";
import { DEPTHS, distribution, summarize } from "../scripts/summarize-depth-study.mjs";
import { parseBenchmarkMove } from "../scripts/benchmark-reference.mjs";

function fixture() {
  const corpus = { items: ["contact", "race", "crashed"].map((topic, index) => ({
    topic, key: `position-${index}`, line: index + 10,
    reference: [{ key: "A", loss: 0.02 }, { key: "B", loss: 0 },
      ...(index === 2 ? [] : [{ key: "C", loss: 0.01 }])],
  })) };
  const sample = (index, preset, candidates, type = "sample") => ({
    index, key: corpus.items[index].key, topic: corpus.items[index].topic, line: corpus.items[index].line,
    type, preset, settings: { plies: DEPTHS.indexOf(preset) + 2, cubeful: false }, engine: "test",
    wallMs: [100, 1000, 10000][DEPTHS.indexOf(preset)], computeMs: 99,
    candidates: candidates.map(([key, equity]) => ({ key, equity, notation: `${key}-move` })),
  });
  const report = { engine: "test", samples: [], supplementalGrades: [] };
  for (let index = 0; index < 3; index++) {
    report.samples.push(sample(index, "deep", [["A", 0.8], ["B", 0.7], ["C", 0.6]]));
    report.samples.push(sample(index, "expert", [["B", 0.9], ["A", 0.89], ["C", 0.88]]));
    report.samples.push(sample(index, "research", [["C", 0.97], ["A", 0.94]]));
    report.supplementalGrades.push(sample(index, "research", [["B", 0.98], ["C", 0.97], ["A", 0.94]], "grade"));
  }
  return { report, corpus };
}

test("depth study compares choices at the SAME deeper depth and preserves a screening loss", () => {
  const { report, corpus } = fixture();
  const result = summarize(report, corpus, { expectedCount: 3 });
  const all = result.groups[0];
  assert.equal(all.comparisons[0].changed, 3);
  assert(Math.abs(all.comparisons[0].deeperEvaluation.meanGain - 0.01) < 1e-10);
  assert(Math.abs(all.comparisons[1].deeperEvaluation.meanGain + 0.01) < 1e-10);
  assert.equal(all.comparisons[1].omittedShallowerWinner, 3);
  assert.equal(all.comparisons[1].omittedBetterWinner, 3);
  assert.equal(result.rows[0].results.research.key, "C", "Supplemental grading must not change the default winner");
  assert.equal(all.timing[2].wallMs.mean, 10000, "Supplemental grading must not enter default timings");
  assert.equal(all.comparisons[1].ratioOfMeanWallTimes, 10);
});

test("reference coverage uses paired denominators and never turns missing values into zero", () => {
  const { report, corpus } = fixture();
  const all = summarize(report, corpus, { expectedCount: 3 }).groups[0];
  assert.equal(all.commonReferenceN, 2);
  assert.equal(all.referenceLoss[2].covered.n, 2);
  assert.equal(all.comparisons[1].n, 3);
  assert.equal(all.comparisons[1].historicalReference.n, 2);
  assert.equal(all.comparisons[1].historicalReference.worse, 2);
  assert.equal(all.comparisons[0].historicalReference.better, 3);
  assert.equal(all.referenceLoss[0].commonCovered.n, 2);
});

test("historical reference uses stored rollout gaps, independently of the new engine equities", () => {
  const key = "OAHDPAABDAOAHDPAABDA";
  const parsed = parseBenchmarkMove(`m ${key} 3 1 ${key} 0.120 ${key} 0.003`);
  assert.equal(parsed.reference[0].equity, 0.120);
  assert.equal(parsed.reference[0].loss, 0);
  assert(Math.abs(parsed.reference[1].equity - 0.117) < 1e-12);
  assert.equal(parsed.reference[1].loss, 0.003);
  const { report, corpus } = fixture();
  const before = summarize(report, corpus, { expectedCount: 3 }).groups[0].referenceLoss;
  // A different numerical scale/depth estimate must not change the historical
  // reference gap when the selected resulting boards remain the same.
  for (const sample of [...report.samples, ...report.supplementalGrades])
    for (const candidate of sample.candidates) candidate.equity -= 0.5;
  assert.deepEqual(summarize(report, corpus, { expectedCount: 3 }).groups[0].referenceLoss, before);
});

test("equivalent move notation does not count as a changed resulting position", () => {
  const { report, corpus } = fixture();
  const deeper = report.samples.find(s => s.index === 0 && s.preset === "expert");
  deeper.candidates = [{ key: "A", notation: "different route to A", equity: 0.9 }];
  const result = summarize(report, corpus, { expectedCount: 3 });
  assert.equal(result.groups[0].comparisons[0].changed, 2);
  assert.equal(result.rows[0].comparisons[0].deeperEquityGain, 0);
});

test("incomplete samples, mixed versions, duplicate measurements and ungraded omissions are rejected", () => {
  for (const mutate of [
    r => r.samples.pop(),
    r => { r.samples[0].engine = "other"; },
    r => { r.samples[0] = r.samples[1]; },
    r => { r.supplementalGrades = []; },
    r => { r.samples[0].key = "wrong-position"; },
    r => { r.samples[0].candidates[0].equity = NaN; },
    r => { r.samples[0].settings.cubeful = true; },
  ]) {
    const { report, corpus } = fixture();
    mutate(report);
    assert.throws(() => summarize(report, corpus, { expectedCount: 3 }));
  }
});

test("distribution quantiles interpolate across the observed positions; empty stays unknown", () => {
  assert.deepEqual(distribution([]), { n: 0, mean: null, median: null, p90: null, p95: null, min: null, max: null });
  const actual = distribution([10, 0, 30, 20]);
  assert.equal(actual.mean, 15);
  assert.equal(actual.median, 15);
  assert.equal(actual.p90, 27);
  assert(Math.abs(actual.p95 - 28.5) < 1e-10);
});
