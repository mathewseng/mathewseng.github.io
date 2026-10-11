// Validate recorded real-engine evidence without doing another expensive search.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { legalTurns, positionKey, assertState } from "../core/rules.mjs";
import { summarize } from "./summarize-depth-study.mjs";

const input = process.argv[2] || "backgammon/docs/depth-study-results.json";
const report = JSON.parse(fs.readFileSync(input));
const bytes = fs.readFileSync("backgammon/data/accuracy-reference.json");
assert.equal(createHash("sha256").update(bytes).digest("hex"), report.corpusSha256);
const corpus = JSON.parse(bytes);
const summary = summarize(report, corpus);
const positions = corpus.items.map(row => {
  assertState(row.state);
  return { key: positionKey(row.state), legal: new Set(legalTurns(row.state).map(t => t.key)) };
});
assert.equal(new Set(positions.map(r => r.key)).size, 300, "Repeated decision context");
for (const s of [...report.samples, ...report.supplementalGrades]) {
  assert.equal(s.positionKey, positions[s.index].key);
  assert(s.candidates.every(c => positions[s.index].legal.has(c.key)), "Illegal candidate result");
  assert.equal(s.backend, "simd");
  assert.equal(s.startup.fallback, false);
  if (s.preset === "deep") assert.equal(s.candidates.length, positions[s.index].legal.size, "Incomplete 2-ply list");
  if (s.type === "grade") assert(s.candidates.some(c => c.key === s.submittedKey), "Submitted move was not graded");
}
const old = JSON.parse(fs.readFileSync("backgammon/data/accuracy-report.json"));
const mismatch = summary.rows.filter(r => {
  const previous = old.rows.find(p => p.topic === r.topic && p.line === r.line && p.key === r.key);
  assert(previous, "Missing original reference-study row");
  return previous.results.deep.key !== r.results.deep.key;
});
console.log(JSON.stringify({ samples: report.samples.length, uniquePositions: positions.length,
  supplementalGrades: report.supplementalGrades.length, allCandidatesLegal: true,
  allTwoPlyListsComplete: true, allSIMD: true, previousTwoPlyMatches: 300 - mismatch.length,
  previousTwoPlyMismatches: mismatch.map(r => ({ topic: r.topic, line: r.line, key: r.key })),
}, null, 2));
