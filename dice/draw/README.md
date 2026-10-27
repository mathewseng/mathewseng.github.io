# Draw Dice

`/dice/draw/` is a separate hold-and-reroll game linked from the Dice hub. Static ES modules; no runtime dependencies or build step. Two through seven independent fair d6, one initial roll and at most one reroll. Any number may be held, including all. Rerolled faces may repeat.

## Scoring and settlement

- **Dice cribbage** (default): every physical pair scores 1; every nonempty subset totaling six scores 1, including a single six. Only longest consecutive runs of three or more score their length, multiplied by the product of face counts. Runs do not wrap. The optional “Every run” rule also counts nested shorter runs. No flushes or other card bonuses.
- **Dice poker**: highest paying matching category only, with editable returns from 0–1,000 per unit stake. Patterns can be subsets; a full house needs different triple/pair faces. Available straights span 3–6 consecutive distinct faces, constrained by the hand size. Zero disables a category; a longer straight can qualify for a shorter one. Defaults are practice presets, not fair schedules imported from the single-roll explorer.
- **Yahtzee-style**: a single-hand variation, not a full scorecard or three-roll game. Best of chance (sum), trips/quads (sum), full house (25), 3/4/5/6-straights (20/30/40/50), 5/6/7-alike (50/75/100). Chance applies at every hand size.

For point scoring, **Capped loss** has net `max(0, points − fee) − 1`, matching Video Poker's convention that return includes the stake. **Points − fee** has net `points − fee`. Poker has net `return − 1`. Fees are editable integers from 0–200. Presets are not calibrated for fairness. Optional doubling multiplies the entire net result by two and requires rerolling at least one die. Standing cannot double.

`engine.mjs` separates scoring, settlement, rejection-sampled randomness, round transitions, and exact hand solving. `worker.js` enumerates all holds and all replacement face multisets with multinomial weights, choosing maximum expected net PnL. Every initial hand is solved exactly through seven dice; there is no full-game fairness claim. Single stake wins ties, followed by keeping more dice.

`app.js` saves settings per variant, the active hand and holds, session PnL, and the last 12 results to localStorage. The final sampled roll and its settlement are saved before visual animation. Settings remain available for read-only review during a hand; editing and reset lock until settlement; stale worker results are canceled. Storage failure leaves the game playable in memory. Dice are native pressed-state buttons with labels, keyboard operation, and reduced-motion support.

The strategy panel ranks distinct holds by exact net EV, including optional doubled draws. It shows the current hold, best available EV, and expected value given up. Equivalent holds of identical faces share a row. Selecting a row applies its hold; a doubled option still needs the explicit **Double & reroll** action. After settling a solved hand, the panel retains the opening roll and actual decision for review until the next hand or reload.

Desktop keeps the table and strategy side by side with independently scrolling panels. Tablet and phone layouts stack; short screens keep the action bar docked, and opening a hand brings all dice above it. Settings use a scrolling body with persistent Close/Apply controls. All dice and primary controls support at least 44px targets. `../display.js` shares a persistent 2D/3D preference with payout and matchup play. Flat dice remain the default here; 3D uses the existing solid dice renderer, with the scored top face also labeled below the die. Display changes do not alter holds, sampled faces, scoring, or settlement.

## Checks

```sh
node --test dice/draw/tests/engine.test.mjs
sh scripts/assemble-site.sh _site
node dice/draw/tests/browser.cjs
node dice/draw/tests/responsive.cjs
SHELL_PAGES=/dice/,/dice/draw/ node scripts/shell-browser.cjs
```

The scoring tests independently enumerate every subset for all unordered hands of 2–7 dice. Solver decisions are compared with ordered brute-force draws. The browser test checks the assembled modules/worker, holding, doubling, settlement, refresh, presets, all sizes and scorers, invalid form values, keyboard operation, animations, and mobile layouts. The responsive suite covers nine portrait/landscape viewports from 320×568 through 1920×1080, both dice styles, 2/5/7 dice, visible EV results, read-only and long-paytable dialogs, keyboard holds, and enlarged text.
