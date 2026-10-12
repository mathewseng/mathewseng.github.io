// SPDX-License-Identifier: GPL-3.0-or-later
// No engine work: count third-turn positions already implied by the reply book.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { boardKey } from '../core/rules.mjs';
import { nextBoard, rowSteps, stateForBoard, thirdBranches } from './book-branches.mjs';
const dir = new URL('../engine/opening-book-data/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, dir)));
const index = read('index.json'), counts = [];
for (const window of [0, .020, .040]) {
  const boards = new Set(); let paths = 0;
  for (const [board, ref] of Object.entries(index.replies)) {
    for (const [roll, entry] of Object.entries(read(ref.file).rolls)) {
      const state = stateForBoard(board, [...roll].map(Number));
      for (const row of entry.rows.filter(r => entry.rows[0][1] - r[1] <= window + 1e-8)) {
        boards.add(boardKey(nextBoard(state, rowSteps(row)))); paths++;
      }
    }
  }
  counts.push({ replyEquityWindow: window, paths, thirdTurnBoards: boards.size, thirdTurnDecisions: boards.size * 21 });
}
const best = thirdBranches(index, read, Infinity);
console.log(JSON.stringify({ scope: 'All 34 near-best openings, then replies within the stated 3-ply equity window', counts,
  bestOpeningAndReply: { boards: best.length, decisions: best.length * 21 },
  published: { thirdBoards: Object.values(index.continuations || {}).filter(r=>r.turn===3).length,
    fourthBoards: Object.values(index.continuations || {}).filter(r=>r.turn===4).length,
    bytes: readdirSync(dir).reduce((n,f)=>n+statSync(new URL(f,dir)).size,0),
    ...index.continuationBuild },
}, null, 2));
