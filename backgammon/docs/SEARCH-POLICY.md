# Adaptive depth: gap, stability and measured cost

Auto always completes at least two plies, normally tries three, and may reach four. A deeper stage is skipped only for a substantial, stable lead or an estimated cost above five seconds. It still publishes only completed evaluations and never combines move scores from different depths. This changes the search controller, not GNUbg's neural network or evaluation formulas. Current engine: `gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg6` (same numerical model); recorded studies below used bg5. Current policy: `minimum-two-v2`. The timing model and recorded one-second experiments below remain `gap-time-v1`; their latency figures do not describe the new policy.

## Does the best-versus-second-best gap help?

Yes, but the gap is a warning signal, not a confidence interval. On the previous 300 cubeless benchmark positions:

| Gap at 2 ply | Positions | Different leader at 3 ply | Change rate | Improvement >0.005 at 3 ply |
| --- | ---: | ---: | ---: | ---: |
| <0.005 | 93 | 24 | 25.8% | 10 |
| 0.005–<0.040 | 102 | 4 | 3.9% | 3 |
| ≥0.040 | 105 | 1 | 1.0% | 1 |

The large-gap exception improved equity by about 0.024 at 3 ply, so a large gap alone is unsafe. Requiring the same winner at 1 and 2 ply as well as a 2-ply gap ≥0.040 selected 103 positions; none changed leader by 4 ply. These are exploratory results on this corpus, not a universal guarantee. The deeper candidate set is screened: its runner-up is the second-best **evaluated** result, not necessarily the second-best of every legal turn.

At 3 ply, 22 of 29 subsequent leader changes came from gaps below 0.005. Some changes merely swap nearly tied alternatives. Improvement compares both choices at the **next depth**; it is not loss against perfect play or a subtraction between incompatible depth scores. The historical 4-ply comparisons include supplemental grading where the earlier winner was missing from the narrower shortlist. Source: `depth-study-results.json`, `accuracy-report.json`; the per-position rows and seven gap bands are in `search-policy-analysis.json`.

## Measuring and estimating the next stage

A new real-WASM run measured 360 decisions: all 300 reference positions plus 30 corresponding Jacoby money contexts and 30 seven-point match contexts (scores 2–4). Each case used a fresh worker, then progressively ran 0/1/2/3/4 ply with native and root caches reused. The previous winner was retained at every subsequent depth. This reproduces Auto's work more closely than isolated fixed-depth timings.

Environment: Apple M4 Pro, 14 cores, macOS/Darwin 25.5 arm64, AC power, Playwright WebKit 26.0, assembled `_site`, SIMD WASM, local HTTP, no artificial throttling. Recorded 2026-10-11 22:22–22:34 UTC. Startup is recorded separately. One sample per case/stage; HTTP and compilation caches may be warm. All 360 finished through 3 ply; 276 finished 4 ply. The other 84 were terminated after four seconds **for that stage**. Those observations are lower bounds, never exact four-second runtimes. Unobserved deeper results are not treated as zero.

A small log-time regression uses the current time per candidate, growth from the preceding depth, current/next candidate counts, contact, bar checkers, cube/match context and doubles. The current measured speed is an offset: uniformly slower measurements produce a proportionally larger prediction. This is useful for device adaptation but has not been validated on a physical iPhone.

Models were selected using four-fold cross-validation inside training groups. All contexts derived from the same source position stay in one group. The test partition has 68 cases/contexts from 58 unique source positions and is excluded from model fitting and stopping-threshold selection. Historical gap exploration had already examined the original 300 positions, so this is **not** an entirely untouched external accuracy validation. Training targets are capped at four seconds; predictions above that limit should only be read as expensive, not an exact ETA.

| Forecast | Held-out completed stages | Median factor error, last-time multiplier | Median factor error, model | 90th-percentile factor error, model |
| --- | ---: | ---: | ---: | ---: |
| 2 → 3 ply | 68 | 3.38× | 2.01× | 6.18× |
| 3 → 4 ply | 47 | 3.49× | 1.94× | 8.23× |

Factor error is `max(predicted/actual, actual/predicted)`. The 21 held-out censored 4-ply stages are excluded from these factor errors, not silently assigned exact durations. Both completed and censored rows can establish whether the actual stage exceeded one second. The model classified that threshold correctly for 67/68 and 54/68 cases respectively; a simple last-time multiplier got 65/68 and 55/68. Better numerical estimates do not imply better classification on every metric. Residual ranges are empirical completed-sample spread, not calibrated confidence intervals. Timing is a rough scheduling hint. The current five-second decision threshold lies beyond the four-second-capped training data, so a started stage may take materially longer than its estimate. The limit is an estimate, not a five-second wall-time promise.

## Current runtime policy: minimum-two-v2

1. Complete 0, 1 and **2 ply**, regardless of how long those stages take. Intermediate 0/1-ply updates are previews; they cannot resolve or cache a final Auto request.
2. At 2 or 3 ply, stop for a clear lead only if the same resulting board won the preceding depth, its preceding lead was ≥0.020, its current lead is ≥0.040 cubeless / ≥0.080 cubeful money, and the predicted next stage costs at least 50 ms. Cheap deeper work is still worthwhile.
3. Do not use the gap shortcut for match play or grading a submitted move: a settled winner does not settle a losing move's equity.
4. Skip a deeper stage when its estimated cost is **strictly greater than 5,000 ms**. Exactly five seconds is eligible. This is the cost of that next depth, not remaining time from a total allowance. Cube analysis uses observed stage growth for a rough estimate and does not use the checker gap shortcut.
5. Otherwise complete the next depth, up to 4 ply. Removing the old one-second timer ensures a slow device still reaches the two-ply minimum and can attempt three. Explicit cancellation still terminates the worker; initialization/engine failures and the existing five-minute job watchdog reject the request rather than return 0/1 ply as final Auto. A started deeper stage can exceed five seconds if underestimated.

Auto now always retains the preceding winner when the next root filter narrows, as well as the submitted move. This prevents an apparent leader change caused solely by removing the previous leader. Fixed presets keep their existing documented filters. Auto cache identity and saved settings include the policy version. The result footer reports the completed depth, reason for stopping, top-two gap and rough next-stage estimate. Fixed depths and rollouts remain available.

Current-policy verification passed 317 repository tests and assembled-site real-WASM checks in Chromium, Firefox and WebKit, including checker/cube minimum depth, complete-depth grading, cancellation/restart, rejection of shallow final responses, and the strict greater-than-five-seconds boundary. Desktop and mobile Solver screenshots were inspected. These are functional checks, not a new latency benchmark.

## Historical gap-time-v1 replay check

Replaying the measured stages against the same one-second deadline:

| Cases | Deadline-only mean | Gap/cost policy mean | Chosen move changed |
| --- | ---: | ---: | ---: |
| All 360 | 632 ms | 403 ms | 0/360 |
| 68 held-out cases/contexts | 678 ms | 370 ms | 0/68 |

The held-out saving is 45.5%; 24/68 return a shallower completed depth. This is a **trace replay**, not a live latency claim. Both choices are compared at the baseline's deepest completed depth, not to perfect play. Equal selected moves do not prove equal equity accuracy, probability calibration, or rollout agreement. Source: `search-policy-replay.json`. Runtime and corpus behavior can differ on other devices, rule contexts, unseen positions, or when system load changes.

## Historical gap-time-v1 live paired validation

A subsequent fresh-worker test ran both controllers on each of the 68 test cases, alternating which arm ran first. It used the real `EngineClient` and actual deadline termination in WebKit 26.0 on the same M4 Pro. The baseline changes only the stopping rule; both arms use the same root screening and previous-winner retention. Engine startup is excluded and individually recorded. One paired sample per case/context, with no CPU throttling or concurrent benchmark.

| Controller | Mean | Median | p95 across cases |
| --- | ---: | ---: | ---: |
| Deadline only | 687 ms | 1,000 ms | 1,002 ms |
| Gap/cost policy | 374 ms | 176 ms | 1,002 ms |

Mean latency fell **45.6%**. All 68 selected the same move; 24 ended at a shallower depth. Stops: 26 clear lead, 12 predicted cost, 10 deadline, 20 maximum depth. The slow tail stays around one second, as intended. These distributions are across the tested workload, not repeated-run reliability estimates for each position. Source: `search-policy-live.json`, including startup, per-stage metadata, full completed candidates, paired order, environment and source hashes. Results are from a desktop browser, not an iPhone.

Regression checks cover threshold safeguards, measured-speed scaling, canonical move identity, previous-winner retention, publication of completed stages, actual-move grading, cache identity, cancellation and restart. Real-worker checks passed in Chromium, Firefox and WebKit against `_site`; desktop (1366×768) and mobile-layout (390×844) Solver results were captured and inspected. The source-data verifier checks every recorded candidate against legal turns, all 1,716 completed stages, 84 censored stages, the 68 live pairs, asset hashes and reported means.

## Reproduce

The one-second replay and paired benchmark describe revision `f344694`. Run `replay-search-policy.mjs` and `search-policy-live.cjs` from that revision in a separate checkout; both deliberately reject a different runtime policy to avoid rewriting historical evidence with incompatible results. The other commands below apply to the current checkout. No new latency benchmark is claimed for `minimum-two-v2`.

```sh
node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
node backgammon/scripts/search-policy-study.cjs
# Inspect completed output, then copy to docs/search-policy-traces.json for fitting.
OPENBLAS_NUM_THREADS=1 python3 backgammon/scripts/analyze-search-policy.py
node backgammon/scripts/verify-search-policy.mjs
node backgammon/tests/search-policy-browser.cjs
node --test backgammon/tests/search-policy.test.mjs backgammon/tests/adaptive.test.mjs backgammon/tests/client.test.mjs
```

Fitting requires NumPy in development only. The browser loads a tiny fixed model, with no fitting, remote service, or additional dependency. Raw traces include input positions, settings, candidate keys/equities, individual timings, censoring, hardware/browser, revision and asset hashes. The original trace's adaptive-module hash predates the new stopping policy, intentionally: it measured all stages. WASM and evaluation bindings are unchanged. `search-policy-analysis.json` records the fixed group split, all model comparisons, training policy trials and predictions. The JS replay independently checks Python/JavaScript prediction parity on every recorded timing row. Keep a new run separate with `BG_OUTPUT` rather than mixing asset versions.
