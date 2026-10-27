# Draw Dice

`/dice/draw/` is a separate hold-and-reroll game linked from the Dice hub. Static ES modules; no runtime dependencies or build step. Two through seven independent fair d6, one initial roll and at most one reroll. Any number may be held, including all. Rerolled faces may repeat.

## Scoring and settlement

- **Dice cribbage** (default): every physical pair scores 1; every nonempty subset totaling six scores 1, including a single six. Only longest consecutive runs of three or more score their length, multiplied by the product of face counts. Runs do not wrap. The optional “Every run” rule also counts nested shorter runs. No flushes or other card bonuses.
- **Dice poker**: highest paying matching category only, with editable returns from 0–1,000 per unit stake. Patterns can be subsets; a full house needs different triple/pair faces. Available straights span 3–6 consecutive distinct faces, constrained by the hand size. Zero disables a category; a longer straight can qualify for a shorter one. Defaults are practice presets, not fair schedules imported from the single-roll explorer.
- **Yahtzee-style**: a single-hand variation, not a full scorecard or three-roll game. Best of chance (sum), trips/quads (sum), full house (25), 3/4/5/6-straights (20/30/40/50), 5/6/7-alike (50/75/100). Chance applies at every hand size.

For point scoring, **Capped loss** has net `max(0, points − fee) − 1`, matching Video Poker's convention that return includes the stake. **Points − fee** has net `points − fee`. Poker has net `return − 1`. Fees are editable integers from 0–200. Presets are not calibrated for fairness. Optional doubling multiplies the entire net result by two and requires rerolling at least one die. Standing cannot double.

`engine.mjs` separates scoring, settlement, rejection-sampled randomness, round transitions, and exact hand solving. `worker.js` enumerates all holds and all replacement face multisets with multinomial weights, choosing maximum expected net PnL. Every initial hand is solved exactly through seven dice. Single stake wins ties, followed by keeping more dice.

`app.js` saves settings per variant, the active hand and holds, session PnL, and the last 12 results with their opening dice and actual hold/stake decisions to localStorage. The final sampled roll and its settlement are saved before visual animation. Settings remain available for read-only review during a hand; editing and reset lock until settlement; stale results cannot replace the current hand. Storage failure leaves the game playable in memory. Dice are native pressed-state buttons with labels, keyboard operation, and reduced-motion support.

Every opening roll automatically shows its optimal hold and exact net EV beneath the dice, without changing the player’s holds or scrolling the page. **View EVs** opens the strategy panel, which ranks distinct holds by exact net EV, including optional doubled draws. It shows the current hold, best available EV, and expected value given up. Equivalent holds of identical faces share a row. Selecting a row applies its hold; a doubled option still needs the explicit **Double & reroll** action. After settlement, the panel reviews the opening decision. Each Recent hands entry shows its opening and final dice, optimal hold/stake, best EV, played EV, and EV given up; expanding **Decision & EVs** shows the actual choice and the five best distinct alternatives.

`finishRound` snapshots the original dice and actual mask/stake before replacing faces, including the all-dice mask for Keep all. `hand-analysis.js` shares worker requests across the current hand and its history entry and caches up to 32 openings with their rules. A quick draw or next hand does not cancel the history calculation; callbacks check their target before updating. Only decision inputs are persisted, so refresh recomputes advice under each hand’s original rules rather than trusting stored EVs. Older or invalid records without a valid opening decision remain visible with an unavailable-advice label; their opening dice are never inferred from final dice.

Desktop keeps the table and strategy side by side with independently scrolling panels. Tablet and phone layouts stack; short screens keep the action bar docked, and opening a hand brings all dice above it. Settings use a scrolling body with persistent Close/Apply controls. All dice and primary controls support at least 44px targets. `../display.js` shares a persistent 2D/3D preference with payout and matchup play. Flat dice remain the default here; 3D uses the existing solid dice renderer, with the scored top face also labeled below the die. Display changes do not alter holds, sampled faces, scoring, or settlement.

## Rules EV

The game summary shows expected net units per hand for the active rules **before the opening roll**, assuming optimal holds, standing or rerolling once, and optional doubling when enabled. Settings preview this value before applying changes and compare every applicable payout mode at single stake and with optional doubling, using the same dice count, scoring, fee, and category returns. A one-roll baseline shows the value of keeping every opening hand. Preview edits do not alter the active game or its hand advice. Invalid inputs clear the preview; late worker results cannot replace a newer configuration.

`rules-ev.mjs` averages the best decision over all opening multisets, weighted by their multinomial probabilities. It shares replacement expectations between every partial face-count state: a state's value is the average of its six one-die extensions. Complete hands use the actual score and settlement. Values are scaled by `6^N`, so partial-state expectations and comparisons use integers; the final weighted numerator has denominator `6^(2N)`. Even at seven dice and the maximum category return, totals remain below JavaScript's exact integer bound. Doubling is only considered with at least one replacement die. This is an exact calculation, not a simulation or the average of hand EVs sampled during play.

`rules-worker.js` computes separately from the hand solver; `rules-preview.js` caches up to 48 effective rule configurations and guards asynchronous UI updates. Fees and paytable edits are debounced. The persistent settings preview remains visible while scrolling fields and comparisons. Positive EV favors the player; negative EV is an expected loss. Displayed decimals are rounded, with the exact fraction in the preview value's title. No fixed-stake return percentage is used for modes with variable fees or optional doubling.

## Checks

```sh
node --test dice/draw/tests/*.test.mjs
sh scripts/assemble-site.sh _site
node dice/draw/tests/browser.cjs
node dice/draw/tests/responsive.cjs
node dice/draw/tests/rules-browser.cjs
node dice/draw/tests/advice-browser.cjs
SHELL_PAGES=/dice/,/dice/draw/ node scripts/shell-browser.cjs
```

The scoring tests independently enumerate every subset for all unordered hands of 2–7 dice. Solver decisions are compared with ordered brute-force draws. The browser test checks the assembled modules/worker, holding, doubling, settlement, refresh, presets, all sizes and scorers, invalid form values, keyboard operation, animations, and mobile layouts. The responsive suite covers nine portrait/landscape viewports from 320×568 through 1920×1080, both dice styles, 2/5/7 dice, visible EV results, read-only and long-paytable dialogs, keyboard holds, and enlarged text.

Rules EV tests compare against independent ordered opening/draw enumeration and weighted results from the original hold solver through seven dice. Browser checks cover all scorers and dice counts, payout modes, both stakes, custom payouts, invalid and rapidly changing drafts, refresh, read-only hand review, and compact dialogs.

Automatic-advice checks cover immediate recommendations, held and doubled choices, Keep all, per-hand EV comparisons, saved/reloaded reviews, changed settings, delayed workers across multiple hands, reset races, legacy data and responsive history.
