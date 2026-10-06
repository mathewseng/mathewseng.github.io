// SPDX-License-Identifier: GPL-3.0-or-later
// Usage: node backgammon/scripts/collect-reference.mjs /path/to/decompressed/bm/files
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseBenchmarkMove } from "./benchmark-reference.mjs";
const dir = process.argv[2];
if (!dir)
  throw new Error(
    "Supply a directory containing contact.bm, race.bm, crashed.bm from GNUbg 1.00 benchmarks.",
  );
const items = [],
  sources = [];
for (const topic of ["contact", "race", "crashed"]) {
  const filename = path.join(dir, topic + ".bm"),
    data = fs.readFileSync(filename),
    rows = data.toString().split("\n");
  const moves = rows
    .map((line, i) => ({ line, number: i + 1 }))
    .filter((r) => r.line.startsWith("m "));
  sources.push({
    topic,
    url: `https://alpha.gnu.org/gnu/gnubg/nn-training/1.00/benchmarks/${topic}.bm.bz2`,
    mirror: `https://www.nic.funet.fi/index/gnu/alpha/gnu/gnubg/nn-training/1.00/benchmarks/${topic}.bm.bz2`,
    sha256: createHash("sha256").update(data).digest("hex"),
    header: rows[0],
    records: moves.length,
  });
  for (let i = 0; i < 100; i++) {
    const record = moves[Math.floor((i * (moves.length - 1)) / 99)];
    items.push({
      topic,
      line: record.number,
      record: record.line,
      ...parseBenchmarkMove(record.line),
    });
  }
}
fs.writeFileSync(
  "backgammon/data/accuracy-reference.json",
  JSON.stringify({
    schema: 1,
    description:
      "100 evenly spaced checker decisions per published GNUbg class; 300 total. Historical cubeless money rollout reference, not exact truth, not an independent-engine or human Elo benchmark.",
    sources,
    items,
  }),
);
