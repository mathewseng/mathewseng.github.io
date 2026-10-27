# Draw Dice

`/dice/draw/` is a separate hold-and-reroll game linked from the Dice hub. Static ES modules; no runtime dependencies or build step. Two through seven independent fair d6, one initial roll and at most one reroll. Any number may be held, including all. Rerolled faces may repeat.

## Scoring and settlement

- **Dice cribbage** (default): every physical pair scores 1; every nonempty subset totaling six scores 1, including a single six. Only longest consecutive runs of three or more score their length, multiplied by the product of face counts. Runs do not wrap. The optional “Every run” rule also counts nested shorter runs. No flushes or other card bonuses.
- **Dice poker**: highest paying matching category only, with editable returns from 0–1,000 per unit stake. Patterns can be subsets; a full house needs different triple/pair faces. Available straights span 3–6 consecutive distinct faces, constrained by the hand size. Zero disables a category; a longer straight can qualify for a shorter one. Defaults are practice presets, not fair schedules imported from the single-roll explorer.
- **Yahtzee-style**: a single-hand variation, not a full scorecard or three-roll game. Best of chance (sum), trips/quads (sum), full house (25), 3/4/5/6-straights (20/30/40/50), 5/6/7-alike (50/75/100). Chance applies at every hand size.

For point scoring, **Capped loss** has net `max(0, points − fee) − 1`, matching Video Poker's convention that return includes the stake. **Points − fee** has net `points − fee`. Poker has net `return − 1`. Fees are editable integers from 0–200. Presets are not calibrated for fairness. Optional doubling multiplies the entire net result by two and requires rerolling at least one die. Standing cannot double.

`engine.mjs` separates scoring, settlement, rejection-sampled randomness, round transitions, and exact hand solving. `worker.js` enumerates all holds and all replacement face multisets with multinomial weights, choosing maximum expected net PnL. Every initial hand is solved exactly through seven dice; there is no full-game fairness claim. Single stake wins ties, followed by keeping more dice.

`app.js` saves settings per variant, the active hand and holds, session PnL, and the last 12 results to localStorage. The final sampled roll and its settlement are saved before visual animation. Settings and reset lock during an active hand; stale worker results are canceled. Storage failure leaves the game playable in memory. Dice are native pressed-state buttons with labels, keyboard operation, and reduced-motion support.

## Checks

```sh
node --test dice/draw/tests/engine.test.mjs
sh scripts/assemble-site.sh _site
node dice/draw/tests/browser.cjs
SHELL_PAGES=/dice/,/dice/draw/ node scripts/shell-browser.cjs
```

The scoring tests independently enumerate every subset for all unordered hands of 2–7 dice. Solver decisions are compared with ordered brute-force draws. The browser test checks the assembled modules/worker, holding, doubling, settlement, refresh, presets, all sizes and scorers, invalid form values, keyboard operation, animations, and mobile layouts.
