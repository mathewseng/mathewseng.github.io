/** Compare checker training trials on identical source-frame holdouts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const [controlDir, handoffDir, output] = process.argv.slice(2);
assert(controlDir && handoffDir && output, 'Supply both trial directories and the output file.');

function samples(dir) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'validation.json'), 'utf8'));
  const labels = JSON.parse(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8'));
  const byCrop = new Map(data.tests.map(test => {
    const label = labels[test.index];
    return [`${label.clip}:${label.frame}:${label.target}`, { ...test, label }];
  }));
  assert.equal(byCrop.size, data.heldOut);
  return { data, byCrop };
}

const control = samples(controlDir);
const handoff = samples(handoffDir);
assert.deepEqual([...control.byCrop.keys()].sort(), [...handoff.byCrop.keys()].sort());
const errors = [];
for (const [key, sample] of handoff.byCrop) {
  const earlier = control.byCrop.get(key);
  assert.equal(earlier.expected, sample.expected);
  assert.equal(earlier.baseline, sample.baseline);
  if ([sample.baseline, earlier.candidate, sample.candidate].every(count => count === sample.expected)) continue;
  const { game, clip, frame: sourceFrame, target } = sample.label;
  errors.push({ game, clip, sourceFrame, point: target + 1, expected: sample.expected,
    current: sample.baseline, control: earlier.candidate, trial: sample.candidate });
}
const { data } = handoff;
const result = { addedCrops: data.training - control.data.training, heldOut: data.heldOut,
  current: data.baselineCorrect, control: control.data.candidateCorrect, trial: data.candidateCorrect, errors };
fs.writeFileSync(output, JSON.stringify(result) + '\n');
console.log(JSON.stringify(result));
