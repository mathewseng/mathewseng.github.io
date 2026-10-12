# Preserve the Expert leader in Research

The fixed 4-ply preset previously narrowed the 2-ply shortlist independently of the 3-ply result. It could discard a move that Expert had just recommended. The [300-position depth study](DEPTH-STUDY.md) recorded four such omissions. In contact position 58 (GNUbg benchmark source line 684608), the omitted move is better by **0.00545973 at four ply** than the old Research choice. That is a same-depth comparison, not a subtraction between a 3-ply and a 4-ply equity, and not evidence against perfect play.

Checker policy **`retain-expert-leader-v1`** preserves the old Research finalists and adds the default Expert shortlist's winner when needed. All finalists, including any submitted move, are evaluated at four ply. The default Expert shortlist remains the first two 2-ply results, plus up to eight within 0.080 equity; the base Research shortlist remains the first two, plus up to four within 0.040. This does not make Research exhaustive: other excluded moves can still be stronger.

There is no extra three-ply calculation when the Research shortlist already contains every possible Expert winner. Otherwise the adapter reuses completed three-ply scores, or calculates the missing scores. One context holds at most 32 candidate scores; the full position/rules/match identity and exact root-candidate set must match. Returned objects are cloned. Additional submitted moves cannot change a cached hint, and FIFO eviction bounds memory when grading many different moves. Worker termination discards these caches with the WASM instance.

Auto already retained its preceding winner. Its root screen, two-ply minimum, gap/cost policy and five-second estimated-next-stage limit are unchanged. Its completed three-ply work is now reused for Research's protection. Fixed Quick/Standard/Deep and cube analysis are unchanged. The native engine remains **`955555c69adebb1d7de23abc1018074158621168+bg6`**; there is no weight, native-search or opening-book change. The historical book keeps its pinned bg5 generator and original evaluations.

The result records `settings.screeningPolicy` and `screening.retainedLeader`, including the check depth, whether a finalist was added, and the leader's key/equity when it was actually calculated. The Solver's **Analysis method & limits** explains this check. Saved historical results are not relabeled or rewritten.

## Measurement method

`scripts/research-screen-study.cjs` compares the prior evaluator from commit `97e999e2a4fd3d637ee788ecd4dcb4b571162648` with the current evaluator, both using identical bg6 SIMD assets and full contexts. Each arm starts a fresh worker; paired order alternates between samples. Native initialization is measured separately and excluded from search timings. Local HTTP and browser compilation caches can be warm. The lookup book is deliberately bypassed.

The three workloads are separate:

- **Direct:** a fresh Research request, including its 2-ply screen and any required 3-ply check.
- **Progressive:** Expert completes first, then Research; reported stage time excludes that preceding Expert work, which is also recorded.
- **Automatic:** the same completed 0/1/2/3-ply prefix and preceding-winner retention used by Auto, followed by 4 ply. This forces the final stage for comparison; it does not measure how often Auto's actual stopping policy chooses that stage.

The cases are deliberately selected: the four historical omissions, one authored fixture each for opening/contact/race/bearoff, and an owned-cube seven-point match at scores 2–4. They are not a random sample of ordinary play. Small repeated samples support medians and observed ranges, not p95, confidence intervals or a phone-speed estimate. No CPU throttling was used. Battery power was observed during the Chromium run; ordinary background applications remained active. Treat small timing differences as noise.

[Paired measurements, inputs, hashes and all high-depth scores](research-screen-results.json) retain the evidence. To regenerate the larger original responses as well:

```sh
BG_SAMPLES=3 BG_OUTPUT=backgammon/test-results/research-screen/chromium.json \
  node backgammon/scripts/research-screen-study.cjs
```

`BG_BROWSER`, `BG_CASES`, `BG_MODES` and `BG_SUBMITTED=1` select a browser, case IDs, workloads and an arbitrary legal submitted move. Single-sample checks are validation runs, not benchmarks. The baseline commit must be present locally. `scripts/summarize-research-screen.cjs` takes completed report paths and writes the compact durable report; it omits repeated lower-depth excluded lists, retaining counts and source hashes.

## Recorded outcome

Apple M4 Pro, Darwin 25.5.0 arm64, desktop Chromium 145.0.7632.6; October 12, 2026, 07:09–07:29 UTC. The repeated run completed **81 paired comparisons**: nine cases × three workloads × three samples. An earlier single-sample check of the four omissions completed another 12 pairs. All **93 pairs** retained every old finalist and agreed on shared equity/probability/MWC values within **0.00000002** (acceptance tolerance 0.00001). All progressive/automatic continuations used **zero extra native 3-ply calls**. These runs were separate from the heavier test suite.

Each historical omission gained one finalist in Direct and Progressive Research. Only contact position 58 changed the recommendation, improving its own 4-ply equity by 0.00545973 in every repeat. The other three retained their existing leader. Automatic mode already preserved that candidate; its finalists and recommendations were unchanged in all nine cases. This deliberately selected set cannot estimate how often the fix improves ordinary play.

Median **Research stage seconds**, n=3 per cell (raw samples and ranges in the linked report):

| Case | Cold, before | Cold, now | After Expert, before | After Expert, now |
| --- | ---: | ---: | ---: | ---: |
| Omitted 58 · contact | 0.900 | 1.340 | 0.738 | 0.828 |
| Omitted 139 · race | 0.668 | 0.816 | 0.437 | 0.561 |
| Omitted 216 · crashed | 11.379 | 13.930 | 10.451 | 12.816 |
| Omitted 245 · crashed | 11.243 | 12.055 | 3.225 | 4.002 |
| Opening fixture | 20.190 | 21.585 | 20.033 | 20.011 |
| Contact fixture | 8.087 | 8.217 | 7.618 | 7.767 |
| Race fixture | 0.535 | 0.544 | 0.435 | 0.437 |
| Bearoff fixture | 0.0060 | 0.0072 | 0.0018 | 0.0019 |
| Owned-cube match | 10.954 | 11.025 | 10.779 | 10.740 |

Cold Research is slower when it needs the new check. Progressive reuse removes that repeated 3-ply work, but evaluating an additional finalist at 4 ply still costs time. The opening fixture's check adds about 1.4 seconds cold and no additional native work after Expert. Normal covered openings use the separate instant 3-ply book. Auto retains the same candidate/call counts; small timing changes in its measurements are not claimed as a speedup or a regression. Difficult manually requested four-ply positions remain much slower than one second.

## Regression coverage

`tests/research-screen.test.mjs` covers the missing leader, preservation of old finalists, actual four-ply calls for every displayed candidate, no unnecessary three-ply calculation, progressive reuse, returned-object mutation, match/rule/cube/root-set isolation, and eviction while grading moves outside the hint list. The regression failed against the old evaluator before the fix.

`tests/research-screen.cjs` uses the actual assembled worker and WASM. It checks the known omission, player reversal, an owned-cube match, cold versus progressive results, and legal submitted moves outside the hint list. It is part of `tests/browser.cjs`, including the repository's Chromium validation workflow. It also checks the method explanation in the real Solver at desktop and mobile sizes. This is numerical and integration evidence for a specific screening fix, not an independent playing-strength or Elo test.

Local validation completed with all 354 then-current site tests passing and the full assembled-site Chromium suite passing. The focused real-engine screening/UI suite also passed in Chromium 145.0.7632.6, Firefox and WebKit, with all three numerical contexts in each browser. Desktop 1366×768 and phone 390×844 screenshots were captured; the Chromium screenshots were inspected. These are desktop browsers and emulated phone viewports, not real-device measurements.
