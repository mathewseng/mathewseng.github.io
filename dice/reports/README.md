# Fair Dice Payout Explorer

Published at `/dice/reports/`; `/dice/reports` resolves to the same directory on GitHub Pages. All assets use relative paths, including the module worker. No runtime packages, backend, or build step.

- `engine.mjs`: binomial weights, exact BigInt EV/checker math, bounded integer enumeration, filters, style metrics, and ranking.
- `worker.js`: isolated search; replacing a search terminates its worker so stale results cannot overwrite current filters.
- `app.js`, `index.html`, `styles.css`: responsive report, reference examples, schedule inspector, and custom checker.
- `tests/engine.test.mjs`: exact identities, large integers, intentionally unfair schedules, independent brute-force comparison, pruning/filter correctness, search budgets, and rankings.
- `tests/browser.cjs`: assembled-site checks for the directory route, actual worker, interactions, mobile layout, keyboard focus, cancellation, and checker repair.

## Search and precision

The search bounds every payout between `minP0` and `maxPayout`, restricting the initial payout further to `maxP0`. The strict toggle requires each successive payout to increase. Default settings disallow zero payouts but permit negative intermediate payouts. Turning off strict order permits decreasing payouts as well as ties.

Enumerate the first N payouts, solve the last using its unit weight, and bound every intermediate choice by the minimum/maximum attainable remaining weighted sum. All search values are safe integers: N ≤ 6, initial bounds within ±10,000, and maximum payout ≤ 1,000,000. Any partial weighted sum has magnitude at most 46,656,000,000, below 2^53−1. The independent checker accepts integer strings up to 100 digits and uses BigInt throughout its EV, final-payout repair, and decimal formatting.

Each worker stops after 600,000 candidate nodes or approximately 2.5 seconds. Round-robin losses and coprime traversal of each integer interval distribute partial searches across the bounds; this is a deterministic exploratory search, not a uniform random sample. Partial coverage is always labeled. Default searches for all five dice counts are exhaustive. Rankings apply only to explored candidates. Retain the best 800 representatives whenever the pool exceeds 1,600; the final result count is capped at 200, so discarded rows cannot affect that ranking.

Recommended groups schedules by initial payout, floor(log2(maximum payout)), and normalized intermediate payouts binned into eighths. Each family keeps its highest-scoring representative. Other rankings do not group. Featured schedules are separately labeled unranked references and appear only when they pass current filters. They receive no ranking bonus.

All metric formulas and the weighted recommendation heuristic are documented in the page’s expandable math reference. Smoothness and steepness describe payout shape, not the chances of winning. Win probability counts positive net payouts; edge uses the initial loss magnitude as a stake and is undefined when the initial payout is nonnegative.

## Checks

```sh
node --test dice/reports/tests/engine.test.mjs
node scripts/run-tests.mjs
sh scripts/assemble-site.sh _site
node dice/reports/tests/browser.cjs
```

Browser tooling uses the repository’s `launchQuietBrowser` helper and writes screenshots to the system temporary directory. The validation workflow runs this browser check against the same assembled artifact used in deployment.
