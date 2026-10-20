# Independent confirmation of remaining XG disagreements

This experiment tests the 23 reply disagreements and opening 2–1 left by `jacoby-short-deep-v1`. It asks whether each previous GNUbg preference survives fresh sampling under the same rollout policy. It does not change evaluator parameters or silently replace the opening book.

## Completed result

All 48 moves finished 4,096 fresh trials (196,608 rollout trials; 6,144 batches). With the predeclared simultaneous 95% intervals:

| Cohort | Persistent preference against XG | Clear reversal toward XG | Unresolved |
| --- | ---: | ---: | ---: |
| 23 replies | 14 | 1 | 8 |
| Opening 2–1 | 1 | 0 | 0 |
| All 24 pairs | 15 | 1 | 8 |

The fresh mean favors XG in three pairs, but only one reversal is statistically clear after the correction. Ordinary, unadjusted 95% intervals classify 17 persistent, two reversed and five unresolved; the primary result uses the more conservative familywise intervals above. These are diagnostic counts on selected disagreements, not a new book-wide accuracy percentage.

Opening 2–1 consistently favors **splitting** (`24/23 13/11`) over **slotting** (`13/11 6/5`) in this pipeline. Fresh equities are +0.0038125 and +0.0001822 respectively: a split-minus-slot gap of **+0.0036303**, with simultaneous interval **[+0.0012206, +0.0060399]**. The ordinary 95% interval is [+0.0021131, +0.0051475]. XG's corresponding gap is **−0.0079**, favoring slotting. Our split estimate is close to XG's +0.0036; the slot estimate remains much lower than XG's +0.0115. More samples have made this disagreement clearer rather than removed it.

The largest persistent reply gap is **4–4 after a slotted 4–1 (41$)**: our previous move leads by +0.0232158, with simultaneous interval [+0.0195533, +0.0268783], while XG prefers the other move by 0.0113. The clear reversal is **5–4 after 6–1 makes the bar point (61P)**: the previous choice now trails XG's choice by 0.0049500, with interval [-0.0079376, -0.0019625]. Exact values and both moves are in the downloadable result and report table.

This is evidence of systematic policy/evaluation differences in the persistent cases. It does not identify the neural weights as the sole cause: the rollout still depends on its simulated checker/cube choices, filtering and five-turn endpoint. Eight replies remain statistically unresolved. The two engines' different policies and XG reference uncertainty remain relevant; increasing the trial count alone cannot remove systematic differences.

## Fixed experiment

Each position has exactly two candidates: the previous Short/deep leader and the published XG leader. Those pairs were selected from the completed 512-trial experiment before the fresh run. Every candidate receives **4,096 new trials**, split into 128 independent batches of 32, for **196,608 rollout trials** and **6,144 batch records**. All positions finish the fixed sample count; there is no significance-driven stopping, winner selection from the new samples, or pooling with the selection sample.

Candidate pairs share each batch seed. The runner checks every actual trial seed against all seeds in the earlier experiment and every other diagnostic position. This avoids the subtle error of changing the base seed while retaining overlapping per-trial seeds. The actual seed is `(position base + 65,536 × batch + 256 × trial-within-batch) mod 2³²`, matching the engine’s `trial << 8` offset. Seed generation, fixed pairs, build hashes, source signature and policy are preserved in `rollout-diagnostic-inputs.json`.

The engine remains the corrected GNUbg bg7 native build. Short/deep uses checker/cube 2/2 for the first two simulated turns, then 1/2, and truncates after five turns with a two-ply endpoint. Both players use those policies, normal move filters and variance reduction. Money play uses Jacoby with beavers disabled. These settings are identical to the earlier comparison, so a changed preference can be attributed to new sampling rather than a policy change.

## How to read the result

The signed contrast is **previous GNUbg choice minus XG choice**, in current-cube equity units. Positive favors our previous choice; negative favors XG's choice. Each paired batch difference retains the covariance from shared dice. Its standard error is the sample standard deviation of the 128 batch differences divided by √128.

The full result includes an ordinary two-sided 95% Student-t interval (127 degrees of freedom) and a Bonferroni interval using α = 0.05/24. The latter controls the familywise error rate for the 24 fixed comparisons under the usual Student-t approximation. Its critical value is approximately 3.142773, versus 1.978820 for an ordinary 95% interval. The classification uses the corrected interval:

- **Persistent:** the entire interval is positive. Sampling noise alone is an inadequate explanation for this pipeline's preference at the stated confidence level.
- **Reversed:** the entire interval is negative. Fresh samples clearly favor XG's move, supporting sampling instability in the original choice.
- **Unresolved:** the interval crosses zero. This does not establish equality, prove the original difference was noise, or rule out a small systematic bias.

These intervals estimate Monte Carlo uncertainty only. They do not include bias from checker or cube policies, move filters, the neural evaluator, the truncated endpoint, rules or XG reference error. The sample is deliberately enriched for disagreements; it cannot estimate general playing strength or the overall error rate of either engine.

## Reference uncertainty and interpretation

All 24 compared XG pairs use published rollouts, although the broader opening reference includes XGRoller++ estimates as well. Their reported trial counts range from 15,552 to 414,720. The preferred-move policies are 3-ply checker/cube in 11 positions, 4-ply checker/cube in nine, 3-ply checker with XG Roller cube decisions in three, and XG Roller+ for opening 2–1. For example, [31P–11](https://www.extremegammon.com/OB/Replies_to_31P.html) uses 4-ply decisions. These are different continuation policies from our short rollout; ply labels also differ between engines. The saved source gives marginal confidence half-widths per move, not the paired covariance between moves. Overlap of those intervals is descriptive, not a paired significance test or a familywise bound. No fresh XG engine run is represented here.

For [opening 2–1](https://www.extremegammon.com/OB/Opening_in_unlimited_game.html), XG lists slotting (`13/11 6/5`) at +0.0115 ±0.0025 and splitting (`24/23 13/11`) at +0.0036 ±0.0021, from 46,656 trials. Its slotting preference is 0.0079. XG enables beavers; these GNUbg simulations do not. Earlier static three-ply rule checks found a negligible effect on these early positions, but that does not establish equivalence throughout a rollout.

A persistent difference identifies a limitation or disagreement in the combined evaluation pipeline, not a specific neural-network defect. A controlled next experiment would hold the candidate pair and dice fixed while varying one component, such as extending the truncation horizon or using full-game stronger checker/cube policies. Comparing different ply labels alone cannot isolate that cause.

## Artifacts and reproduction

The report is published at [Remaining disagreements](https://mathewseng.github.io/backgammon/reports/#rollout-diagnostic). `rollout-diagnostic-comparison.json` contains per-position paired intervals, classifications, marginal candidate estimates, previous 512-trial gaps, static three-/four-/five-ply contrasts and the XG comparison. `rollout-diagnostic-batches.jsonl.gz` preserves every independent batch with its seed. Hashes bind the decompressed raw records, input bytes, source comparison and build. The compact `data/` copy feeds the report.

From the repository root, with Node 22, Python 3 and the native build from [ROLLOUT-POLICIES.md](ROLLOUT-POLICIES.md):

```sh
BG_ROLLOUT_WORKERS=8 node backgammon/scripts/diagnose-rollout-disagreements.mjs
python3 backgammon/scripts/summarize-rollout-diagnostic.py --publish
node --test backgammon/tests/rollout-diagnostic.test.mjs
node backgammon/scripts/offline-manifest.mjs
```

`BG_ROLLOUT_NATIVE` selects the build directory and `BG_DIAGNOSTIC_OUT` selects a separate checkpoint directory. The fixed trial count is deliberately not a runtime knob. SIGTERM finishes active batches before stopping; rerunning resumes a matching plan. `--partial` permits local progress inspection but cannot publish. Publication rejects an incomplete sample, altered signature, duplicate identity, wrong seed, policy mismatch or reused trial seeds. Python's package-free Student-t calculation is checked against the analytic Cauchy distribution and known critical values; synthetic paired tests exercise covariance, sign and classification.

Only the two conflicting moves receive new estimates. Other retained alternatives have not received the same fresh sample, so the experiment is not a full reranking and does not replace the guide's complete candidate comparisons.

## Validation

All 326 Backgammon unit tests pass, including statistical fixtures, full-sample integrity, exact legal candidate positions, deployment and offline-manifest checks. The assembled report passes in Chromium 145, Firefox 146 and WebKit 26 at 1366px, 390px and 320px widths: all 24 rows, classification filters, displayed intervals, downloads, deep links and page overflow. Report screenshots were inspected. These are browser emulations rather than physical-device tests.
