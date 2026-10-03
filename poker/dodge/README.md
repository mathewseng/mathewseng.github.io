# Dodge reports

Static, dependency-free report at `/poker/dodge/`. The table simulator, cube trainer, online rooms, and self-play reports live in [`simulator/`](simulator/README.md). Serve the repository over HTTP; no build or backend is required. All simulations are precomputed and checked into `data/hands.json`.

## Rules

Deal four distinct cards from a standard 52-card deck. Draw without replacement, retaining every card. After each draw, evaluate the best five-card hand among all cards held. Stop at the first straight or higher. Aces can be high or low (A2345); no wraparound straights.

`T` counts additional draws **including the bust card**, so safe draws are `T - 1`, total cards at bust are `T + 4`, and surviving `k` draws means `T > k`. Initial quads bust on draw one because evaluation requires five cards. Every runout busts by draw 13: 17 held cards must contain five of one suit.

Outcomes are mutually exclusive and use the highest category at the first bust. Royal flushes are separated from other straight flushes. Non-busting ranks have zero probability at the stopping time.

## Reports

- Hand explorer: all 16,432 suit-equivalent classes; rank/exact-hand search, texture filters, combined numeric rules, selectable columns, pagination, multi-column sorting with Shift, frozen hand column, filtered and full-population summary rows, and complete CSV export.
- Hand inspector: histogram, moments, quantiles, exact initial outs, outcome probabilities, Wilson intervals in outcome tooltips, and a complete table of survival and conditional hazard.
- Pin up to four hands for comparison. Pinned comparisons remain fixed across population filters.
- Population reports: survival and hazard curves, weighted texture comparisons, per-class scatter plot, overlapping rank-pair heatmap, and joint draw/outcome distributions.
- Game design lab: fixed-target survival payouts and an interactive draw simulator with exact next-card bust outs. These are mathematical scenarios, not a betting or payment interface.
- Phones: compact metric columns and 25 rows by default, collapsible filters, a hand report sheet that returns to your table position, and charts sized for readable labels. The rank matrix and card deck scroll horizontally. Column and row-count choices survive viewport changes.

Actual deal frequency weights each class by its number of represented combinations. Equal-class weighting is also available. Search accepts ranks (`AA`, `AKQJ`) or four exact cards (`As Kh Qd Jc`); exact hands are canonicalized across suit relabelings. Percent filters use percentage points (enter `20` for 20%); exported probabilities use 0–1 units.

Cards use the site's GTO Wizard-inspired four-color treatment. Each class maximizes spade count, then heart count, then diamonds and clubs. Ties assign larger rank masks first. Cards are always sorted A–2 and then spades, hearts, diamonds, clubs; this does **not** imply that an ace must be a spade when another suit occurs more often.

## Regenerate

From the repository root:

```sh
clang++ -O3 -std=c++17 -pthread poker/dodge/simulation/generate.cpp -o /tmp/dodge-sim
/tmp/dodge-sim --self-test
/tmp/dodge-sim 1000000 10 poker/dodge/data/hands.json
node --test poker/dodge/tests/report.test.mjs
python3 -m http.server 4173 --bind 127.0.0.1
```

Generator arguments are trials per class, worker threads, and output path. The checked-in dataset uses one million runouts per class: 16,432,000,000 total. It uses SplitMix64 with hashed per-class initial states and rejection sampling for unbiased card selection. Used cards are rejected to sample without replacement. The class seed is hashed before use to prevent neighboring classes from consuming shifted copies of the same PRNG stream. Counts are deterministic regardless of worker scheduling. Metadata timestamps and runtime naturally change.

Exact first-draw odds enumerate 48 cards; exact bust-by-two odds enumerate C(48,2) = 1,128 endpoints. Bust is monotonic as cards accumulate, making endpoint evaluation sufficient for cumulative bust probability. Histograms and later probabilities use simulation, so sampled early probabilities can differ slightly from the exact values.

## Data schema (version 1)

Top-level metadata includes generation time, base seed, RNG version, trials per class, total trials, class/deal counts, category labels, and column names. Each row is:

```text
[cards, combinations, exactFirstBustOuts, exactBustByTwoCombinations, jointDrawCategoryCounts]
```

- Card IDs are `4 * rankIndex + suitIndex`. `rankIndex` indexes `AKQJT98765432`; `suitIndex` indexes `shdc`.
- `combinations` is the suit-permutation orbit size. All 16,432 rows sum to 270,725 actual deals.
- Divide `exactFirstBustOuts` by 48 and `exactBustByTwoCombinations` by 1,128.
- The 78-element joint array is draw-major: index `(draw - 1) * 6 + category`. Categories are straight, flush, full house, four of a kind, straight flush (excluding royal), royal flush. Counts sum to `trialsPerHand` for every row.
- No per-trial card sequences are stored. All displayed estimates are derived from the count data.

## Precision and validation

Per-hand mean SE is `sqrt(populationVariance / (trials - 1))`. Approximate 95% mean intervals use ±1.96 SE. Aggregate SE is `sqrt(sum(normalizedWeight² * classSE²))`, using independently seeded class streams. Pooled distribution variance includes between-class variability; it is not the variance of the aggregate mean.

Per-hand category tooltips show Wilson 95% intervals. With one million samples, worst-case binomial 95% half-width is about 0.098 percentage points. Zero observations do not prove impossibility, and rare outcomes may have large relative errors. Selecting the highest of thousands of estimates introduces selection effects; near-tied hands should not be treated as conclusively ordered. Conditional hazard divides by the probability of reaching that draw and is unavailable when no simulated runouts reach it.

The C++ self-test checks all 2,598,960 five-card hands against standard category counts, all 24 suit relabelings of all 16,432 classes, total deal coverage, and evaluator boundaries. JavaScript tests cross-check the browser evaluator against the existing independent subset evaluator for larger hands, recompute every initial outs count and a sample of second-draw odds, verify Monte Carlo early probabilities, and compare aggregate survival against the existing exact rank-DP dataset in `poker/calculations/data/probabilities.json` through 13 held cards. Tests also cover weighting, filters, quantiles, payout definitions, and CSV scope.

Visual reference: [GTO Wizard aggregate reports](https://help.gtowizard.com/aggregate-reports-guide/). This page is an independent Dodge research tool.
